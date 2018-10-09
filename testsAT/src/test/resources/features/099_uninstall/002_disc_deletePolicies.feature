@rest
Feature: Delete Policy for user crossdata-1 in Gosec

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":\s*"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^\s*"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @runOnEnv(DISC_VERSION=0.30.0||DISC_VERSION=0.31.0-ccddeec)
  @runOnEnv(DISCOVERY_POLICIES=true)
  Scenario: [Delete policy for user crossdata-1 in Gosec][01] Deletion policy user crossdata-1
    Given I set sso token using host '${CLUSTER_ID:-nightly}.labs.stratio.com' with user '${DCOS_USER:-admin}' and password '${DCOS_PASSWORD:-1234}' and tenant 'NONE'
    And I securely send requests to '${CLUSTER_ID:-nightly}.labs.stratio.com:443'
    When I send a 'PUT' request to '${BASE_END_POINT:-/service/gosecmanagement}/api/policy/discovery' based on 'schemas/objectPolicy.conf' as 'json' with:
      | $.id                                            | UPDATE  | ${DISCOVERY_POLICY_ID:-discovery}         | string |
      | $.name                                          | UPDATE  | ${DISCOVERY_POLICY_NAME:-discovery}       | string |
      | $.users                                         | REPLACE | []                                        | array  |
      | $.services[0].instancesAcl[0].instances[0].name | UPDATE  | ${POSTGRES_FRAMEWORK_ID_TLS:-postgrestls} | string |
      | $.services[0].version                           | UPDATE  | ${POSTGRES_VERSION}                       | string |
    Then the service response status must be '200'
    And I wait '120' seconds
    When I send a 'DELETE' request to '${BASE_END_POINT:-/service/gosecmanagement}/api/policy/${DISCOVERY_POLICY_ID:-discovery}'
    Then the service response status must be '200'
