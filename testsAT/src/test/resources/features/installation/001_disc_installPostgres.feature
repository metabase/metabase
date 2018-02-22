@rest
Feature: Install Postgres

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  Scenario: [Basic Installation Postgres][01] Install postgreSQL as Datastore with MD5
    When I send a 'POST' request to '/marathon/v2/apps' based on 'schemas/postgres-community-md5.json' as 'json' with:
      | $.env.FRAMEWORK_DOCKER_IMAGE          | UPDATE | qa.stratio.com/stratio/postgresql-community:${STRATIO_POSTGRES_COMM_VERSION:-0.20.0-SNAPSHOT}      | n/a |
      | $.container.docker.image              | UPDATE | qa.stratio.com/stratio/community-postgres-framework:${STRATIO_POSTGRES_FW_VERSION:-1.1.0-SNAPSHOT} | n/a |
      | $.id                                  | UPDATE | ${POSTGRES_ID_DISC:-/postgresdisc}                                                                 | n/a |
      | $.env.FRAMEWORK_MESOS_ROLE            | UPDATE | ${POSTGRES_TENANT_NAME:-postgresdisc}                                                              | n/a |
      | $.labels.DCOS_SERVICE_NAME            | UPDATE | ${POSTGRES_DCOS_SERV_NAME:-postgresdisc}                                                           | n/a |
      | $.labels.DCOS_PACKAGE_FRAMEWORK_NAME  | UPDATE | ${POSTGRES_DCOS_PACKAGE_FW_NAME:-postgresdisc}                                                     | n/a |
    Then the service response status must be '201'
    # We check that installation finished successfully
    Given I wait '10' seconds
    Then in less than '200' seconds, checking each '10' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains 'RUNNING'
    And in less than '200' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains '"pg-0001","role":"master","status":"RUNNING"'
    And in less than '200' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains '"pg-0002","role":"sync_slave","status":"RUNNING"'
    And in less than '200' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains '"pg-0003","role":"async_slave","status":"RUNNING"'
