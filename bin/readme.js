/**
 * # Kes: Making deployment with CloudFormation Fun
 *
 * Kes helps with managing and deploying AWS resources using CloudFormation.
 *
 * It makes it much easier to deploy lambda functions and create API gateway resources.
 *
 * ## Installation
 *
 * ```bash
 *   $ npm install -g kes
 *   $ kes -h
 *
 *    Usage: kes TYPE COMMAND [options]
 *
 *    Start a Kes project
 *
 *  Options:
 *
 *  -V, --version                 output the version number
 *  -p, --profile <profile>       AWS profile name to use for authentication
 *  --role <role>                 AWS role arn to be assumed for the deployment
 *  -c, --config <config>         Path to config file
 *  --env-file <envFile>          Path to env file
 *  --cf-file <cfFile>            Path to CloudFormation templateUrl
 *  -t, --template <template>      A kes application template used as the base for the configuration
 *  --kes-class <kesClass>        Kes Class override
 *  -k, --kes-folder <kesFolder>  Path to config folder
 *  -r, --region <region>         AWS region
 *  --stack <stack>               stack name, defaults to the config value
 *  -d, --deployment <deployment>  Deployment name, default to default
 *  -h, --help                    output usage information
 *
 *  Commands:
 *  cf [deploy|validate|compile]  CloudFormation Operations:
 *    create    Creates the CF stack (deprecated, start using deploy)
 *    update    Updates the CF stack (deprecated, start using deploy)
 *    upsert    Creates the CF stack and Update if already exists (deprected, start using deploy)
 *    deploy    Creates the CF stack and Update if already exists
 *    validate  Validates the CF stack
 *    compile   Compiles the CF stack
 *    lambda <lambdaName>                         uploads a given lambda function to Lambda service
 *
 * ```
 *
 * ## Setting Up the First Project
 *
 * Go to your project directory and run the following command.
 *
 *  ```bash
 *  $ npm init
 *  ```
 *
 * This will create a `.kes` folder on your project folder. It will include the following files:
 *
 * | file | description
 * | ---- | -------------
 * |`.env`| This optional file can hold your project secrets and should not be committed
 * |`cloudformation.template.yml`| A base CF template written with Mustache/Handlebar templating language
 * |`config.yml`| The main required configuration file for a kes deployment
 * |`kes.js`| An optional Kes class override that can change how Kes class is used
 *
 * The `cloudformation.template.yml` and `config.yml` are required files.
 * The variables in `config.yml` are parsed and used to generate the `cloudformation.yml`. By default,
 * the `default` section of the `config.yml` is parsed and used in `cloudformation.template.yml`. If
 * another deployment is specified in the `config.yml` the values of that deployment overrides the
 * values of `default`
 * file which is sent to AWS CloudFormation to create and udpate the stack.
 *
 * ### CF Stack Name
 * The Cloudformation stack name is the same as `stackName` in `config.yml`.
 *
 * ### Parameters
 *
 * To pass parameters to the CloudFormation template, use the `parameters` key in config.yml. Example:
 *
 * ```yaml
 * # config.yml
 * default:
 *   stackName: myStack
 *   parameters:
 *     - name: MyParameter
 *       value: someValue
 * ```
 *
 * ```yaml
 * # cloudformation.template.yml
 * AWSTemplateFormatVersion: '2010-09-09'
 * Description: 'stack: {{stackName}} | deployed by Kes'
 * Parameters:
 *   MyParameter:
 *     Type: String
 *     Description: 'My parameter'
 * ```
 *
 * ### CF Capabailities
 *
 * To pass capabilities such as `CAPABILITY_IAM` use `capabilities` key:
 *
 * ```yaml
 * # config.yml
 * default:
 *   stackName: myStack
 *   parameters:
 *     - name: MyParameter
 *       value: someValue
 *   capabilities:
 *     - CAPABILITY_IAM
 * ```
 *
 * ### CloudFormation Tagging
 *
 * To manage tags associated with your CloudFormation stack, use the `tags` key:
 *
 * ```yaml
 * # config.yml
 * default:
 *   tags:
 *     color: orange
 *     tree: oak
 * ```
 *
 * ### Lambda Functions
 * To add lambda functions, use `lambdas` key and add them as array object.
 * The lambda function code can be either a folder or file on your computer
 * or a zip file on aws.
 *
 * **Note:** In version 2.0.0 of kes, the lambda packaging is handled natively in nodejs.
 * If you point the `source` to a directory, the directory is saved at the root of the zip
 * package. This changes how handler path should be setup.
 *
 * For example, if the `index.js` is located at `/path/to/package/index.js` and
 * `source: /path/to/package/index.js`, the handler should be `handler: index.handler`.
 *
 * **Required Fields:**
 *   - name
 *   - handler
 *   - source/s3Source
 *
 * **Env Variables:**
 * You can add env variables to each lambda function as shown in the example below.
 *
 * **Example:**
 *
 * ```yaml
 * # config.yml
 * default:
 *   stackName: myStack
 *   parameters:
 *     - name: MyParameter
 *       value: someValue
 *   capabilities:
 *     - CAPABILITY_IAM
 *
 *   lambdas:
 *     - name: myLambda1
 *       handler: index.handler
 *       timeout: 200
 *       source: 'node_modules/someNpmPackage'
 *     - name: myLambda2
 *       handler: package.handler
 *       timeout:100
 *       s3Source:
 *         bucket: mybucket
 *         key: mylambda.zip
 *       envs:
 *         DEBUG: true
 * ```
 *
 * **Note:**
 *
 * Adding lambda functions in the config.yml has no effect unless you add
 * the relevant CF syntax to `cloudformation.template.yml`
 *
 * ### Handlebar Helpers
 * We use [Handlebar](http://handlebarsjs.com/) for templating a CF template.
 *
 * **Each**
 *
 * ```yaml
 * # config.yml
 * default:
 *   myArray:
 *     - name: name1
 *     - name: name2
 * ```
 *
 * ```yaml
 * # cloudformation.template.yml
 * Resources:
 *
 * {{# each myArray}}
 *   {{name}}:
 *     Type: SomeAWSResource
 * {{/each}}
 * ```
 *
 * **If/else**
 *
 * ```yaml
 * # config.yml
 * default:
 *   myArray:
 *     - name: name1
 *       runtime: python2.7
 *     - name: name2
 * ```
 *
 * ```yaml
 * # cloudformation.template.yml
 * Resources:
 *
 * {{# each myArray}}
 *   {{name}}:
 *     Type: SomeAWSResource
 *     Properties:
 *       Runtime: {{# if runtime}}{{runtime}}{{else}}nodejs6.10{{/if}}
 * {{/each}}
 * ```
 *
 * **Each for Objects**
 *
 * ```yaml
 * # config.yml
 * default:
 *   myArray:
 *     - DEBUG: true
 * ```
 *
 * ```yaml
 * # cloudformation.template.yml
 * Resources:
 *
 * {{# each myArray}}
 *   Lambda:
 *     Type: SomeAWSResource
 *     Properties:
 *       Environments:
 *         - {{@key}}: {{this}}
 * {{/each}}
 * ```
 *
 * ## Deployment
 *
 * To create a CF stack or update and existing one run
 * ```bash
 *  kes cf deploy 
 * ```
 *
 * ### Differenet deployment configurations
 *
 * You can configure different values for different deployments. For example you might want to configure your test deployment
 * differently from your staging and production deployments. Here is how to achieve it:
 *
 * ```yaml
 * # config.yml
 * default:
 *   stackName: myStack-test
 *   myArray:
 *     - DEBUG: true
 *
 * staging:
 *   stackName: myStack-staging
 *   myArray:
 *     - DEBUG: false
 * ```
 *
 * To deploy a stack with the `staging` configuration run:
 *
 * ```bash
 * kes cf deploy --deployment staging
 * ```
 *
 *
 * ## Deployment Using IAM Role
 *
 * You can specify an IAM role for the deployment using `--role` option or by setting `AWS_DEPLOYMENT_ROLE` environment variable.
 *
 * **Note:** You still need an aws user with AssumeRole permission for this to work
 *
 * ```bash
 * kes cf deploy --profile myUser --role arn:aws:iam::00000000000:role/myDeplymentRole
 * ```
 *
 * ### Updating One Lambda Function
 * To update one lambda function outside of CF
 *
 * ```bash
 *  kes lambda myLambda
 * ```
 *
 * ## Use Templates
 * Kes enables you to distribute your AWS applications built with kes using a concept called template. A template is essentially a `.kes` folder with
 * a `cloudformation.template.yml`, a `config.yml` and a `kes.js` if needed.
 *
 * The user of a template can point to your template folder with the `--template` flag and the kes command will use the template to build the cloudformation.yml.
 *
 * The user still has the option of creating her own `config.yml` and `cloudformation.template.yml`. Any variables in these files will override existing ones
 * in the template or append it if it doesn't exist.
 *
 * This setup gives users of the templates a great degree of flexibility and ownership.
 *
 */
