# Scaling Metabase

Metabase is scalable, battle-tested software used by tens of thousands of companies. It supports high availability via horizontal scaling, and high performance via vertical scaling. That, and it's efficient out of the box: a single core with 4 gigs of RAM can scale Metabase to hundreds of users, and there's no need to adjust your application configuration if you want to run Metabase on multiple machines.

And if you don't want to deal with the care and feeding of your application: Metabase also offers a [hosted solution](https://www.metabase.com/hosting/) that takes operating Metabase off your plate so you can focus on your data.

This article provides guidance on how to keep Metabase running smoothly in production as the numbers of users and data sources increase. 

We'll cover:

- [**Factors that impact Metabase performance and availability**](#factors-that-impact-metabase-performance-and-availability)
- [**Vertical scaling.**](#vertical-scaling) Running a single instance of Metabase with more cores and memory. Vertical scaling can improve Metabase application performance.
- [**Horizontal scaling.**](#horizontal-scaling) Running multiple instances of Metabase. Horizontal scaling can improve availability/reliability of your Metabase application.
- [**Data warehouse.**](#data-warehouse)
- [**Metabase application best practices.**](#metabase-application-best-practices) Tuning dashboards and questions to improve performance.
- [**Hosted Metabase.**](#hosted-metabase) Leave running the Metabase application to us so you can focus on your business.

We'll discuss scaling strategies at a high level, but because each system is different, you'll have to translate these strategies to your particular environment and usage.

## Factors that impact Metabase performance and availability

Metabase scales well (both vertically and horizontally), but Metabase is only one component of your data warehouse, and the overall performance of your system will depend on the composition of your system and your usage patterns.

Major factors that impact your experience using Metabase include:

- the number of databases connected to Metabase.
- the number of tables in each database.
- the efficiency of your data warehouse.
- the number of questions in your dashboards.

For example, it will not matter how many instances of Metabase you run if a question needs to grab records from thousands of tables in a database. That's just going to take a while. The solution in that case is either to re-evaluate your need for that data (do you really need all that info every time?), or to find ways to improve the performance of your database, such as reorganizing your data, or improving the indexing of your data.

But first, let's make sure our Metabase application is well-tuned to scale.

## Vertical scaling

Vertical scaling is the brute force approach. Give Metabase more cores and memory, and it will have more resources available to do its work. If you are experiencing performance issues related to the application itself (i.e. unrelated to the breadth and magnitude of your databases), running Metabase on a more powerful machine can help improve performance.

Metabase is already efficient out of the box. For example, for a starter Metabase instance on AWS, we recommend running Metabase using Elastic Beanstalk on a `t2.small` instance, and scaling up from there. That's a single core machine with 2 gigabytes of RAM. Machines with with 4-8 gigs of RAM should handle hundreds of users, and you can bump the number of cores and gigabytes of memory if needed.

## Horizontal scaling

Horizontal scaling involves running multiple instances of Metabase and using a load balancer to direct traffic to the instances. The primary use cases for horizontal scaling is to improve reliability (a.k.a. "high availability").

Metabase is set up for horizontal scaling out of the box, so you don't need any special configuration to run multiple instances of Metabase. The user session data is stored in the external application database, so users don't have to worry about losing saved work if one machine goes down, and administrators don't have to deal with configuring sticky sessions to make sure users are connected to the right Metabase instance. The load balancer will route users to an available instance so users can keep right on working.

When scaling horizontally, however, you must host the application database externally, using a relational database like PostgreSQL, so that all instances of Metabase can share a common database. Though you can manage your own application database, we recommend using a managed database solution with high availability, such as [AWS's Relational Database Service (RDS)](https://aws.amazon.com/rds/), [Google Cloud Platform's Cloud SQL](https://cloud.google.com/sql), [Microsoft Azure's SQL Database](https://azure.microsoft.com/en-us/services/sql-database/), or similar offering, so your application database will always be available for your Metabase instances. Managed database solutions are especially useful for Enterprise customers who take advantage of Metabase's [auditing functionality](https://www.metabase.com/docs/latest/enterprise-guide/audit.html).

### Time-based horizontal scaling

Some customers adjust the number of Metabase instances based on the time of day. For example, customers will spin up multiple instances of Metabase in the morning to handle a burst of traffic when users log in and run their morning dashboards, then spin the extra Metabase instances down in the afternoon (or at night, or on the weekends) to save money on cloud spend.

### Configuring the load balancer

Metabase's API has a health check endpoint `/api/health` that load balancers can use to determine whether or not a Metabase instance is up and responding to requests. If the instance is healthy, the endpoint will return `{"status":"ok"}`.

## Data warehouse

Architecting a data warehouse is beyond the scope of this article, but your queries in Metabase will only be as fast as your databases can return data. If you have questions that ask for data that takes your database a long time to retrieve, those query times will impact your experience, regardless of how fast Metabase is.

In general, there are three ways to improve data warehouse performance:

- **Anticipate questions**. Structure your data in a way that anticipates usage patterns and reduces the number of joins. Use scheduled ETLs to create new tables that bring together frequently queried data from multiple sources.
- **Tune your database.** Read up on the documentation for your database to learn how to improve its performance via indexing and caching.
- **Improve the precision of your questions**. Filter your data with WHERE clauses, and add limits to your queries. You should also take advantage of Metabase's data exploration tools to understand your data so you can only grab the data relevant to the question you're trying to answer.

## Metabase application best practices

Here are some strategies to get the most out of your Metabase application:

- [Use an external database to store you Metabase application data](#use-an-external-database-to-store-your-metabase-application-data)
- [Upgrade to the latest version of Metabase](#upgrade-to-the-latest-version-of-metabase)
- [Only ask for the data you need](#only-ask-for-the-data-you-need)
- [Cache your queries](#cache-your-queries)
- [Audit your application](#audit-your-application)
- [Keep dashboards to 7 questions or fewer](#keep-dashboards-to-7-questions-or-fewer)
- [Update your browser](#update-your-browser)

### Use an external database to store your Metabase application data

The application database stores all of your questions, dashboards, collections, permissions, and other data related to the Metabase application. We recommend you use an external database (like PostgreSQL or MySQL) to manage your application database. You can also use a managed relational database, like AWS RDS, which will auto-scale for your needs.

### Upgrade to the latest version of Metabase

If you haven't already, we highly recommend you update to the latest Metabase version to get the most recent performance improvements.

### Only ask for the data you need

In general, you should only query the data you need. If you set up a dashboard that you'll be viewing daily, you can reduce load times by limiting the number of records your queries return.

If you have many users running big queries, it won't matter that Metabase is fast: the users will get their data only as fast as your database(s) can return the requested records.

### Cache your queries

You can [configure caching](https://www.metabase.com/docs/latest/administration-guide/14-caching.html) on questions to store their results. Metabase will show users the timestamp for the results, and users can manually refresh the results if they want to rerun the query. Caching is a great way to save time (and money) for results that do not update frequently.

### Audit your application

Metabase's Enterprise Edition offers [auditing tools](https://www.metabase.com/docs/latest/enterprise-guide/audit.html) for you to monitor the usage and performance of your application. You can, for example, see how many questions are being asked, by whom, and how long the questions took to run. 

### Keep dashboards to 7 questions or fewer

Sometimes people go overboard with dashboards, loading them up with 50 questions or more. When a dashboard with 50 questions loads, it sends 50 simultaneous requests to that database asking for data. And depending on the size of that database and the number of tables in that database, it can be quite some time before those records return to answer all of those questions.

Encourage your users to keep their dashboards focused on telling a story about your data with just a handful of questions. Think essays, or short stories, not books.

### Update your browser

Metabase is a web application, and can benefit from the latest and greatest versions of browsers like Firefox, Chrome, Edge, and Safari.

## Supported deployments

### Hosted Metabase

Metabase now offers a [hosted solution](https://www.metabase.com/hosting/), where we handle scaling Metabase for you. You'll still have to ensure your data sources are performant, but you'll no longer have to manage running the Metabase application.

### AWS Elastic Beanstalk

Check out our [guide to setting up Metabase on Elastic Beanstalk](running-metabase-on-elastic-beanstalk.md). We use Elastic Beanstalk to host our internal Metabase application.

### Heroku

See [running Metabase on Heroku](running-metabase-on-heroku.md).

### Docker & Kubernetes

See [running Metabase on Kubernetes](running-metabase-on-kubernetes).

### Other cloud providers

Google Cloud Platform, Microsoft Azure, Digital Ocean, and other cloud providers offer other great alternatives for hosting your Metabase application.