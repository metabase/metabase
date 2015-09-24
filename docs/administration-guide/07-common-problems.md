

## Common Problems

### Startup fails due to Migrations being locked

Sometimes Metabase will fail to startup due to a lingering lock. 

Solution:
Run  `java -cp metabase-master-2015-08-06-3da1178.jar org.h2.tools.Server -webPort 3000` in the commandline

open the web console (it prints a url)

connect to JDBC URL jdbc:h2:PATH/TO/metabase.db;IFEXISTS=TRUE  # note the .h2.db suffix is omitted
blank username, blank password

run `delete from databasechangeloglock;`

kill the h2 server and restart metabase.


