### NON FUNCTIONAL TESTS FOR DISCOVERY

These are the automated tests for Stability and Performance (PNF) of Discovery. The test plan can be seen here:

https://docs.google.com/spreadsheets/d/17IDDlMyR5DZ8XaXtS4yi0pO2yiltSJ6NyB2qQdezXSk/edit?ts=5aa01224#gid=1335535460  

The tests use PostgreSQL (<i>postgresdisc</i> instance) and Crossdata (<i>crossdata-1</i> instance). Before executing the tests it's needed to prepare the enviroment:
1. Install <i>postgresdisc</i> and <i>crossdata-1</i>.
2. Insert provided data.
3. Install Discovery.

##### INSERT DATA INTO <i>POSTGRESDISC</i>

1. SSH connect to the node in wich <i>postgresdisc</i> pg-0001 is launched.
```
$ ssh root@<NODE_IP> (pass: stratio)
```
2. Find out which docker container is the one corresponding to the <i>pg-0001</i>.
```
$ docker ps
$ docker inspect <CONTAINER_ID> (see if it is 'postgresdisc')	
```
3. Connect to that container.
```
$ docker exec -it <CONTAINER_ID> bash
```
4. Copy the SQL script to the container (<i>src/test/resources/postgresql-data.sql</i>) and launch it through PSQL console.
```
$ export PGPASSWORD=<POSTGRES_PASSWORD>
$ psql -U <POSTGRES_USER> -d <POSTGRES_DATABASE> -p <PORT> -f <PATH_TO_SQL_FILE>/postgresql-data.sql
 
i.e.:
$ export PGPASSWORD=stratio
$ psql -U postgres -d postgres -p 1032 -f /tmp/postgresql-data.sql
```

##### INSERT DATA INTO <i>CROSSDATA-1</i>

1. SSH connect to the node in wich <i>crossdata-1</i> is launched.
```
$ ssh root@<NODE_IP> (pass: stratio)
```
2. Find out which docker container is the one corresponding to <i>crossdata-1</i>.
```
$ docker ps
```
3. Connect to that container.
```
$ docker exec -it <CONTAINER_ID> bash
```
4. Copy the SQL script to the container (<i>src/test/resources/crossdata-data.sql</i>) and launch it Crossdata Shell.
```
$ /opt/sds/crossdata/bin/crossdata-shell --user crossdata-1 --queries-file <PATH_TO_SQL_FILE>/crossdata-data.sql
 
i.e.:
$ /opt/sds/crossdata/bin/crossdata-shell --user crossdata-1 --queries-file /tmp/crossdata-data.sql
```

##### CREATE DATABASES IN DISCOVERY

After all data is created and stored it's needed to generate, in Discovery, databases for Postgres and Crossdata2 through the admin web interface.

<u>IMPORTANT:</u> the queries executed in these tests depend on the <i>postgresdisc</i> database catalog, so in order to properly execute the tests it's mandatory to:
1. Have a fresh Discovery installation.
2. Add database for PostgreSQL.
3. Add database for Crossdata.

Otherwise the query must be changed in the classes <i>Test_CrossdataQuery</i> and/or <i>Test_PostgreSQLQuery</i>; or provided it as QUERY variable to maven.

<i>NOTE: remember to add the Dicovery VHOST configured in marathon-lb-sec to your /etc/hosts with the IP of the public node.</i>

### EXECUTING TESTS

Each test has its own profile in order to be launched easily with maven; also each test store its results in their own folder (as can be seen in <i>pom.xml</i>).

It's mandatory to provide the COOKIE variable to the maven command. You have to enter Discovery web interface and get it using the web browser development tools.
```
-DCOOKIE="<COOKIE>"
```
If the VHOST defined for <i>Discovery</i> in marathon-lb-sec is different from 'discovery.labs.stratio.com' then it is mandatory to provide BASE_URL variable to the maven command.
```
-DBASE_URL="https://<VHOST>/services/metabase"
```
The generic command is:
```
$ mvn clean -P<POM_PROFILE> gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
```
or
```
$ mvn clean -Dgatling.simulationClass=<CLASS_NAME_WITH_PACKAGE> gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
```
And all the implemented tests are:
```
$ mvn clean -PPerf10Users30MinutesHighActivityCrossdata gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf10Users30MinutesHighActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf10Users30MinutesLowActivityCrossdata gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf10Users30MinutesLowActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf150Users30MinutesHighActivityCrossdata gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf150Users30MinutesHighActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf150Users30MinutesLowActivityCrossdata gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf150Users30MinutesLowActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf200UsersMax5Minutes10UsersIncrementHighActivityCrossdata gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf200UsersMax5Minutes10UsersIncrementHighActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf200UsersMax5Minutes10UsersIncrementLowActivityCrossdata gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PPerf200UsersMax5Minutes10UsersIncrementLowActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PStab10Users24HoursLowActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
$ mvn clean -PStab10Users48HoursLowActivityPostgreSQL gatling:execute -DCOOKIE="<COOKIE>" [-DBASE_URL="https://<VHOST>/services/metabase"] -DlogLevel=DEBUG
```
