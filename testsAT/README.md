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

### Install Postgres dependencies
mvn clean verify -Dgroups=install_postgres -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.29.0-SNAPSHOT -DlogLevel=DEBUG

### Install Discovery
mvn clean verify -Dgroups=install_discovery -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DDISC_VERSION=0.29.0-SNAPSHOT -DlogLevel=DEBUG

### Install Discovery
mvn clean verify -Dgroups=purge_discovery -DBOOTSTRAP_IP=10.200.0.155 -DDCOS_IP=10.200.0.156 -DDCOS_CLI_HOST=dcos-cli-nightly.demo.stratio.com -DlogLevel=DEBUG

By default, in jenkins we will execute the group basic, which should contain a subset of tests, that are key to the functioning of the module and the ones generated for the new feature.

All tests, that are not fully implemented, should belong to the group manual and be tagged with '@ignore @manual'
