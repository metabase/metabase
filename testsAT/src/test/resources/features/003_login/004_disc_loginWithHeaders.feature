Feature: Login with headers

  Scenario: Set PROXY_HEADERS variable to non-existing user without group (user: notexists)
    When We update system property 'PROXY_HEADERS' to value 'vnd.bbva.user-id:notexists'

  @web
  Scenario: Login through headers - User and group don't exist --> NO LOGIN
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And '0' elements exists with 'xpath://h2[contains(.,'notexists')]'

  Scenario: Set PROXY_HEADERS variable to non-existing user and group (user: notexists, group: notexists)
    When We update system property 'PROXY_HEADERS' to value 'vnd.bbva.user-id:notexists,vnd.bbva.group-id:notexists'

  @web
  Scenario: Login through headers - User and group don't exist --> NO LOGIN
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '10' seconds
    And '1' elements exists with 'xpath://input[@name="username"]'
    And '0' elements exists with 'xpath://h2[contains(.,'notexists')]'

  Scenario: Set PROXY_HEADERS variable to existing user and non-existing group (user: demo (or USERNAME variable), group: notexists)
    When We update system property 'PROXY_HEADERS' to value 'vnd.bbva.user-id:${USERNAME:-Demo},vnd.bbva.group-id:test'

  @web
  Scenario: Login through headers - User exists --> AUTOMATIC LOGIN
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '10' seconds
    And '0' elements exists with 'xpath://input[@name="username"]'
    And '1' elements exists with 'xpath://h2[contains(.,'${USERNAME:-demo}')]'

  Scenario: Set PROXY_HEADERS variable to non-existing user and existing group (user: newuser, group: test (or GROUP variable))
    When We update system property 'PROXY_HEADERS' to value 'vnd.bbva.user-id:newuser,vnd.bbva.group-id:${GROUP:-test}'

  @web
  Scenario: Login through headers - User doesn't exist and group exists --> AUTOMATIC LOGIN
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '10' seconds
    And '0' elements exists with 'xpath://input[@name="username"]'
    And '1' elements exists with 'xpath://h2[contains(.,'newuser')]'

  Scenario: Set PROXY_HEADERS variable to non-existing user and existing group. GROUP-ADMIN header contains this group (user: newadminuser, group: testadmin (or GROUP_ADMIN variable))
    When We update system property 'PROXY_HEADERS' to value 'vnd.bbva.user-id:newadminuser,vnd.bbva.group-id:${GROUP_ADMIN:-testadmin}'

  @web @rest
  Scenario: Login through headers - User doesn't exist and group exists --> AUTOMATIC LOGIN and user is admin
    Given My app is running in '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    When I securely browse to '${DISCOVERY_DISCOVERY_PATH:-/discovery}'
    And I wait '10' seconds
    And '0' elements exists with 'xpath://input[@name="username"]'
    And '1' elements exists with 'xpath://h2[contains(.,'newadminuser')]'

  Scenario: Set PROXY_HEADERS variable to blank string
    When We update system property 'PROXY_HEADERS' to value ''

  @web @rest
  @include(feature:001_disc_loginUserPassword.feature,scenario:DefaultLogin)
  Scenario: Check if users have been created and assigned to the correct group
    Then I save selenium cookies in context
    And I wait '2' seconds
    When I securely send requests to '${DISCOVERY_SERVICE_VHOST:-nightlypublic.labs.stratio.com}:443'
    # Get user data
    When I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}/api/user?include_deactivated=false'
    Then the service response status must be '200'
    # Check if users exists
    And the service response must contain the text '"first_name":"newuser"'
    And the service response must contain the text '"first_name":"newadminuser"'
    # Save data
    And I save element '$[?(@.first_name == "newuser")].is_superuser' in environment variable 'newUserIsAdmin'
    And I save element '$[?(@.first_name == "newadminuser")].is_superuser' in environment variable 'newAdminUserIsAdmin'
    And I save element '$[?(@.first_name == "newuser")].id' in environment variable 'userId'
    And I run 'echo !{userId} | sed "s/\[//g;s/\]//g"' locally and save the value in environment variable 'userId'
    And I save element '$[?(@.first_name == "newadminuser")].id' in environment variable 'adminUserId'
    And I run 'echo !{adminUserId} | sed "s/\[//g;s/\]//g"' locally and save the value in environment variable 'adminUserId'
    # Check if newuser is superuser
    When I run 'echo !{newUserIsAdmin}' locally
    Then the command output contains 'false'
    # Check if newadminuser is superuser
    When I run 'echo !{newAdminUserIsAdmin}' locally
    Then the command output contains 'true'
    # Get groups data
    When I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}/api/permissions/group'
    Then the service response status must be '200'
    # Save data
    And I save element '$[?(@.name == "${GROUP:-test}")].id' in environment variable 'groupId'
    And I run 'echo !{groupId} | sed "s/\[//g;s/\]//g"' locally and save the value in environment variable 'groupId'
    And I save element '$[?(@.name == "${GROUP_ADMIN:-testadmin}")].id' in environment variable 'adminGroupId'
    And I run 'echo !{adminGroupId} | sed "s/\[//g;s/\]//g"' locally and save the value in environment variable 'adminGroupId'
    # Get user-groups relation
    When I send a 'GET' request to '${DISCOVERY_DISCOVERY_PATH:-/discovery}/api/permissions/membership'
    Then the service response status must be '200'
    # Check if users are correctly assigned to the groups
    And I save element '$.[*].[?(@.user_id == !{userId} && @.group_id == !{groupId})]' in environment variable 'membership'
    And I run 'echo !{membership}' locally
    And the command output contains 'membership_id'
    And I save element '$.[*].[?(@.user_id == !{adminUserId} && @.group_id == !{adminGroupId})]' in environment variable 'membershipAdmin'
    And I run 'echo !{membershipAdmin}' locally
    And the command output contains 'membership_id'

