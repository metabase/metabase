@web @rest
Feature: Login with user and password

  Scenario: DefaultLogin
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '3' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And I type '${USER:-demo@stratio.com}' on the element on index '0'
    And '1' elements exists with 'xpath://input[@name="password"]'
    And I type '${PASSWORD:-123456}' on the element on index '0'
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    And I click on the element on index '0'
    And I wait '5' seconds
    And '1' elements exists with 'xpath://*[contains(@data-metabase-event,'New Question')]'

  Scenario: Login with invalid user
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '3' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And I type '${USER:-demo@stratio.com}' on the element on index '0'
    And '1' elements exists with 'xpath://input[@name="password"]'
    And I type '11111111' on the element on index '0'
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    And I click on the element on index '0'
    And I wait '5' seconds
    And '0' elements exists with 'xpath://*[contains(@data-metabase-event,'New Question')]'