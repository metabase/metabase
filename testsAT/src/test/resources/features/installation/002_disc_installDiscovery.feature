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

  Scenario: [Basic Installation Discovery][02] Install Discovery
    When I send a 'POST' request to '/marathon/v2/apps' based on 'schemas/discovery.json' as 'json' with:
      | $.container.docker.image              | UPDATE | stratioclient/discovery-crossdata2:${STRATIO_DISCOVERY_VERSION:-0.28.8}        | n/a |
      | $.env.VAULT_HOST                      | UPDATE | ${DISCOVERY_VAULT_HOST:-vault.service.paas.labs.stratio.com}                   | n/a |
      | $.env.MB-INIT-ADMIN-MAIL              | UPDATE | ${DISCOVERY_INIT_ADMIN_USER:-demo@stratio.com}                                 | n/a |
      | $.env.MB-INIT-ADMIN-PASSWORD          | UPDATE | ${DISCOVERY_INIT_ADMIN_PASS:-123456}                                           | n/a |
      | $.env.MB_DB_TYPE                      | UPDATE | ${DISCOVERY_DB_TYPE:-postgres}                                                 | n/a |
      | $.env.TENANT_NAME                     | UPDATE | ${DISCOVERY_TENANT_NAME:-crossdata-1}                                          | n/a |
      | $.env.VAULT_PORT                      | UPDATE | ${DISCOVERY_VAULT_PORT:-8200}                                                  | n/a |
      | $.env.MB_DB_PASS                      | UPDATE | ${DISCOVERY_DB_PASS:-stratio}                                                  | n/a |
      | $.env.MB_DB_USER                      | UPDATE | ${DISCOVERY_DB_USER:-postgres}                                                 | n/a |
      | $.env.MB_DB_HOST                      | UPDATE | !{postgresMD5_IP}                                                              | n/a |
      | $.env.MB_DB_PORT                      | UPDATE | !{postgresMD5_Port}                                                            | n/a |
      | $.env.MB_DB_DBNAME                    | UPDATE | ${DISCOVERY_NAME_DB:-postgres}                                                 | n/a |
      | $.labels.HAPROXY_0_VHOST              | UPDATE | ${DISCOVERY_ENV_PUBLIC_AGENT:-ci-public.labs.stratio.com}                      | n/a |
      | $.labels.HAPROXY_0_PATH               | UPDATE | ${DISCOVERY_PATH:-/services/metabase}                                          | n/a |
    Then the service response status must be '201'
    And I run 'dcos marathon task list discovery | awk '{print $5}' | grep discovery' in the ssh connection and save the value in environment variable 'discoveryTaskId'
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos marathon task show !{discoveryTaskId} | grep TASK_RUNNING | wc -l' contains '1'

