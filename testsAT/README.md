# README

## ACCEPTANCE TESTS - MICROSTRATEGY GROUP

### How to execute the microstrategy query set

mvn clean verify -Dgroups=Microstrategy


## ACCEPTANCE TESTS

Cucumber automated and manual acceptance tests.
This module depends on a QA library (stratio-test-bdd), where common logic and steps are implemented.

## EXECUTION

These tests will be executed as part of the continuous integration flow as follows:

mvn verify [-D\<ENV_VAR>=\<VALUE>] [-Dit.test=\<TEST_TO_EXECUTE>|-Dgroups=\<GROUP_TO_EXECUTE>]

Example:

### Create policies in Gosec
mvn clean verify -Dgroups=create_policy -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.31.0 -DREGISTERSERVICEOLD=true -DCLUSTER_ID=nightly -DDISCOVERY_POLICIES=true -DlogLevel=DEBUG -DPOSTGRES_VERSION=1.3.0

### Install Postgres dependencies
mvn clean verify -Dgroups=config_postgres -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.31.0 -DCLUSTER_ID=nightly -DlogLevel=DEBUG

### Install Discovery
mvn clean verify -Dgroups=install_discovery -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.31.0 -DDISCOVERY_SERVICE_VHOST=nightlypublic.labs.stratio.com -DlogLevel=DEBUG

### Register Postgres database
mvn clean verify -Dgroups=connection_PG -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly -DDISCOVERY_SERVICE_VHOST=nightlypublic.labs.stratio.com -DDISC_VERSION=0.31.0 -DlogLevel=DEBUG -DSELENIUM_GRID=sl.demo.stratio.com:4444 -DFORCE_BROWSER=chrome_64datagov
## For launch this group it's necessary having deployed next component:
- docker run -d --name sl selenium/hub:3.9.1 && docker run -d -v /dev/shm:/dev/shm --name docker-selenium-chrome -e HUB_HOST=sl.demo.stratio.com -e HUB_PORT=4444 -e SE_OPTS="-browser browserName=chrome,version=64datagov " selenium/node-chrome-debug:3.9.1

### Register Crossdata database
mvn clean verify -Dgroups=connection_XD -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly -DDISCOVERY_SERVICE_VHOST=nightlypublic.labs.stratio.com -DDISC_VERSION=0.31.0 -DlogLevel=DEBUG -DSELENIUM_GRID=sl.demo.stratio.com:4444 -DFORCE_BROWSER=chrome_64datagov
## For launch this group it's necessary having deployed next component:
- docker run -d --name sl selenium/hub:3.9.1 && docker run -d -v /dev/shm:/dev/shm --name docker-selenium-chrome -e HUB_HOST=sl.demo.stratio.com -e HUB_PORT=4444 -e SE_OPTS="-browser browserName=chrome,version=64datagov " selenium/node-chrome-debug:3.9.1

### Login Tests
mvn clean verify -Dgroups=login -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly -DDISC_VERSION=0.31.0 -DCLUSTER_ID=nightly -DlogLevel=DEBUG -DDISCOVERY_SERVICE_VHOST=nightlypublic.labs.stratio.com -DSELENIUM_GRID=sl.demo.stratio.com:4444 -DFORCE_BROWSER=chrome_64datagov -DMODHEADER_PLUGIN=src/test/resources/chromePlugins/ModHeader_v2.2.3.crx -DGROUP_LIST=testadmin,group1 -DUSERNAME=Demo -DGROUP=group1 -DADMIN_GROUP=testadmin
## For launch this group it's necessary having deployed next component:
- docker run -d --name sl selenium/hub:3.9.1 && docker run -d -v /dev/shm:/dev/shm --name docker-selenium-chrome -e HUB_HOST=sl.demo.stratio.com -e HUB_PORT=4444 -e SE_OPTS="-browser browserName=chrome,version=64datagov " selenium/node-chrome-debug:3.9.1

### Purge Discovery
mvn clean verify -Dgroups=purge_discovery -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.31.0 -DlogLevel=DEBUG

### Delete changes in Postgres
mvn clean verify -Dgroups=purge_postgres -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.31.0 -DCLUSTER_ID=nightly -DlogLevel=DEBUG

### Delete policies in Gosec
mvn clean verify -Dgroups=delete_policy -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DlogLevel=DEBUG -DDISC_VERSION=0.31.0 -DREGISTERSERVICEOLD=false -DCLUSTER_ID=nightly -DDISCOVERY_POLICIES=true -DPOSTGRES_VERSION=1.3.0

### Nightly
mvn clean verify -Dgroups=nightly -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.31.0 -DREGISTERSERVICEOLD=false -DDISCOVERY_SERVICE_VHOST=nightlypublic.labs.stratio.com -DCLUSTER_ID=nightly -DDISCOVERY_POLICIES=true -DSELENIUM_GRID=sl.demo.stratio.com:4444 -DFORCE_BROWSER=chrome_64datagov -DlogLevel=DEBUG -DPOSTGRES_VERSION=1.3.0
## For launch this group it's necessary having deployed next component:
- docker run -d --name sl selenium/hub:3.9.1 && docker run -d -v /dev/shm:/dev/shm --name docker-selenium-chrome -e HUB_HOST=sl.demo.stratio.com -e HUB_PORT=4444 -e SE_OPTS="-browser browserName=chrome,version=64datagov " selenium/node-chrome-debug:3.9.1

By default, in jenkins we will execute the group basic, which should contain a subset of tests, that are key to the functioning of the module and the ones generated for the new feature.

All tests, that are not fully implemented, should belong to the group manual and be tagged with '@ignore @manual'
