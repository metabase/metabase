@rest
Feature: Install Postgres

  Background: Initial setup
    Given I open a ssh connection to '${BOOTSTRAP_IP}' with user '${REMOTE_USER:-operador}' using pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I run 'grep -Po '"root_token":"(\d*?,|.*?[^\\]")' /stratio_volume/vault_response | awk -F":" '{print $2}' | sed -e 's/^"//' -e 's/"$//'' in the ssh connection and save the value in environment variable 'vaultToken'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    And I securely send requests to '${DCOS_IP}:443'

  Scenario: [Basic Installation Postgres][01] Create config file
    Given I create file 'config_postgres_1.1.3.json' based on 'schemas/config_postgres_1.1.3.json' as 'json' with:
       | $.service.framework_service_name                           | UPDATE  | ${POSTGRES_DISCOVERY_SERVICE:-postgresdisc}                                  | n/a     |
       | $.service.framework_mesos_master                           | UPDATE  | ${POSTGRES_DISCOVERY_FWK_MESOS_MASTER:-master.mesos:2181}                    | n/a     |
       | $.service.framework_zookeeper                              | UPDATE  | ${POSTGRES_DISCOVERY_FWK_ZK:-master.mesos:2181}                              | n/a     |
       | $.service.framework_mesos_role                             | UPDATE  | ${POSTGRES_DISCOVERY_FWK_MESOS_ROLE:-postgresdisc}                           | n/a     |
       | $.service.framework_mesos_principal                        | UPDATE  | ${POSTGRES_DISCOVERY_FWK_MESOS_PPAL:-open}                                   | n/a     |
       | $.service.framework_service_cpus                           | REPLACE | ${POSTGRES_DISCOVERY_FWK_SERVICE_CPUS:-1}                                    | number  |
       | $.service.framework_service_mem                            | REPLACE | ${POSTGRES_DISCOVERY_FWK_SERVICE_MEM:-1024}                                  | number  |
       | $.service.framework_service_docker_image_force_pull        | REPLACE | ${POSTGRES_DISCOVERY_PULL_IMAGE:-true}                                       | boolean |
       | $.service.framework_log_level                              | UPDATE  | ${POSTGRES_DISCOVERY_FWK_LOG_LEVEL:-INFO}                                    | n/a     |
       | $.network_isolation.enabled                                | REPLACE | ${POSTGRES_DISCOVERY_CALICO_ENABLE:-false}                                   | boolean |
       | $.network_isolation.framework_isolation_network_name       | UPDATE  | ${POSTGRES_DISCOVERY_CALICO_NET:-stratio}                                    | n/a     |
       | $.availability_zones.framework_availability_zones_number   | REPLACE | ${POSTGRES_DISCOVERY_ZONES_NUMBER:-1}                                        | number  |
       | $.availability_zones.framework_availability_zone_tag       | UPDATE  | ${POSTGRES_DISCOVERY_ZONE_TAG:-dc}                                           | n/a     |
       | $.automatic_failover.framework_enable_automatic_failover   | REPLACE | ${POSTGRES_DISCOVERY_AUTOM_FAILOVER:-true}                                   | boolean |
       | $.automatic_failover.framework_lost_state_timeout_seconds  | REPLACE | ${POSTGRES_DISCOVERY_TIMEOUT_SECS:-60}                                       | number  |
       | $.dns_discovery.framework_dns_type                         | UPDATE  | ${POSTGRES_DISCOVERY_DNS_FWK_TYPE:-mesos}                                    | n/a     |
       | $.dns_discovery.framework_dns_domain                       | UPDATE  | ${POSTGRES_DISCOVERY_DNS_FWK_DOMAIN:-mesos}                                  | n/a     |
       | $.dns_discovery.framework_consul_address                   | UPDATE  | ${POSTGRES_DISCOVERY_DNS_FWK_CONSUL_ADDRESS:-master.mesos}                   | n/a     |
       | $.docker.framework_docker_image_force_pull                 | REPLACE | ${POSTGRES_DISCOVERY_DOCKER_FWK_FORCE_PULL:-true}                            | boolean |
       | $.docker.framework_docker_launch_retries                   | REPLACE | ${POSTGRES_DISCOVERY_DOCKER_FWK_LAUNCH_RETRIES:-5}                           | number  |
       | $.docker.framework_docker_retry_delay_seconds              | REPLACE | ${POSTGRES_DISCOVERY_DOCKER_RETRY_DELAY:-5}                                  | number  |
       | $.security.enable_security                                 | REPLACE | ${POSTGRES_DISCOVERY_SEC_ENABLE:-true}                                       | boolean |
       | $.security.vault.enable_dynamic_auth                       | REPLACE | ${POSTGRES_DISCOVERY_SEC_VAULT_DYNAMIC:-true}                                | boolean |
       | $.security.vault.role_name                                 | UPDATE  | ${POSTGRES_DISCOVERY_SEC_VAULT_ROLE:-open}                                   | n/a     |
       | $.security.vault.vault_hosts                               | UPDATE  | ${POSTGRES_DISCOVERY_SEC_VAULT_HOSTS:-vault.service.paas.labs.stratio.com}   | n/a     |
       | $.security.vault.vault_port                                | REPLACE | ${POSTGRES_DISCOVERY_SEC_VAULT_PORT:-8200}                                   | number  |
       | $.security.vault.vault_token                               | UPDATE  | !{vaultToken}                                                                | n/a     |
       | $.security.paas.framework_enable_mesos_sec                 | REPLACE | ${POSTGRES_DISCOVERY_SEC_PAAS_FWK_ENABLE_MESOS_SEC:-true}                    | boolean |
       | $.security.paas.framework_enable_marathon_sec              | REPLACE | ${POSTGRES_DISCOVERY_SEC_PAAS_FWK_ENABLE_MARATHON_SEC:-true}                 | boolean |
       | $.security.paas.disable_dynamic_reservation                | REPLACE | ${POSTGRES_DISCOVERY_SEC_PAAS_DISABLE_DYN_RESERVATION:-false}                | boolean |
       | $.security.api.enable_api_security                         | REPLACE | ${POSTGRES_DISCOVERY_SEC_API_ENABLE_API_SEC:-false}                          | boolean |
       | $.security.api.api_authorized_cn                           | UPDATE  | ${POSTGRES_DISCOVERY_SEC_API_AUTH_CN:-admin,zookeeper}                       | n/a     |
       | $.security.postgresql.postgres_security_type               | UPDATE  | ${POSTGRES_DISCOVERY_SEC_POSTGRES_TYPE:-MD5}                                 | n/a     |
       | $.postgresql.cpu                                           | REPLACE | ${POSTGRES_DISCOVERY_PG_CPU:-0.5}                                            | number  |
       | $.postgresql.memory                                        | REPLACE | ${POSTGRES_DISCOVERY_PG_CPU:-256.0}                                          | number  |
       | $.postgresql.high_availability                             | REPLACE | ${POSTGRES_DISCOVERY_PG_CPU:-true}                                           | boolean |
       | $.postgresql.log_level                                     | UPDATE  | ${POSTGRES_DISCOVERY_PG_CPU:-INFO}                                           | n/a     |
       | $.postgresql.disk.data_disk.disk_space                     | REPLACE | ${POSTGRES_DISCOVERY_PG_DISK_DATADISK_DISKSPACE:-256.0}                      | number  |
       | $.postgresql.disk.data_disk.disk_type                      | UPDATE  | ${POSTGRES_DISCOVERY_PG_DISK_DATADISK_DISKTYPE:-ROOT}                        | n/a     |
       | $.postgresql.disk.index_disk.enable_disk                   | REPLACE | ${POSTGRES_DISCOVERY_PG_DISK_INDEXDISK_ENABLEDISK:-true}                     | boolean |
       | $.postgresql.disk.index_disk.disk_space                    | REPLACE | ${POSTGRES_DISCOVERY_PG_DISK_INDEXDISK_DISKSPACE:-256.0}                     | number  |
       | $.postgresql.disk.index_disk.disk_type                     | UPDATE  | ${POSTGRES_DISCOVERY_PG_DISK_INDEXDISK_DISKTYPE:-ROOT}                       | n/a     |
       | $.postgresql.disk.wal_disk.enable_disk                     | REPLACE | ${POSTGRES_DISCOVERY_PG_DISK_WALDISK_ENABLEDISK:-true}                       | boolean |
       | $.postgresql.disk.wal_disk.disk_space                      | REPLACE | ${POSTGRES_DISCOVERY_PG_DISK_WALDISK_DISKSPACE:-256.0}                       | number  |
       | $.postgresql.disk.wal_disk.disk_type                       | UPDATE  | ${POSTGRES_DISCOVERY_PG_DISK_WALDISK_DISKTYPE:-ROOT}                         | n/a     |
       | $.postgresql.users.admin_user                              | UPDATE  | ${POSTGRES_DISCOVERY_PG_USERS_ADMIN_USER:-postgres}                          | n/a     |
       | $.postgresql.users.service_user                            | UPDATE  | ${POSTGRES_DISCOVERY_PG_USERS_SERVICE_USER:-serviceuser}                     | n/a     |

  Scenario: [Basic Installation Discovery][02] Install using config file and cli
    Given I open a ssh connection to '${DCOS_CLI_HOST:-dcos-cli.demo.labs.stratio.com}' with user '${CLI_USER:-root}' and password '${CLI_PASSWORD:-stratio}'
    When I outbound copy 'target/test-classes/config_postgres_${DISC_POSTGRES_VERSION:-1.1.3}.json' through a ssh connection to '/tmp'
    And I run 'dcos package install --package-version=${DISC_POSTGRES_VERSION:-1.1.3} --options=/tmp/config_postgres_${DISC_POSTGRES_VERSION:-1.1.3}.json ${DISC_POSTGRES_PACKAGE:-Stratio-Community-Postgres}' in the ssh connection
    Then the command output contains 'Installing Marathon app for package [${DISC_POSTGRES_PACKAGE:-Stratio-Community-Postgres}] version [${DISC_POSTGRES_VERSION:-1.1.3}]'
    Then the command output contains 'Enjoy!!!!'
    And I authenticate to DCOS cluster '${DCOS_IP}' using email '${DCOS_USER:-admin}' with user '${REMOTE_USER:-operador}' and pem file 'src/test/resources/credentials/${PEM_FILE:-key.pem}'
    And I securely send requests to '${DCOS_IP}:443'
    Then in less than '200' seconds, checking each '10' seconds, I send a 'GET' request to '/service/${POSTGRES_DISCOVERY_SERVICE:-postgresdisc}/v1/service/status' so that the response contains 'RUNNING'
    And in less than '200' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_DISCOVERY_SERVICE:-postgresdisc}/v1/service/status' so that the response contains '"pg-0001","role":"master","status":"RUNNING"'
    And in less than '200' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_DISCOVERY_SERVICE:-postgresdisc}/v1/service/status' so that the response contains '"pg-0002","role":"sync_slave","status":"RUNNING"'
    And in less than '200' seconds, checking each '20' seconds, I send a 'GET' request to '/service/${POSTGRES_DISCOVERY_SERVICE:-postgresdisc}/v1/service/status' so that the response contains '"pg-0003","role":"async_slave","status":"RUNNING"'

  Scenario: [Basic Installation Discovery][03] Obtain postgreSQL ip and port
    Given I send a 'GET' request to '/service/${POSTGRES_FRAMEWORK_ID_DISC:-postgresdisc}/v1/service/status'
    Then the service response status must be '200'
    And I save element in position '0' in '$.status[?(@.role == "master")].assignedHost' in environment variable 'postgresMD5_IP'
    And I save element in position '0' in '$.status[?(@.role == "master")].ports[0]' in environment variable 'postgresMD5_Port'
    And I wait '5' seconds

  Scenario: [Basic Installation Discovery][04] Create database for Discovery
    Given I connect with JDBC to database '${POSTGRES_FRAMEWORK_DEFAULT_DB:-postgres}' on host '!{postgresMD5_IP}' and port '!{postgresMD5_Port}' with user '${POSTGRES_FRAMEWORK_USER:-postgres}' and password '${POSTGRES_FRAMEWORK_PASSWORD:-stratio}'
    When I execute query 'CREATE DATABASE ${DISCOVERY_NAME_DB:-discovery};'
    Then I close database connection
