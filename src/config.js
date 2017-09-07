'use strict';

const fs = require('fs');
const has = require('lodash.has');
const startsWith = require('lodash.startswith');
const trim = require('lodash.trim');
const replace = require('lodash.replace');
const upperFirst = require('lodash.upperfirst');
const capitalize = require('lodash.capitalize');
const yaml = require('js-yaml');
const yamlinc = require('yaml-include');
const Mustache = require('mustache');
const utils = require('./utils');

/**
 * This class handles reading and parsing configuration files.
 * It primarily reads `stage.yml`, `config.yml` and `.env` files
 *
 * @example
 * const configurator = new Config('mystack', 'dev', '.kes/config.yml', '.kes/stage.yml', '.kes/.env');
 * const config = configurator.parse();
 *
 * @param {String} stack Stack name
 * @param {String} stage Stage name
 * @param {String} configFile path to the config.yml file
 * @param {String} stageFile path to the stage.yml file (optional)
 * @param {String} envFile path to the .env file (optional)
 * @class Config
 */
class Config {
  constructor(stack, stage, configFile, stageFile, envFile) {
    this.stack = stack;
    this.stage = stage;
    this.configFile = configFile;
    this.stageFile = stageFile;
    this.envs = utils.loadLocalEnvs(envFile);
  }

  /**
   * Generates configuration arrays for ApiGateway portion of
   * the CloudFormation
   *
   * @private
   * @static
   * @param  {Object} config The configuration object
   * @return {Object} Returns the updated configuration object
   */
  static configureApiGateway(config) {
    if (config.apis) {
      // APIGateway name used in AWS APIGateway Definition
      const apiMethods = [];
      const apiMethodsOptions = {};
      const apiDependencies = {};

      config.apis.forEach((api) => {
        apiDependencies[api.name] = [];
      });

      // The array containing all the info
      // needed to define each APIGateway resource
      const apiResources = {};

      // We loop through all the lambdas in config.yml
      // To construct the API resources and methods
      for (const lambda of config.lambdas) {
        // We only care about lambdas that have apigateway config
        if (lambda.hasOwnProperty('apiGateway')) {
          //loop the apiGateway definition
          for (const api of lambda.apiGateway) {
            // Because each segment of the URL path gets its own
            // resource and paths with the same segment shares that resource
            // we start by dividing the path segments into an array.
            // For example. /foo, /foo/bar and /foo/column create 3 resources:
            // 1. FooResource 2.FooBarResource 3.FooColumnResource
            // where FooBar and FooColumn are dependents of Foo
            const segments = api.path.split('/');

            // this array is used to keep track of names
            // within a given array of segments
            const segmentNames = [];

            segments.forEach((segment, index) => {
              let name = segment;
              let parents = [];

              // when a segment includes a variable, e.g. {short_name}
              // we remove the curly braces and underscores and add Var to the name
              if (startsWith(segment, '{')) {
                name = `${replace(trim(segment, '{}'), '_', '')}Var`;
              }

              name = upperFirst(name);
              segmentNames.push(name);

              // the first segment is always have rootresourceid as parent
              if (index === 0) {
                parents = [
                  'Fn::GetAtt:',
                  `- ${api.api}RestApi`,
                  '- RootResourceId'
                ];
              }
              else {
                // This logic finds the parents of other segments
                parents = [
                  `Ref: ApiGateWayResource${segmentNames.slice(0, index).join('')}`
                ];

                name = segmentNames.map(x => x).join('');
              }

              // We use an object here to catch duplicate resources
              // This ensures if to paths shares a segment, they also
              // share a parent
              apiResources[name] = {
                name: `ApiGateWayResource${name}`,
                pathPart: segment,
                parents: parents,
                api: api.api
              };
            });

            const method = capitalize(api.method);
            const name = segmentNames.map(x => x).join('');

            const methodName = `ApiGatewayMethod${name}${capitalize(method)}`;

            // Build the ApiMethod array
            apiMethods.push({
              name: methodName,
              method: method.toUpperCase(),
              cors: api.cors || false,
              resource: `ApiGateWayResource${name}`,
              lambda: lambda.name,
              api: api.api
            });

            // populate api dependency list
            try {
              apiDependencies[api.api].push({
                name: methodName
              });
            }
            catch (e) {
              console.error(`${api.api} is not defined`);
              throw e;
            }

            // Build the ApiMethod Options array. Only needed for resources
            // with cors set to true
            if (api.cors) {
              apiMethodsOptions[name] = {
                name: `ApiGatewayMethod${name}Options`,
                resource: `ApiGateWayResource${name}`,
                api: api.api
              };
            }
          }
        }
      }

      return Object.assign(Config, {
        apiMethods,
        apiResources: Object.values(apiResources),
        apiMethodsOptions: Object.values(apiMethodsOptions),
        apiDependencies: Object.keys(apiDependencies).map(k => ({
          name: k,
          methods: apiDependencies[k]
        }))
      });
    }

    return config;
  }

