Feature: Create groups

  @web
  @include(feature:001_disc_loginUserPassword.feature,scenario:DefaultLogin)
  @loop(GROUP_LIST,GROUP)
  Scenario: Create groups
    When '1' elements exists with 'xpath://div[@id='root']/div/div[1]/div[2]/div/div/div'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://a[contains(@data-metabase-event,'Admin') and contains(@href,'admin')]'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://a[contains(@href,'people') and contains(@data-metabase-event,'NavBar')]'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://ul[contains(@class,'AdminList')]//a[contains(@href,'groups')]'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://button'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://input'
    Then I type '<GROUP>' on the element on index '0'
    When '1' elements exists with 'xpath://table//button'
    Then I click on the element on index '0'
    And I wait '5' seconds
