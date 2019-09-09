# Installing Metabase

Welcome to Metabase! We’re excited to help you get started. We've made our install process as simple as we can manage to get you right to your data.

Metabase is built and packaged as a Java jar file and can be run anywhere that Java is available (after installation, Metabase is accessed via a browser). If you’re looking to test out Metabase for yourself, we would recommend starting by [running the JAR file locally](operations-guide/running-the-metabase-jar-file.md). For long-term production use, we have many other install options, such as Docker and AWS - a full list is available [here](operations-guide/installing-metabase.md).

Metabase includes an application database. This is where Metabase stores information about users, saved questions, dashboards, etc. By default, the application database is a locally stored H2 database. We do not recommend using this H2 database in production, as it can be corrupted fairly easily. Luckily, it’s pretty simple to [migrate to a MySQL or Postgres database](operations-guide/migrating-from-h2.md).

No matter the underlying application database you use, we [recommend frequent back-ups](operations-guide/backing-up-metabase-application-data.html). 

Further along the set-up process you will need to enter credentials for your underlying databases. This information will be stored in the Metabase Application Database. To makes sure your information remains secure and safe from bad actors, configure Metabase to [encrypt your database details](operations-guide/encrypting-database-details-at-rest.html) at rest.

If you’re looking for a little extra customization of your Metabase instance, we have plenty of options, ranging from setting password complexity to configuring logging - you can read all about them in our [Operations Guide](https://metabase.com/docs/latest/operations-guide/start.html).

Once Metabase is up and running, it's time to get set up. We have a handy guide available [here](setting-up-metabase.md).

--

Run into trouble during your set-up process? You may want to check out our [troubleshooting guides](troubleshooting-guide/index.html) or ask for help from our community in our [discussion forums].

