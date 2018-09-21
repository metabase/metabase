@web @rest
Feature: Gestion de usuarios en Discovery _

  Scenario: [settings] Añadir un usuario Administrador
  #Log into application with user demo@stratio.com

    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div/div/ul/li[2]/a'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/nav/div/ul/li[2]/a'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div[2]/div[2]/div/div/section[1]/button'
    Then I click on the element on index '0'


    Given '1' element exists with 'css:input[name="firstName"]'
    Then I type '${NOMBRE:-Angel}' on the element on index '0'
    Given '1' element exists with 'css:input[name="lastName"]'
    Then I type '${APELLIDOS:-Luis}' on the element on index '0'
    Given '1' element exists with 'css:input[name="email"]'
    Then I type '${EMAIL:-angelluis@gmail.com}' on the element on index '0'
    Given '1' element exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalBody.flex.flex-full.flex-basis-auto > div > form > div.px4.pb2 > div.flex.align-center > a'
    Then I click on the element on index '0'
    And I wait '5' seconds
    Given '1' elements exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalBody.flex.flex-full.flex-basis-auto > div > form > div.ModalFooter.flex-no-shrink.px4.py2.border-top > div > span:nth-child(3) > button'
    Then I click on the element on index '0'
    And I wait '5' seconds

  Scenario: [settings] Detalles del usuario
  #Log into application with user demo@stratio.com


    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds


    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a'
    Then  I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then  I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then  I click on the element on index '0'
    And I wait '5' seconds


    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > div > section.pb4 > table > tbody > tr:nth-child(2) > td.text-right > a > span.text-grey-1 > svg'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > ul > li.py1.px2.bg-brand-hover.text-white-hover.cursor-pointer'
    Then I click on the element on index '0'


  Scenario: [settings] Eliminar un usuario Administrador
  #Log into application with user demo@stratio.com

    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a > div > div > div'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > div > section.pb4 > table > tbody > tr:nth-child(2) > td.text-right > a > span.text-grey-1 > svg'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > ul > li.p2.border-top.bg-error-hover.text-error.text-white-hover.cursor-pointer'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalFooter.flex-no-shrink.px4.py2.border-top > div > span:nth-child(3) > button > div > div'
    Then I click on the element on index '0'
    And I wait '5' seconds

  Scenario: [settings] Añadir un usuario No Administrador
  #Añadir un usuario No Administrador.

    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/nav/ul/li[7]/div/div/div/ul/li[2]/a'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/nav/div/ul/li[2]/a'
    Then I click on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div[2]/div[2]/div/div/section[1]/button'
    Then I click on the element on index '0'


    Given '1' element exists with 'css:input[name="firstName"]'
    Then I type '${NOMBRE:-Federico}' on the element on index '0'
    Given '1' element exists with 'css:input[name="lastName"]'
    Then I type '${APELLIDOS:-Luis}' on the element on index '0'
    Given '1' element exists with 'css:input[name="email"]'
    Then I type '${EMAIL:-federicoluis@gmail.com}' on the element on index '0'
   #Given '1' element exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalBody.flex.flex-full.flex-basis-auto > div > form > div.px4.pb2 > div.flex.align-center > a'
   #Then I click on the element on index '0'
    And I wait '5' seconds
    Given '1' elements exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalBody.flex.flex-full.flex-basis-auto > div > form > div.ModalFooter.flex-no-shrink.px4.py2.border-top > div > span:nth-child(3) > button'
    Then I click on the element on index '0'
    And I wait '5' seconds

  Scenario: [settings] Detalles del usuario
#Log into application with user demo@stratio.com

    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds


    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a'
    Then  I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then  I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then  I click on the element on index '0'
    And I wait '5' seconds


    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > div > section.pb4 > table > tbody > tr:nth-child(2) > td.text-right > a > span.text-grey-1 > svg'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > ul > li.py1.px2.bg-brand-hover.text-white-hover.cursor-pointer'
    Then I click on the element on index '0'


  Scenario: [settings] Resetear el Password de un Usuario
  #Reseteo de la Password de un Usuario

    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type '${DISCOVERY_USER:-demo@stratio.com}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '${DISCOVERY_PASS:-123456}' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a > div > div > div'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > div > section.pb4 > table > tbody > tr:nth-child(2) > td.text-right > a > span.text-grey-1 > svg'
    Then I click on the element on index '0'
    And I wait '5' seconds
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > ul > li.pt1.pb2.px2.bg-brand-hover.text-white-hover.cursor-pointer'
    Then I click on the element on index '0'
    And I wait '5' seconds
    When '1' elements exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalFooter.flex-no-shrink.px4.py2.border-top > div > span:nth-child(3) > button > div > div'
    Then I click on the element on index '0'
    And I wait '5' seconds
    When '1' elements exists with 'css:body > span.ModalContainer > span > div > div > div > div.ModalFooter.flex-no-shrink.px4.py2.border-top > div > button'
    Then I click on the element on index '0'
    And I wait '5' seconds
