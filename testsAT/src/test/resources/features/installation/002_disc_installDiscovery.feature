@rest
Feature: Install Discovery

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  Scenario: [Basic Installation Discovery][01] Obtain postgreSQL ip and port
    Given I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].assignedHost' in environment variable 'postgresMD5_IP'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'postgresMD5_Port'
    And I wait '5' seconds

  Scenario: [Basic Installation Discovery][02] Create database for Discovery
    Given I connect with JDBC to database '${POSTGRES_FRAMEWORK_DEFAULT_DB:-postgres}' on host '!{postgresMD5_IP}' and port '!{postgresMD5_Port}' with user '${POSTGRES_FRAMEWORK_USER:-postgres}' and password '${POSTGRES_FRAMEWORK_PASSWORD:-stratio}'
    When I execute query 'CREATE DATABASE ${DISCOVERY_DATASTORE_DB:-discovery};'
    Then I close database connection

  @RunOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Discovery][03] Create config file
    Given I create file 'config_discovery_0.28.9.json' based on 'schemas/config_discovery_0.28.9.json' as 'json' with:
      | $.Service.cpus                        | REPLACE | ${DISCOVERY_SERVICE_CPUS:-1}                                             | number  |
      | $.Service.name                        | UPDATE  | ${DISCOVERY_SERVICE_NAME:-discovery}                                     | n/a     |
      | $.Service.instances                   | REPLACE | ${DISCOVERY_SERVICE_INSTANCES:-1}                                        | number  |
      | $.Service.mem                         | REPLACE | ${DISCOVERY_SERVICE_MEM:-2048}                                           | number  |
      | $.Service.virtualhost                 | UPDATE  | ${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}               | n/a     |
      | $.Service.force_pull_image            | REPLACE | ${DISCOVERY_SERVICE_FORCE_PULL_IMAGE:-true}                              | boolean |
      | $.Security.vault_host                 | UPDATE  | ${DISCOVERY_SECURITY_VAULT_HOST:-vault.service.paas.labs.stratio.com}    | n/a     |
      | $.Security.vault_port                 | REPLACE | ${DISCOVERY_SECURITY_VAULT_PORT:-8200}                                   | number  |
      | $.Security.instance_app_role          | UPDATE  | ${DISCOVERY_SECURITY_INSTANCE_APP_ROLE:-open}                            | n/a     |
      | $.Security.vault_token                | UPDATE  | !{vaultToken}                                                            | n/a     |
      | $.Network.network_segmentation        | REPLACE | ${DISCOVERY_NETWORK_SEGMENTATION:-true}                                  | boolean |
      | $.Network.network_name                | UPDATE  | ${DISCOVERY_NETWORK_NAME:-stratio}                                       | n/a     |
      | $.Datastore.host                      | UPDATE  | !{postgresMD5_IP}                                                        | n/a     |
      | $.Datastore.port                      | REPLACE | !{postgresMD5_Port}                                                      | number  |
      | $.Datastore.user                      | UPDATE  | ${DISCOVERY_DATASTORE_USER:-postgres}                                    | n/a     |
      | $.Datastore.database                  | UPDATE  | ${DISCOVERY_DATASTORE_DB:-discovery}                                          | n/a     |
      | $.Datastore.type                      | UPDATE  | ${DISCOVERY_DATASTORE_TYPE:-postgres}                                    | n/a     |
      | $.Datastore.password                  | UPDATE  | ${DISCOVERY_DATASTORE_PASSWORD:-stratio}                                 | n/a     |
      | $.Discovery.usermail                  | UPDATE  | ${DISCOVERY_DISCOVERY_USERMAIL:-demo@stratio.com}                        | n/a     |
      | $.Discovery.user                      | UPDATE  | ${DISCOVERY_DISCOVERY_USER:-Demo}                                        | n/a     |
      | $.Discovery.password                  | UPDATE  | ${DISCOVERY_DISCOVERY_PASSWORD:-123456}                                  | n/a     |
      | $.Discovery.path                      | UPDATE  | ${DISCOVERY_DISCOVERY_PATH:-/services/metabase}                          | n/a     |
      | $.Armadillo.user                      | UPDATE  | ${DISCOVERY_ARMADILLO_USER:-vnd.bbva.user-id}                            | n/a     |
      | $.Crossdata.tenant_name               | UPDATE  | ${DISCOVERY_CROSSDATA_TENANT_NAME:-crossdata-1}                          | n/a     |

  @RunOnEnv(DISC_VERSION=0.29.0-SNAPSHOT)
  Scenario: [Basic Installation Discovery][03] Create config file
    Given I create file 'config_discovery_${DISC_VERSION:-0.29.0-SNAPSHOT}.json' based on 'schemas/config_discovery_0.28.9.json' as 'json' with:
      | $.Service.virtualhost                 | UPDATE  | ${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}               | n/a     |
      | $.Security.vault_token                | UPDATE  | !{vaultToken}                                                            | n/a     |
      | $.Datastore.host                      | UPDATE  | !{postgresMD5_IP}                                                        | n/a     |
      | $.Datastore.port                      | REPLACE | !{postgresMD5_Port}                                                      | number  |
      | $.Datastore.user                      | UPDATE  | ${DISCOVERY_DATASTORE_USER:-postgres}                                    | n/a     |
      | $.Datastore.database                  | UPDATE  | ${DISCOVERY_DATASTORE_DATABASE:-discovery}                               | n/a     |
      | $.Datastore.type                      | UPDATE  | ${DISCOVERY_DATASTORE_TYPE:-postgres}                                    | n/a     |
      | $.Datastore.password                  | UPDATE  | ${DISCOVERY_DATASTORE_PASSWORD:-stratio}                                 | n/a     |
      | $.Discovery.path                      | UPDATE  | ${DISCOVERY_DISCOVERY_PATH:-/services/metabase}                          | n/a     |
      | $.Crossdata.tenant_name               | UPDATE  | ${DISCOVERY_CROSSDATA_TENANT_NAME:-crossdata-1}                          | n/a     |

  Scenario: [Basic Installation Discovery][04] Install using config file and cli
    Given I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.labs.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    When I outbound copy 'target/test-classes/config_discovery_${DISC_VERSION}.json' through a ssh connection to '/tmp'
    And I run 'dcos package install --yes --package-version=${DISC_VERSION} --options=/tmp/config_discovery_${DISC_VERSION}.json ${DISC_PACKAGE:-discovery}' in the ssh connection
    Then the command output contains 'Installing Marathon app for package [${DISC_PACKAGE:-discovery}] version [${DISC_VERSION}]'
    Then the command output contains 'Discovery stack has been installed.'
    Then I run 'rm -rf /tmp/config_discovery_${DISC_VERSION}.json' in the ssh connection
    And I run 'dcos marathon task list discovery | awk '{print $5}' | grep discovery' in the ssh connection and save the value in environment variable 'discoveryTaskId'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep TASK_RUNNING | wc -l' contains '1'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep healthCheckResults | wc -l' contains '1'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep  '"alive": true' | wc -l' contains '1'

