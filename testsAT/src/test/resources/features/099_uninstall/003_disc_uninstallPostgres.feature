@rest
Feature: Uninstall Postgres instances

  @runOnEnv(DISC_VERSION=0.28.9,POSTGRES_FRAMEWORK_ID_DISC=postgresdisc)
  Scenario: [Uninstallation Postgres][01] Uninstall Postgresdisc
    Given I wait '10' seconds
    Given I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I securely send requests to '${DCOS_IP}:443'
    When in less than '180' seconds, checking each '10' seconds, I send a 'POST' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/teardown' so that the response contains '"status":"ok"'

  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0||DISC_VERSION=0.31.0-SNAPSHOT)
  Scenario: [Uninstallation Postgres][01] Delete database for Discovery on Postgrestls
    Given I set sso token using host '${CLUSTER_SSO:-nightly.labs.stratio.com}' with user '${DCOS_USER:-admin}' and password '${DCOS_PASSWORD:-1234}' and tenant 'NONE'
    And I securely send requests to '${CLUSTER_SSO:-nightly.labs.stratio.com}:443'
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
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DISCOVERY_DATASTORE_DB:-discovery}'"' in the ssh connection
    When I run 'docker exec -t !{postgresDocker} psql -p !{pgPortCalico} -U postgres -c "DROP DATABASE ${DISCOVERY_DATASTORE_DB:-discovery}"' in the ssh connection
    Then the command output contains 'DROP DATABASE'
