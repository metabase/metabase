@web @rest
Feature: Configuración conexion Crossdata en Discovery

    Scenario: [configbbdd] Configuracion de BBDD Crossdata en Discovery
    #Configuracion de BBDD Crossdata en Discovery

    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '5' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '10' seconds
    Given '1' element exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div/a/div/div/div'
    Then I click on the element on index '0'
    When '1' element exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div/div/ul/li[2]/a'
    Then I click on the element on index '0'
    When '1' element exists with 'xpath://*[@id="root"]/div/nav/div/ul/li[4]/a'
    Then I click on the element on index '0'
    When '1' element exists with 'xpath://*[@id="root"]/div/div/section[1]/a'
    Then I click on the element on index '0'
    And I wait '10' seconds

    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/div/label[2]/select'
    Then I click on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/div/label[2]/select'
    Then I click on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/form/div[1]/div[1]/input'
    Then I type '${NAME:-crossdata-1}' on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/form/div[1]/div[2]/input'
    Then I type '${NAMEHOST:-crossdata-1.marathon.mesos}' on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/form/div[1]/div[3]/input'
    Then I type '${PORT:-10080}' on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/form/div[1]/div[4]/div/div[1]'
    Then I click on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/form/div[1]/div[5]/input'
    Then I type '${USERBBDD:-crossdata-1}' on the element on index '0'
    Given '1' element exists with 'xpath://*[@id="root"]/div/div/section[2]/div/div/div/div/div/form/div[2]/button'
    Then I click on the element on index '0'

    And I wait '60' seconds

    Given '1' element exists with 'xpath:/html/body/span[4]/span/div/div/div/div[2]/div/div[2]/button'
    Then I click on the element on index '0'

    And I wait '30' seconds


