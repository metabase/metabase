@web @rest
Feature: Gestion de Grupos en Discovery _

  Scenario: [settings] Creacion de un Grupo de Discovery

  #Log into application with user demo@stratio.com
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type 'demo@stratio.com' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '123456' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '10' seconds

   #Acceder a la creacion de Usuarios y Grupos
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a > div > div > div'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.MetadataEditor-table-list.AdminList.flex-no-shrink.full-height > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > section > button'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr:nth-child(1) > td > div > input'
    Then I type 'QA' on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr:nth-child(1) > td > div > button'
    Then I click on the element on index '0'

    And I wait '5' seconds

  Scenario: [settings] Comprobar usuarios en un grupo de Discovery

   #Log into application with user demo@stratio.com
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type 'demo@stratio.com' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '123456' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '10' seconds

   #Acceder a la creacion de Usuarios y Grupos
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.MetadataEditor-table-list.AdminList.flex-no-shrink.full-height > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr:nth-child(1) > td:nth-child(1) > a'
    Then I click on the element on index '0'
    And I wait '10' seconds


  Scenario: [settings] Borrar un grupo de Discovery

   #Log into application with user demo@stratio.com
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type 'demo@stratio.com' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '123456' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '10' seconds

    #Acceder a la creacion de Usuarios y Grupos
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a > div > div > div'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.MetadataEditor-table-list.AdminList.flex-no-shrink.full-height > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr:nth-child(3) > td.text-right > a > svg'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > ul > li.pt1.pb2.px2.bg-brand-hover.text-white-hover.cursor-pointer.text-error > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span:nth-child(10) > span > div > div > div > div.ModalBody.flex.flex-full.flex-basis-auto > div > div > button.Button.Button--danger'
    Then I click on the element on index '0'
    And I wait '5' seconds


  Scenario: [settings] Editar el nombre del grupo de Discovery
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type 'demo@stratio.com' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '123456' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '10' seconds

    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a > div > div > div'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.MetadataEditor-table-list.AdminList.flex-no-shrink.full-height > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr:nth-child(3) > td.text-right > a > svg > path'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > ul > li:nth-child(1)'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr.bordered.border-brand.rounded > td:nth-child(1) > input'
    Then I type 'ABCDEF' on the element on index '0'
    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > table > tbody > tr.bordered.border-brand.rounded > td.text-right > button'
    Then I click on the element on index '0'
    And I wait '5' seconds

  Scenario: [settings] Añadir miembros a cualquier grupo
    Given My app is running in '${MARATHON_LB_DNS}:443'
    When I securely browse to '/services/metabase'
    And I wait '10' seconds
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[1]/input'
    Then I type 'demo@stratio.com' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[2]/input'
    Then I type '123456' on the element on index '0'
    When '1' elements exists with 'xpath://*[@id="root"]/div/div/div/div[2]/form/div[4]/button'
    Then  I click on the element on index '0'
    And I wait '10' seconds

    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > a > div > div > div'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > ul > li.flex-align-right.transition-background.hide.sm-show > div > div > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:#root > div > nav > div > ul > li:nth-child(2) > a'
    Then I click on the element on index '0'
    And I wait '5' seconds

    When '1' elements exists with 'css:#root > div > div > div.MetadataEditor-main.flex.flex-row.flex-full.mt2 > div.px2.flex-full > div > div > section.pb4 > table > tbody > tr:nth-child(2) > td:nth-child(4) > a > div > span > span'
    Then I click on the element on index '0'
    When '1' elements exists with 'css:body > span.PopoverContainer.tether-element.tether-element-attached-top.tether-element-attached-center.tether-target-attached-bottom.tether-target-attached-center.tether-enabled > span > div > div > div:nth-child(4)'
    Then I click on the element on index '0'
    And I wait '5' seconds

