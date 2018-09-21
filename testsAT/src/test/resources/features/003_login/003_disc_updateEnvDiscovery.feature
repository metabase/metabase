Feature: Update discovery with headers parameters

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @rest @important
  Scenario: Modify discovery instance adding header environment variables
    Given I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.labs.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    When I run 'echo "{\"env\":" > /tmp/discovery_config.json;dcos marathon app show ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery} | jq .env >> /tmp/discovery_config.json;echo "}" >> /tmp/discovery_config.json' in the ssh connection
    Then I inbound copy '/tmp/discovery_config.json' through a ssh connection to 'target/test-classes'
    And I create file 'discovery_header.json' based on 'discovery_config.json' as 'json' with:
      | $.env.MB-GROUP-HEADER                                             | ADD     | vnd.bbva.group-id                                  | string  |
      | $.env.MB-ADMIN-GROUP-HEADER                                       | ADD     | ${GROUP_ADMIN:-testadmin}                          | string  |
      | $.env.APPROLE                                                     | DELETE  | {}                                                 | object  |
    And I outbound copy 'target/test-classes/discovery_header.json' through a ssh connection to '/tmp'
    When I run 'dcos marathon app stop --force ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection
    Then the command output contains 'Created deployment'
    And I wait '60' seconds
    When I run 'dcos marathon app update --force ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery} < /tmp/discovery_header.json' in the ssh connection
    Then the command output contains 'Created deployment'
    And I wait '10' seconds
    When I run 'dcos marathon app start --force ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection
    Then the command output contains 'Created deployment'
    And I wait '60' seconds
    Given in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task list ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery} | awk '{print $5}' | grep ${DISCOVERY_SERVICE_NAME:-discovery} | wc -l' contains '1'
    And I run 'dcos marathon task list ${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery} | awk '{print $5}' | grep ${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection and save the value in environment variable 'discoveryTaskId'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep TASK_RUNNING | wc -l' contains '1'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep healthCheckResults | wc -l' contains '1'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep "alive": true | wc -l' contains '1'
    And I run 'rm -rf /tmp/discovery_config.json /tmp/discovery_header.json' in the ssh connection
    Given I securely send requests to '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}'
    And in less than '600' seconds, checking each '10' seconds, I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}' so that the response contains 'Metabase'
    Then the service response status must be '200'