  /**
   * Sets default values for the lambda function.
   * if the lambda function includes source path, it does copy, zip and upload
   * the functions to Amazon S3
   *
   * @private
   * @static
   * @param  {Object} config The configuration object
   * @return {Object} Returns the updated configruation object
   */
  static configureLambda(config) {
    if (config.lambdas) {
      // Add default memory and timeout to all lambdas
      for (const lambda of config.lambdas) {
        if (!has(lambda, 'memory')) {
          lambda.memory = 1024;
        }

        if (!has(lambda, 'timeout')) {
          lambda.timeout = 300;
        }

        // add lambda name to services if any
        if (lambda.hasOwnProperty('services')) {
          for (const service of lambda.services) {
            service.lambdaName = lambda.name;
          }
        }

        if (!has(lambda, 'envs')) {
          lambda.envs = [];
        }

        // lambda fullName
        lambda.fullName = `${config.stackName}-${config.stage}-${lambda.name}`;
      }
    }

    return config;
  }

  /**
   * reads and parses stage.yml, merges the variables under default with
   * the specified stage and returns the it as a js object
   *
   * @private
   * @return {Object} returns the content of config.yml as a js object
   */
  parseStage() {
    let t;
    try {
      t = fs.readFileSync(this.stageFile);
    }
    catch (e) {
      if (e.message.includes('no such file or directory')) {
        console.log(`${this.stageFile} was not found. Skipping stage`);
        return {};
      }
      throw e;
    }

    Mustache.escape = (text) => text;
    const rendered = Mustache.render(t.toString(), this.envs);

    // convert to object from yaml
    const stageConfig = yaml.safeLoad(rendered, { schema: yamlinc.YAML_INCLUDE_SCHEMA });

    if (this.stage) {
      Object.assign(stageConfig.default, stageConfig[this.stage]);
    }
    return stageConfig.default;
  }

  /**
   * Parses the config.yml to js Object after passing it through variables set
   * in stage.yml
   *
   * @private
   * @param {Object} stageConfig the stage.yml object
   * @return {Object} returns configuration object
   */
  parseConfig(stageConfig) {
    const configText = fs.readFileSync(this.configFile, 'utf8');

    Object.assign(stageConfig, this.envs);
    Mustache.escape = (text) => text;
    let rendered = Mustache.render(configText.toString(), stageConfig);

    // load, dump, then load to make sure all yaml included files pass through mustach render
    const tmp = yaml.safeLoad(rendered, { schema: yamlinc.YAML_INCLUDE_SCHEMA });

    const tmp2 = yaml.dump(tmp);
    rendered = Mustache.render(tmp2, stageConfig);

    let config = yaml.safeLoad(rendered);

    if (this.stack) {
      config.stackName = this.stack;
    }

    if (this.stage) {
      config.stage = this.stage;
    }

    Object.assign(config, stageConfig);
    config = this.constructor.configureLambda(config);
    Object.assign(config, this.constructor.configureApiGateway(config));

    return config;
  }

  /**
   * Main method of the class. It parses a configuration and returns it
   * as a JS object.
   *
   * @example
   * const configInstance = new Config(null, null, 'path/to/config.yml', 'path/to/stage.yml', 'path/to/.env');
   * config = configInstance.parse();
   *
   * @return {Object} the configuration object
   */
  parse() {
    const stageConfig = this.parseStage();
    return this.parseConfig(stageConfig);
  }
}

module.exports = Config;