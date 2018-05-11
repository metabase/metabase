@web @rest
Feature: Login con usuario en Discovery

  Scenario: [settings] Login con un usuario de Discovery
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

#    When '1' element exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div/a/div/div/div'
#    Then I click on the element on index '0'
#    When '1' element exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div/div/ul/li[6]/a'
#    Then I click on the element on index '0'
