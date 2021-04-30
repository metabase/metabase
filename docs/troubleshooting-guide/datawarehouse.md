## Troubleshooting your database connection

If you're having trouble connecting to your data warehouse, run through these steps to identify the problem.

1. Verify that the data warehouse server is running. See [the data warehouse server is down](#the-data-warehouse-server-is-down).
2. Try connecting to the data warehouse using another client from a machine you know should have access. See [the data warehouse server is denying connections from your IP address](#the-data-warehouse-server-is-denying-connections-from-your-ip-address).
3. Try connecting to the data warehouse from another client from the machine you're running Metabase on.
4. Add the connection in Metabase.
5. Examine the logs to verify that the sync process started and that no errors were thrown. You can view the logs in the Metabase process, or in the app itself in the Admin section -> Troubleshooting -> Logs.
6. Run a native `SELECT 1` query to verify the connection to the data warehouse.
7. If the sync process has completed, ask a [native question](../users-guide/writing-sql.md) to verify that you are able to use the database.

## Specific Problems

- [The data warehouse server is down](#the-data-warehouse-server-is-down)
- [The data warehouse server is denying connections from your IP address](#the-data-warehouse-server-is-denying-connections-from-your-ip-address)
- [Incorrect credentials](#incorrect-credentials)
- [Connection timeout: your question took too long](#connection-timeout-your-question-took-too-long)

### The data warehouse server is down

**How to detect this:** As silly as this sounds, occasionally database servers go down. If you're using a hosted database service, go to its console and verify that its status is Green. If you have direct access to a command line interface, log in and make sure that it is up and running and accepting queries.

**How to fix this:** It's out of the scope of this troubleshooting guide to get your data warehouse server back up. Check with whomever set it up for you!

### The data warehouse server is denying connections from your IP address

**How to detect this:** If you can access the server from a bastion host, or another machine, use `nc` on Linux (or your operating system's equivalent) to verify that you can connect to the host on a given port. Different databases use different ports, but an example for a default PostgreSQL configuration (which listens on port 5432) would be:

```
nc -v your-db-host 5432`
```

**How to fix this:** It's out of the scope of this troubleshooting guide to change your network configuration. Talk to whomever is responsible for the network your data warehouse is running on.

### Incorrect credentials

**How to detect this:** If you've verified that you can connect to the host and port on the data warehouse, the next step is to check your credentials. Again, connecting to a data warehouse depends on your database server software, but for PostgreSQL, the below uses a command-line interface (`psql`) to connect to your data warehouse.

```
psql -h HOSTNAME -p PORT -d DATABASENAME -U DATABASEUSER`
```

If your credentials are incorrect, you should see an error message letting you know if the database name or the user/password are incorrect.

**How to fix this:** If the database name or the user/password combination are incorrect, ask the person running your data warehouse for correct credentials.

### Connection timeout: your question took too long

**How to detect this:** If you see the error message, "Your question took too long," something in your setup timed out. Depending on the specifics of your deployment, this could be a timeout in:

- Your load balancer
- Your reverse proxy server (e.g., Nginx)
- Jetty
- Your database
- Your cloud service: AWS's Elastic Beanstalk, EC2, Heroku, Google App Engine, etc.

**How to fix this:** Fixing this depends on your specific setup. Here are some potentially helpful resources:

- [Configuring Jetty connectors](https://www.eclipse.org/jetty/documentation/current/configuring-connectors.html)
- [EC2 Troubleshooting](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/TroubleshootingInstancesConnecting.html)
- [Elastic Load Balancing Connection Timeout Management](https://aws.amazon.com/blogs/aws/elb-idle-timeout-control/)
- [Heroku timeouts](https://devcenter.heroku.com/articles/request-timeout)
- [App Engine: Dealing with DeadlineExceededErrors](https://cloud.google.com/appengine/articles/deadlineexceedederrors)

### Error message: "Connections cannot be acquired from the underlying database!"

**How to detect this:** Metabase fails to connect to your data warehouse and the Metabase server logs include the error message `Connections cannot be acquired from the underlying database!`

**How to fix this:** Navigate to the options for your data warehouse and locate the Additional JDBC Connection Strings option, then add `trustServerCertificate=true` as an additional string.


