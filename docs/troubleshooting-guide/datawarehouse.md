# Connecting to data warehouses with Metabase

<div class='doc-toc' markdown=1>
- [The data warehouse server is down](#server-down)
- [The data warehouse server is denying connections from your IP address](#server-denying-connections)
- [Incorrect credentials](#incorrect-credentials)
- [Connection timeout: your question took too long](#connection-timeout-took-too-long)
- [Connections cannot be acquired from the underlying database](#connections-cannot-be-acquired)
</div>

If you're having trouble connecting to your data warehouse, run through these steps to identify the problem.

1. Is the data warehouse server running ([see below](#server-down))?
2. Can you connect to the data warehouse using another client from a machine you know should have access ([see below](#server-denying-connections))?
3. Can you connect to the data warehouse from another client from the machine you're running Metabase on?
4. Have you added the connection in Metabase?
5. Have you examined the logs to verify that the sync process started and that no errors were thrown? (You can view the logs in the Metabase process, or in the app itself by going to the Admin Panel, selecting "Troubleshooting", and then selecting "Logs".)
6. Have you run a native `SELECT 1` query to verify the connection to the data warehouse?
7. If the sync process has completed, can you ask a [native question][native-question] to verify that you are able to use the database?

<h2 id="server-down">The data warehouse server is down</h2>

**How to detect this:** Database servers occasionally go down. If you're using a hosted database service, go to its console and verify its status. If you have direct access to a command-line interface, log in and make sure that it's up and running and accepting queries.

**How to fix this:** It's out of the scope of this troubleshooting guide to get your data warehouse server back up---please check with whomever set it up for you.

<h2 id="server-denying-connections">The data warehouse server is denying connections from your IP address</h2>

**How to detect this:** If you can access the server from a bastion host or another machine, use the `nc` command (or your operating system's equivalent) to verify that you can connect to the host on a given port. Different databases use different ports; for a default PostgreSQL configuration (which listens on port 5432), the command would be:

```
nc -v your-db-host 5432
```

**How to fix this:** It's out of the scope of this troubleshooting guide to change your network configuration---please check with whomever is responsible for the network your data warehouse is running on.

<h2 id="incorrect-credentials">Incorrect credentials</h2>

**How to detect this:** If you've verified that you can connect to the data warehouse's host and port, the next step is to check your credentials. Again, connecting to a data warehouse depends on your database server software; for PostgreSQL, a command like the one shown below will do the job:

```
psql -h HOSTNAME -p PORT -d DATABASENAME -U DATABASEUSER`
```

If your credentials are incorrect, you should see an error message letting you know if the database name or the user/password are incorrect.

**How to fix this:** If the database name or the user/password combination are incorrect, ask the person running your data warehouse for correct credentials.

<h2 id="connection-timeout-took-too-long">Connection timeout: your question took too long</h2>

**How to detect this:** If you see the error message, "Your question took too long," something in your setup timed out. Depending on the specifics of your deployment, the problem could be in:

- your load balancer;
- your reverse proxy server (e.g., Nginx);
- Jetty;
- your database; or
- your cloud service, such as AWS's Elastic Beanstalk, EC2, Heroku, or Google App Engine.

**How to fix this:** Fixing this depends on your specific setup. These resources may help:

- [Configuring Jetty connectors][configuring-jetty]
- [EC2 Troubleshooting][ec2-troubleshooting]
- [Elastic Load Balancing Connection Timeout Management][elb-timeout]
- [Heroku timeouts][heroku-timeout]
- [App Engine: Dealing with DeadlineExceededErrors][app-engine-timeout]

<h2 id="connections-cannot-be-acquired">Connections cannot be acquired from the underlying database</h2>

**How to detect this:** Metabase fails to connect to your data warehouse and the Metabase server logs include the error message `Connections cannot be acquired from the underlying database!

**How to fix this:** Navigate to the options for your data warehouse and locate the "Additional JDBC Connection Strings" option, then add `trustServerCertificate=true` as an additional string.

[app-engine-timeout]: https://cloud.google.com/appengine/articles/deadlineexceedederrors
[configuring-jetty]: https://www.eclipse.org/jetty/documentation/current/configuring-connectors.html
[ec2-troubleshooting]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/TroubleshootingInstancesConnecting.html
[elb-timeout]: https://aws.amazon.com/blogs/aws/elb-idle-timeout-control/
[heroku-timeout]: https://devcenter.heroku.com/articles/request-timeout
[native-question]: ../users-guide/writing-sql.html
