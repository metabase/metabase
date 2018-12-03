@rest
Feature: Install Postgres for Discovery

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":\s*"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^\s*"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Postgres Dependencies][01] Check PostgresMD5
    Given I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    Then in less than '600' seconds, checking each '20' seconds, the command output 'dcos task | grep ^${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc} | grep R | wc -l' contains '1'
    And in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task list ${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc} | grep ${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc} | awk '{print $2}'' contains 'True'
    When I run 'dcos marathon task list ${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc} | grep ${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc} | awk '{print $5}'' in the ssh connection and save the value in environment variable 'postgresMD5_marathonId'
    Then in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task show !{postgresMD5_marathonId} | grep TASK_RUNNING | wc -l' contains '1'
    And in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task show !{postgresMD5_marathonId} | grep healthCheckResults | wc -l' contains '1'
    And in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task show !{postgresMD5_marathonId} | grep '"alive": true' | wc -l' contains '1'
    Given I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I securely send requests to '${DCOS_IP}:443'
    Then in less than '600' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains '"pg-0001","role":"master","status":"RUNNING"'
    And in less than '600' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains '"pg-0002","role":"sync_slave","status":"RUNNING"'
    And in less than '600' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status' so that the response contains '"pg-0003","role":"async_slave","status":"RUNNING"'

  @runOnEnv(DISC_VERSION>0.29.0)
  Scenario: [Basic Installation Postgres Dependencies][01] Check PostgresTLS
    Given I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    Then in less than '600' seconds, checking each '20' seconds, the command output 'dcos task | grep ^${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls} | grep R | wc -l' contains '1'
    And in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task list ${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls} | grep ${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls} | awk '{print $2}'' contains 'True'
    When I run 'dcos marathon task list ${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls} | grep ${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls} | awk '{print $5}'' in the ssh connection and save the value in environment variable 'postgresTLS_marathonId'
    Then in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task show !{postgresTLS_marathonId} | grep TASK_RUNNING | wc -l' contains '1'
    And in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task show !{postgresTLS_marathonId} | grep healthCheckResults | wc -l' contains '1'
    And in less than '600' seconds, checking each '20' seconds, the command output 'dcos marathon task show !{postgresTLS_marathonId} | grep '"alive": true' | wc -l' contains '1'
    Given I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I securely send requests to '${DCOS_IP}:443'
    Then in less than '600' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status' so that the response contains '"pg-0001","role":"master","status":"RUNNING"'
    And in less than '600' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status' so that the response contains '"pg-0002","role":"sync_slave","status":"RUNNING"'
    And in less than '600' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status' so that the response contains '"pg-0003","role":"async_slave","status":"RUNNING"'

  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Postgres Dependencies][02] Obtain postgreSQL ip and port on PostgresMD5
    Given I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].assignedHost' in environment variable 'postgresMD5_IP'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'postgresMD5_Port'
    And I wait '5' seconds

  @runOnEnv(DISC_VERSION=0.29.0)
  Scenario: [Basic Installation Postgres Dependencies][02] Create database for Discovery on Postgrestls
#    Given I securely send requests to '${BOOTSTRAP_IP}:443'
    Given I set sso token using host '${CLUSTER_ID:-nightly}.labs.stratio.com' with user '${DCOS_USER:-admin}' and password '${DCOS_PASSWORD:-1234}' and tenant 'NONE'
    And I securely send requests to '${CLUSTER_ID:-nightly}.labs.stratio.com:443'
    When in less than '300' seconds, checking each '20' seconds, I send a 'GET' request to '/exhibitor/exhibitor/v1/explorer/node-data?key=%2Fdatastore%2Fcommunity%2F${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}%2Fplan-v2-json&_=' so that the response contains 'str'
    And the service response status must be '200'
    And I save element '$.str' in environment variable 'exhibitor_answer'
    And I save ''!{exhibitor_answer}'' in variable 'parsed_answer'
    And I run 'echo !{parsed_answer} | jq '.phases[0]' | jq '."0001".steps[0]'| jq '."0"'.agent_hostname | sed 's/^.\|.$//g'' locally with exit status '0' and save the value in environment variable 'pgIP'
    And I run 'echo !{pgIP}' locally
    Then I wait '10' seconds
    When in less than '300' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status' so that the response contains 'status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].assignedHost' in environment variable 'pgIPCalico'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'pgPortCalico'
    Given I open a ssh connection to '!{pgIP}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    When I run 'docker ps -q | xargs -n 1 docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}} {{ .Name }}' | sed 's/ \// /'| grep !{pgIPCalico} | awk '{print $2}'' in the ssh connection and save the value in environment variable 'postgresDocker'
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "CREATE DATABASE ${DISCOVERY_DATASTORE_DB:-discovery}"' in the ssh connection
    Then the command output contains 'CREATE DATABASE'
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "CREATE DATABASE ${DISCOVERY_DATA_DB:-pruebadiscovery}"' in the ssh connection
    Then the command output contains 'CREATE DATABASE'
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "CREATE ROLE \"${DISCOVERY_TENANT_NAME:-crossdata-1}\" with password '${DISCOVERY_DATASTORE_PASSWORD:-stratio}' SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS LOGIN"' in the ssh connection
    Then the command output contains 'CREATE ROLE'

  @runOnEnv(DISC_VERSION>0.30.0)
  Scenario: [Basic Installation Postgres Dependencies][02] Create database for Discovery on Postgrestls
    Given I set sso token using host '${CLUSTER_ID:-nightly}.labs.stratio.com' with user '${DCOS_USER:-admin}' and password '${DCOS_PASSWORD:-1234}' and tenant 'NONE'
    And I securely send requests to '${CLUSTER_ID:-nightly}.labs.stratio.com:443'
