@rest
Feature: Connection on Postgres

  Background: Initial setup
    Given I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0||DISC_VERSION=0.31.0-ccddeec)
  Scenario: [Connection Postgres][01] Obtain postgreSQL ip and port
    Given I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls}/v1/service/status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].dnsHostname' in environment variable 'postgresTLS_Host'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'postgresTLS_Port'
    And I wait '5' seconds

  @web
  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0||DISC_VERSION=0.31.0-ccddeec)
  Scenario: [Connection Postgres][02] Register postgres database
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '3' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And I type '${USER:-demo@stratio.com}' on the element on index '0'
    And '1' elements exists with 'xpath://input[@name="password"]'
    And I type '${PASSWORD:-123456}' on the element on index '0'
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    And I click on the element on index '0'
    And I wait '1' seconds
    Then I save selenium cookies in context
    When I securely send requests to '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    Then I send a 'POST' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}${DISCOVERY_DATABASES:-/api/database}' based on 'schemas/registerdatabase.json' as 'json' with:
      | $.engine                                        | UPDATE  | ${DISCOVERY_ENGINE_PG:-postgres}                                                                                                                                                        | string |
      | $.name                                          | UPDATE  | ${DISCOVERY_DATABASE_PG_CONNECTION_NAME:-discovery}                                                                                                                                     | string |
      | $.details.host                                  | UPDATE  | !{postgresTLS_Host}                                                                                                                                                                     | string |
      | $.details.port                                  | REPLACE | !{postgresTLS_Port}                                                                                                                                                                     | number |
      | $.details.dbname                                | UPDATE  | ${DISCOVERY_DATA_DB:-pruebadiscovery}                                                                                                                                                   | string |
      | $.details.user                                  | UPDATE  | ${DISCOVERY_TENANT_NAME:-crossdata-1}                                                                                                                                                   | string |
      | $.details.additional-options                    | UPDATE  | ssl=true&sslmode=verify-full&sslcert=/root/kms/${DISCOVERY_TENANT_NAME:-crossdata-1}.pem&sslkey=/root/kms/${DISCOVERY_TENANT_NAME:-crossdata-1}.pk8&sslrootcert=/root/kms/root.pem      | string |
    Then the service response status must be '200'
    And the service response must contain the text '"name":"${DISCOVERY_DATABASE_PG_CONNECTION_NAME:-discovery}",'

  @ignore @manual
  @web
  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0||DISC_VERSION=0.31.0-ccddeec)
  Scenario: [Connection Postgres][03] Get postgres database id
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '3' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And I type '${USER:-demo@stratio.com}' on the element on index '0'
    And '1' elements exists with 'xpath://input[@name="password"]'
    And I type '${PASSWORD:-123456}' on the element on index '0'
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    And I click on the element on index '0'
    And I wait '4' seconds
    Then I save selenium cookies in context
    And I wait '2' seconds
    When I securely send requests to '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    Then in less than '300' seconds, checking each '10' seconds, I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}${DISCOVERY_DATABASES:-/api/database}' so that the response contains '"engine":"postgres"'
    Then the service response status must be '200'
    And I save element '$' in environment variable 'exhibitor_answer'
    And I save ''!{exhibitor_answer}'' in variable 'parsed_answer'
    And I run 'echo !{parsed_answer} | jq '.[] | select(.engine=="postgres") | .id'' locally and save the value in environment variable 'pgdatabaseId'

  @ignore @manual
  @web
  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0||DISC_VERSION=0.31.0-ccddeec)
  Scenario: [Connection Postgres][04] Check query postgres database
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '3' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And I type '${USER:-demo@stratio.com}' on the element on index '0'
    And '1' elements exists with 'xpath://input[@name="password"]'
    And I type '${PASSWORD:-123456}' on the element on index '0'
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    And I click on the element on index '0'
    And I wait '4' seconds
    Then I save selenium cookies in context
    And I wait '2' seconds
    When I securely send requests to '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    Then I send a 'POST' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}${DISCOVERY_DATASET:-/api/dataset}' based on 'schemas/dataset.json' as 'json' with:
      | $.database                 | REPLACE | !{pgdatabaseId}                         | number |
      | $.type                     | UPDATE  | ${DISCOVERY_TYPE_DATASET:-query}        | string |
      | $.query.source_table       | REPLACE | !{pgdatabaseId}                         | number |
    Then the service response status must be '200'
    And the service response must contain the text '"row_count":254,'
