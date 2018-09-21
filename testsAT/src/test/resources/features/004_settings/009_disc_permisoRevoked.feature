@web @rest
Feature: Revocacion de permisos a un usuario _

  Scenario: [settings] Revocacion de permisos de un usuario no Administrador
  #Log into application with user demo@stratio.com
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '5' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds


  Scenario: [settings] Revocacion de permiso de un usuario un usuario Administrador
  #Log into application with user demo@stratio.com
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '5' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds