@rest
Feature: Connection on XData

  Background: Initial setup
    Given I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @web
  @runOnEnv(DISC_VERSION>0.29.0)
  Scenario: [Connection XData][02] Register xdata database
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
      | $.engine                                        | UPDATE  | ${DISCOVERY_ENGINE_XD:-crossdata2}                  | string |
      | $.name                                          | UPDATE  | ${DISCOVERY_DATABASE_XD_CONNECTION_NAME:-crossdata} | string |
      | $.details.host                                  | UPDATE  | ${DISCOVERY_XD_HOST:-crossdata-1.marathon.mesos}    | string |
      | $.details.port                                  | REPLACE | ${DISCOVERY_XD_PORT:-8000}                          | number |
      | $.details.dbname                                | UPDATE  | true                                                | string |
      | $.details.user                                  | UPDATE  | ${DISCOVERY_TENANT_NAME:-crossdata-1}               | string |
      | $.details.additional-options                    | DELETE  |                                                     | string |
      | $.details.tunnel-port                           | DELETE  |                                                     | string |
    Then the service response status must be '200'
    And the service response must contain the text '"name":"${DISCOVERY_DATABASE_CONNECTION_NAME:-crossdata}",'

  @ignore @manual
  @web
  @runOnEnv(DISC_VERSION>0.29.0)
  Scenario: [Connection Postgres][03] Get xdata database id
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
    Then in less than '300' seconds, checking each '10' seconds, I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}${DISCOVERY_DATABASES:-/api/database}' so that the response contains '"engine":"crossdata2"'
    Then the service response status must be '200'
    And I save element '$' in environment variable 'exhibitor_answer'
    And I save ''!{exhibitor_answer}'' in variable 'parsed_answer'
    And I run 'echo !{parsed_answer} | jq '.[] | select(.engine=="crossdata2") | .id'' locally and save the value in environment variable 'xddatabaseId'

  @ignore @manual
  @web
  @runOnEnv(DISC_VERSION>0.29.0)
  Scenario: [Connection Postgres][04] Check query xdata database
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
      | $.database                 | REPLACE | !{xddatabaseId}                         | number |
      | $.type                     | UPDATE  | ${DISCOVERY_TYPE_DATASET:-query}        | string |
      | $.query.source_table       | REPLACE | !{xddatabaseId}                         | number |
    Then the service response status must be '200'
    And I wait '3' seconds
    And I take a snapshot
    And the service response must contain the text '"row_count":2,'
