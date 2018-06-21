@rest
Feature: Uninstall Postgres instances

  @runOnEnv(DISC_VERSION=0.28.9,POSTGRES_FRAMEWORK_ID_DISC=postgresdisc)
  Scenario: [Uninstallation Postgres][01] Uninstall Postgresdisc
    Given I wait '10' seconds
    Given I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I securely send requests to '${DCOS_IP}:443'
    When in less than '180' seconds, checking each '10' seconds, I send a 'POST' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/teardown' so that the response contains '"status":"ok"'
