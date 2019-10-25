## Troubleshooting Process

1. Verify that the data warehouse server is running
2. Try connecting to the data warehouse using another client from a machine you know should have access
3. Try connecting to the data warehouse from another client from the machine you're running Metabase on
4. Add the connection in Metabase
5. Examine the logs to verify that the sync process started and that no errors were thrown
6. Run a native "SELECT 1" query to verify the connection to the data warehouse
7. If the sync process has completed, attempt to do a "Raw data" query to verify that you are able to use the database

## Specific Problems

### The Data Warehouse Server is not running

#### How to detect this:

As silly as this sounds, occasionally database servers go down.

If you are using a hosted database service, go to its console and verify that its status is Green. If you have direct access to a command line interface, log in and make sure that it is up and running and accepting queries.


#### How to fix this:

It's out of the scope of this troubleshooting guide to get your data warehouse server back up. Check with whomever set it up for you!

### The Data Warehouse Server is not accepting connections from your IP

#### How to detect this

If you are able to access the server from a bastion host, or another machine, use `nc` on Linux (or your operating system's equivalent) to verify that you can connect to the host on a given port.

The port a data warehouse's server software is attached to varies, but an example for a default PostgreSQL configuration (which listens on port 5432) would be:

`nc -v your-db-host 5432`

#### How to fix this:

It's out of the scope of this troubleshooting guide to change your network configuration. Talk to whomever is responsible for the network your data warehouse is running on.

### Incorrect credentials

#### How to detect this:

If you've verified that you can connect to the host and port on the data warehouse, the next step is to check your credentials.

Again, connecting to a data warehouse depends on your database server software, but for PostgreSQL, the below uses a command line interface (`psql`) to connect to your data warehouse.

`psql -h HOSTNAME -p PORT -d DATABASENAME -U DATABASEUSER`

If your credentials are incorrect, you should see an error message letting you know if the database name or the user/password are incorrect.

#### How to fix this:

If the database name or the user/password combination are incorrect, ask the person running your data warehouse for correct credentials.

### Connection time out: "Your question took too long"

#### How to detect this:

If you see the error message, "Your question took too long," something in your setup timed out. Depending on the specifics of your deployment, this could be a timeout in:

- Your load balancer
- Your reverse proxy server (e.g. Nginx)
- Jetty
- Your database
- Elastic Beanstalk or EC2
- Heroku
- App Engine

#### How to fix this:

Fixing this depends on your specific setup. Here are some potentially helpful resources:

- [How to Fix 504 Gateway Timeout using Nginx](https://www.scalescale.com/tips/nginx/504-gateway-time-out-using-nginx/)
- [Configuring Jetty connectors](https://www.eclipse.org/jetty/documentation/current/configuring-connectors.html)
- [EC2 Troubleshooting](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/TroubleshootingInstancesConnecting.html)
- [Elastic Load Balancing Connection Timeout Management](https://aws.amazon.com/blogs/aws/elb-idle-timeout-control/)
- [Heroku timeouts](https://devcenter.heroku.com/articles/request-timeout)
- [App Engine: Dealing with DeadlineExceededErrors](https://cloud.google.com/appengine/articles/deadlineexceedederrors)


### MySQL: Unable to log in with correct credentials
#### How to detect this
Metabase fails to connect to your MySQL server with the error message "Looks like the username or password is incorrect", but you are sure that the username and password is correct. You may have created the MySQL user with an allowed host other than that which you are connecting from.

For example, if the MySQL server is running in a Docker container, and your `metabase` user was created with `CREATE USER 'metabase'@'localhost' IDENTIFIED BY 'thepassword';`, the `localhost` will be resolved to the Docker container, and not the host machine, causing access to be denied.

You can identify this issue, by looking in the Metabase server logs for the error message `Access denied for user 'metabase'@'172.17.0.1' (using password: YES)`. Note the host name `172.17.0.1` (in this case a Docker network IP address), and `using password: YES` at the end.

You will see the same error message when attempting to connect to the MySQL server with the command-line client: `mysql -h 127.0.0.1 -u metabase -p`

#### How to fix this
Recreate the MySQL user with the correct host name: `CREATE USER 'metabase'@'172.17.0.1' IDENTIFIED BY 'thepassword';`. Otherwise, if necessary, a wildcard may be used for the host name: `CREATE USER 'metabase'@'%' IDENTIFIED BY 'thepassword';`

That user's permissions will need to be set:

```sql
GRANT SELECT ON targetdb.* TO 'metabase'@'172.17.0.1';
FLUSH PRIVILEGES;
```

Remember to `DROP USER 'metabase'@'localhost';` the old user.


### MySQL: Unable to log in to MySQL 8 with correct credentials

#### How to detect this
Metabase fails to connect to your MySQL 8 server with the error message "Looks like the username or password is incorrect", and the Metabase server logs include the error message `Access denied for user 'metabase'@'172.17.0.1' (using password: NO)`. Note the `using password: NO` at the end.

You may still be able to successfully connect to the server using another MySQL client, such as the command-line client: `mysql -h 127.0.0.1 -u metabase -p`

#### How to fix this
Change the authentication plugin used by the Metabase user to `mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';`

This is necessary because the MariaDB connector, used by Metabase to connect to MySQL servers, unfortunately does not support MySQL 8's default authentication plugin. From [StackOverflow](https://stackoverflow.com/a/54190598):

> MySQL 8 uses caching_sha2_password rather than mysql_native_password as of MySQL 5.7 (and MariaDB).
>
> "caching_sha2_password, it is as of MySQL 8.0 the preferred authentication plugin, and is also the default authentication plugin rather than mysql_native_password. This change affects both the server and the libmysqlclient client library:"
>
> https://dev.mysql.com/doc/refman/8.0/en/upgrading-from-previous-series.html#upgrade-caching-sha2-password
>
> MariaDB's Java Connector does not yet implement this, but has a task assigned:
>
> https://jira.mariadb.org/browse/CONJ-663