#    Given I securely send requests to '${BOOTSTRAP_IP}:443'
    When in less than '300' seconds, checking each '20' seconds, I send a 'GET' request to '/exhibitor/exhibitor/v1/explorer/node-data?key=%2Fdatastore%2Fcommunity%2F${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}%2Fplan-v2-json&_=' so that the response contains 'str'
    And the service response status must be '200'
    And I save element '$.str' in environment variable 'exhibitor_answer'
    And I save ''!{exhibitor_answer}'' in variable 'parsed_answer'
    And I run 'echo !{parsed_answer} | jq '.phases[0]' | jq '."0001".steps[0]'| jq '."0"'.agent_hostname | sed 's/^.\|.$//g'' locally with exit status '0' and save the value in environment variable 'pgIP'
    And I run 'echo !{pgIP}' locally
    Then I wait '10' seconds
    When in less than '300' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status' so that the response contains 'status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].assignedHost' in environment variable 'pgIPCalico'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'pgPortCalico'
    Given I open a ssh connection to '!{pgIP}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    When I run 'docker ps -q | xargs -n 1 docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}} {{ .Name }}' | sed 's/ \// /'| grep !{pgIPCalico} | awk '{print $2}'' in the ssh connection and save the value in environment variable 'postgresDocker'
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "CREATE DATABASE ${DISCOVERY_DATASTORE_DB:-discovery}"' in the ssh connection
    Then the command output contains 'CREATE DATABASE'
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "CREATE DATABASE ${DISCOVERY_DATA_DB:-pruebadiscovery}"' in the ssh connection
    Then the command output contains 'CREATE DATABASE'
    And I wait '60' seconds
#
# TODO: Copy file createPGContent.sql to execute \i <path> from psql
#
  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Basic Installation Postgres Dependencies][03] Create database for Discovery on PostgresMD5
    Given I connect with JDBC and security type 'MD5' to database '${POSTGRES_FRAMEWORK_DEFAULT_DB:-postgres}' on host '!{postgresMD5_IP}' and port '!{postgresMD5_Port}' with user '${POSTGRES_FRAMEWORK_USER:-postgres}' and password '${POSTGRES_FRAMEWORK_PASSWORD:-stratio}'
    When I execute query 'CREATE DATABASE ${DISCOVERY_DATASTORE_DB:-discovery};'
    Then the command output contains 'CREATE DATABASE'
    When I execute query 'CREATE DATABASE ${DISCOVERY_DATA_DB:-pruebadiscovery};'
    Then the command output contains 'CREATE DATABASE'
    Then I close database connection

  @runOnEnv(DISC_VERSION>0.29.0)
  Scenario: [Basic Installation Postgres Dependencies][04] Create data for Discovery on PostgresTLS
    Given I open a ssh connection to '!{pgIP}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I outbound copy 'src/test/resources/schemas/createPGContent.sql' through a ssh connection to '/tmp'
    When I run 'docker cp /tmp/createPGContent.sql !{postgresDocker}:/tmp/ ; docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U "${DISCOVERY_TENANT_NAME:-crossdata-1}" -d ${DISCOVERY_DATA_DB:-pruebadiscovery} -f /tmp/createPGContent.sql | grep "INSERT 0 1" | wc -l' in the ssh connection
    Then the command output contains '254'
