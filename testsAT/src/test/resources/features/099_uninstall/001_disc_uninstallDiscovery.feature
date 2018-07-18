@rest
Feature: Uninstall Discovery

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  @runOnEnv(DISC_VERSION=0.28.9)
  Scenario: [Uninstallation Discovery][01] Uninstall Discovery
    Given I run 'dcos marathon app remove ${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos task | grep ${DISCOVERY_SERVICE_NAME:-discovery} | wc -l' contains '0'

  @runOnEnv(DISC_VERSION=0.29.0||DISC_VERSION=0.30.0)
  Scenario: [Uninstallation Discovery][01] Uninstall Discovery
    Given I run 'dcos marathon app remove /${DISCOVERY_SERVICE_FOLDER:-discovery}/${DISCOVERY_SERVICE_NAME:-discovery}' in the ssh connection
    Then in less than '300' seconds, checking each '10' seconds, the command output 'dcos task | grep ${DISCOVERY_SERVICE_NAME:-discovery} | wc -l' contains '0'
