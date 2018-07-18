@rest
Feature: Install Discovery for Discovery

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Discovery][01] Obtain postgreSQL ip and port
    Given I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].assignedHost' in environment variable 'postgresMD5_IP'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'postgresMD5_Port'
    And I wait '5' seconds

  @runOnEnv(DISC_VERSION=0.28.9||DISC_VERSION=0.29.0||DISC_VERSION=0.30.0)
  Scenario: [Basic Installation Discovery][02] Obtain postgreSQL ip and port
    Given I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].dnsHostname' in environment variable 'postgresTLS_Host'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'postgresTLS_Port'
    And I wait '5' seconds

  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0)
  Scenario: [Basic Installation Discovery][03] Check Crossdata is running
    Given I run 'dcos marathon task list ${DISCOVERY_TENANT_NAME:-crossdata-1} | awk '{print $5}' | grep ${DISCOVERY_TENANT_NAME:-crossdata-1}' in the ssh connection and save the value in environment variable 'crossdataTaskId'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{crossdataTaskId} | grep '"state": "TASK_RUNNING"' | wc -l' contains '1'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{crossdataTaskId} | grep 'healthCheckResults' | wc -l' contains '1'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{crossdataTaskId} | grep '"alive": true' | wc -l' contains '2'

  @runOnEnv(DISC_VERSION=0.28.9||DISC_VERSION=0.29.0||DISC_VERSION=0.30.0)
  Scenario: [Basic Installation Discovery][04] Create config file
    Given I create file 'config_discovery_${DISC_VERSION}.json' based on 'schemas/config_discovery_0.28.9.json' as 'json' with:
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
      | $.Datastore.user                      | UPDATE  | ${DISCOVERY_TENANT_NAME:-postgres}                                       | n/a     |
      | $.Datastore.database                  | UPDATE  | ${DISCOVERY_DATASTORE_DB:-discovery}                                     | n/a     |
      | $.Datastore.type                      | UPDATE  | ${DISCOVERY_DATASTORE_TYPE:-postgres}                                    | n/a     |
      | $.Datastore.password                  | UPDATE  | ${DISCOVERY_DATASTORE_PASSWORD:-stratio}                                 | n/a     |
      | $.Discovery.usermail                  | UPDATE  | ${DISCOVERY_DISCOVERY_USERMAIL:-demo@stratio.com}                        | n/a     |
      | $.Discovery.user                      | UPDATE  | ${DISCOVERY_DISCOVERY_USER:-Demo}                                        | n/a     |
      | $.Discovery.password                  | UPDATE  | ${DISCOVERY_DISCOVERY_PASSWORD:-123456}                                  | n/a     |
      | $.Discovery.path                      | UPDATE  | ${DISCOVERY_DISCOVERY_PATH:-/discovery}                                  | n/a     |
      | $.Armadillo.user                      | UPDATE  | ${DISCOVERY_ARMADILLO_USER:-vnd.bbva.user-id}                            | n/a     |
      | $.Crossdata.tenant_name               | UPDATE  | ${DISCOVERY_TENANT_NAME:-crossdata-1}                                    | n/a     |

  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Discovery][05] Modify info to connect to postgrestls
    Given I create file 'config_discovery_0.28.9.json' based on 'config_discovery_0.28.9.json' as 'json' with:
      | $.Datastore.host                      | UPDATE  | !{postgresMD5_IP}                                                        | n/a     |
      | $.Datastore.port                      | REPLACE | !{postgresMD5_Port}                                                      | number  |

  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0)
  Scenario: [Basic Installation Discovery][05] Modify info to connect to postgrestls
    Given I create file 'config_discovery_${DISC_VERSION}.json' based on 'config_discovery_${DISC_VERSION}.json' as 'json' with:
      | $.Service.folder                                             | ADD     | ${DISCOVERY_SERVICE_FOLDER:-discovery}                                 | string  |
      | $.Security.dynamic_authentication                            | ADD     | {}                                                                     | object  |
      | $.Security.dynamic_authentication.use_dynamic_authentication | ADD     | ${DISCOVERY_SEC_DYNAMIC_AUTH:-true}                                    | boolean |
      | $.Security.dynamic_authentication.instance_app_role          | ADD     | ${DISCOVERY_SEC_INSTANCE_APP_ROLE:-open}                               | string  |
      | $.Security.vault_configuration                               | ADD     | {}                                                                     | object  |
      | $.Security.vault_configuration.vault_host                    | ADD     | ${DISCOVERY_SECURITY_VAULT_HOST:-vault.service.paas.labs.stratio.com}  | string  |
      | $.Security.vault_configuration.vault_port                    | ADD     | ${DISCOVERY_SECURITY_VAULT_PORT:-8200}                                 | number  |
      | $.Security.vault_configuration.vault_token                   | ADD     | !{vaultToken}                                                          | string  |
      | $.Security.instance_app_role                                 | DELETE  | {}                                                                     | string  |
      | $.Security.vault_host                                        | DELETE  | {}                                                                     | string  |
      | $.Security.vault_port                                        | DELETE  | {}                                                                     | number  |
      | $.Security.vault_token                                       | DELETE  | {}                                                                     | string  |
      | $.Network                                                    | DELETE  | {}                                                                     | object  |
      | $.Network_segmentation                                       | ADD     | {}                                                                     | object  |
      | $.Network_segmentation.use_network_segmentation              | ADD     | ${DISCOVERY_NETWORK_SEGMENTATION:-true}                                | boolean |
      | $.Network_segmentation.calico_network                        | ADD     | ${DISCOVERY_NETWORK_NAME:-stratio}                                     | string  |
      | $.Datastore.tls_enabled                                      | ADD     | ${DISCOVERY_DATASTORE_TLS:-true}                                       | boolean |
      | $.Datastore.jdbc_parameters                                  | ADD     |                                                                        | string  |
      | $.Datastore.host                                             | UPDATE  | !{postgresTLS_Host}                                                    | n/a     |
      | $.Datastore.port                                             | REPLACE | !{postgresTLS_Port}                                                    | number  |
      | $.Datastore.user                                             | UPDATE  | ${DISCOVERY_TENANT_NAME:-crossdata-1}                                  | n/a     |

  Scenario: [Basic Installation Discovery][06] Install using config file and cli
    Given I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.labs.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    When I outbound copy 'target/test-classes/config_discovery_${DISC_VERSION}.json' through a ssh connection to '/tmp'
    And I run 'dcos package install --yes --package-version=${DISC_VERSION} --options=/tmp/config_discovery_${DISC_VERSION}.json ${DISC_PACKAGE:-discovery}' in the ssh connection
    Then the command output contains 'Installing Marathon app for package [${DISC_PACKAGE:-discovery}] version [${DISC_VERSION}]'
    Then the command output contains 'Discovery stack has been installed.'
    Then I run 'rm -rf /tmp/config_discovery_${DISC_VERSION}.json' in the ssh connection

  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Discovery][07] Check Discovery installation
    Given I run 'dcos marathon task list ${DISCOVERY_SERVICE_NAME:-discovery} | awk '{print $5}' | grep ${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection and save the value in environment variable 'discoveryTaskId'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep TASK_RUNNING | wc -l' contains '1'

  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0)
  Scenario: [Basic Installation Discovery][07] Check Discovery installation
    Given I run 'dcos marathon task list ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery} | awk '{print $5}' | grep ${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection and save the value in environment variable 'discoveryTaskId'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep TASK_RUNNING | wc -l' contains '1'

  Scenario: [Basic Installation Discovery][08] Check Discovery frontend
    Given I securely send requests to '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}'
    And in less than '600' seconds, checking each '10' seconds, I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}' so that the response contains 'Metabase'
    Then the service response status must be '200'
