# Scaling Metabase

Metabase is scalable, battle-tested software used by tens of thousands of companies. It supports high availability via horizontal scaling, and high performance via vertical scaling. Plus it's efficient out of the box: a single core machine with 4 gigs of RAM can scale Metabase to hundreds of users.

This article provides guidance on how to keep Metabase running smoothly in production as the numbers of users and data sources increase. 

We'll cover:

- [**Factors that impact Metabase performance and availability.**](#factors-that-impact-metabase-performance-and-availability)
- [**Vertical scaling.**](#vertical-scaling) Running a single instance of Metabase with more cores and memory. Vertical scaling can improve Metabase application performance.
- [**Horizontal scaling.**](#horizontal-scaling) Running multiple instances of Metabase. Horizontal scaling can improve availability/reliability of your Metabase application.
- [**Data warehouse tuning.**](#data-warehouse-tuning) Way out-of-scope for this article, but we'll discuss some general strategies for data warehousekeeping.
- [**Metabase application best practices.**](#metabase-application-best-practices) Tactics for improving the performance of questions and dashboards.
- [**Hosted Metabase.**](#hosted-metabase) Let Metabase handle application operation for you. 

Each data system is different, so we can only discuss scaling strategies at a high level, but you should be able to translate these strategies to your particular environment and usage.

## Factors that impact Metabase performance and availability

Metabase scales well (both vertically and horizontally), but Metabase is only one component of your data warehouse, and the overall performance of your system will depend on the composition of your system and your usage patterns.

Major factors that impact your experience using Metabase include:

- The number of databases connected to Metabase.
- The number of tables in each database.
- The efficiency of your data warehouse.
- The number of questions in your dashboards.

For example, it won't matter how many instances of Metabase you run if a question needs to run a query that takes 30 minutes to run. That's just going to take a while. The solution in that case is either to re-evaluate your need for that data (do you really need all that info every time?), or to find ways to improve the performance of your database, such as reorganizing, indexing, or caching your data.

But first, let's make sure our Metabase application is well-tuned to scale.

## Vertical scaling

Vertical scaling is the brute force approach. Give Metabase more cores and memory, and it will have more resources available to do its work. If you are experiencing performance issues related to the application itself (i.e. unrelated to the breadth and magnitude of your databases), running Metabase on a more powerful machine can help improve performance.

Metabase is already efficient out of the box. For example, for a starter Metabase instance on AWS, we recommend running Metabase using Elastic Beanstalk on a `t2.small` instance, and scaling up from there. That's a single core machine with 2 gigabytes of RAM. Machines with with 4-8 gigs of RAM should handle hundreds of users, and you can bump the number of cores and gigabytes of memory if needed.

## Horizontal scaling

Horizontal scaling involves running multiple instances of Metabase and using a load balancer to direct traffic to the instances. The primary use cases for horizontal scaling is to improve reliability (a.k.a. "high availability"). Metabase is set up for horizontal scaling out of the box, so you don't need any special configuration to run multiple instances of Metabase.

When scaling horizontally, however, you must use an external relational database like PostgreSQL to store your application data (all of your questions, dashboards, logs, and other Metabase data), so that all instances of Metabase can share a common database. We recommend an external database even if you only ever run one instance of Metabase in production, so an external database is not an added cost for horizontal scaling.

Regardless if you are running multiple Metabases or only a single instance, Metabase uses the external application database to store user session data in an external application database, so users don't have to worry about losing saved work if one or all Metabase instances go down, and administrators don't have to deal with configuring sticky sessions to ensure users are connected to the right Metabase instance. The load balancer will route users to an available instance so users can keep right on working.

Though you can maintain your own application database, we recommend using [AWS's Relational Database Service (RDS)](https://aws.amazon.com/rds/) so your application database will always be available for your Metabase instances. Managed database solutions are especially useful for Enterprise customers who take advantage of Metabase's [auditing functionality](../enterprise-guide/audit.md).

### Time-based horizontal scaling

Some customers adjust the number of Metabase instances based on the time of day. For example, customers will spin up multiple instances of Metabase in the morning to handle a burst of traffic when users log in and run their morning dashboards, then spin the extra Metabase instances down in the afternoon (or at night, or on the weekends) to save money on cloud spend.

### Configuring the load balancer

[Load balancers](https://en.wikipedia.org/wiki/Load_balancing_(computing)) direct traffic to multiple Metabase instances to ensure that each request gets the fastest response. If one instance of Metabase goes down temporarily, the load balancer will route user requests to another available instance.

Setting up a load balancer with Metabase is pretty straightforward. Metabase's API exposes a health check endpoint `/api/health` that load balancers can use to determine whether a Metabase instance is up and responding to requests. If the instance is healthy, the endpoint will return `{"status":"ok"}`, and the load balancer will know to route the request to another instance.

See our guide to [running Metabase on AWS Elastic Beanstalk](running-metabase-on-elastic-beanstalk.md) to see an example of setting up a load balancer to use the `/api/health` endpoint.

## Data warehouse tuning

Architecting a data warehouse is beyond the scope of this article, but you should know that your queries in Metabase will only be as fast as your databases can return data. If you have questions that ask for a lot of data that takes your database a long time to retrieve, those query times will impact your experience, regardless of how fast Metabase is.

Here are three ways you can improve data warehouse performance:

- **Structure your data in a way that anticipates the questions your users will ask.** Identify your usage patterns and store your data in a way that make its easy to return results for questions common in your organization. Compose ETLs to create new tables that bring together frequently queried data from multiple sources.
- **Tune your databases.** Read up on the documentation for your databases to learn how to improve their performance via indexing, caching, and other optimizations.
- **Filter your data**. Encourage your users to filter data when asking questions. Users should also take advantage of Metabase's data exploration tools (including record previews) so they only query data relevant to the question they're trying to answer.

## Metabase application best practices

Here are some strategies to get the most out of your Metabase application:

- [Use an external database to store you Metabase application data](#use-an-external-database-to-store-your-metabase-application-data)
- [Upgrade to the latest version of Metabase](#upgrade-to-the-latest-version-of-metabase)
- [Only ask for the data you need](#only-ask-for-the-data-you-need)
- [Cache your queries](#cache-your-queries)
- [Look for bottlenecks](#look-for-bottlenecks)
- [Keep dashboards to 7 questions or fewer](#keep-dashboards-to-7-questions-or-fewer)
- [Update your browser](#update-your-browser)

### Use an external database to store your Metabase application data

The application database stores all of your questions, dashboards, collections, permissions, and other data related to the Metabase application. We recommend you use an external database (like PostgreSQL or MySQL) to manage your application database. You can also use a managed relational database, like AWS RDS, which will auto-scale for your needs.

### Upgrade to the latest version of Metabase

If you haven't already, we recommend you update to the latest Metabase version to get the most recent performance improvements.

### Only ask for the data you need

In general, you should only query the data you need. If you set up a dashboard that you'll be viewing daily, you can reduce load times by limiting the number of records your queries return.

If you have many users running queries that return a lot of records, it won't matter that Metabase is fast: the users will get their data only as fast as your database(s) can return the requested records.

Take advantage of Metabase's data exploration tools to learn about your data and preview records in tables so you can dial in on only the records you need to answer your question.

Be especially mindful when querying data across time or space, as you can filter out a lot of unnecessary data by restricting your question to a shorter timespan or smaller area. Do you really need to see data years back, or in all geohashes?

### Cache your queries

You can [configure caching](../administration-guide/14-caching.md) on questions to store their results. Metabase will show users the timestamp for the results, and users can manually refresh the results if they want to rerun the query. Caching is suitable for results that do not update frequently.

### Look for bottlenecks

Metabase's Enterprise Edition offers [auditing tools](../enterprise-guide/audit.md) for you to monitor the usage and performance of your application. You can, for example, see how many questions are being asked, by whom, and how long the questions took to run, which can help identify any bottlenecks that need attention.

### Keep dashboards to 7 questions or fewer

Sometimes people go overboard with dashboards, loading them up with 50 questions or more. When a dashboard with 50 questions loads, it sends 50 simultaneous requests asking for data. And depending on the size of that database and the number of tables in that database, it can be quite some time before those records return to answer all of those questions.

7 is, of course, an arbitrary number; you can create dashboards where adding a lot of questions makes sense. In general, though, encourage your users to keep their dashboards focused. Dashboards are meant to tell a story about your data, and you can tell a good story with just a handful of questions. If you find that one of your dashboards has accumulated a lot of questions, consider breaking it up into multiple dashboards that each focus on a set of related questions.

### Update your browser

Metabase is a web application, and can benefit from the latest and greatest versions of browsers like Firefox, Chrome, Edge, and Safari.

## Supported deployments

There are many ways to set up Metabase; here are some of our favorites:

### Hosted Metabase

If you don't want to deal with the care and feeding of a Metabase application, Metabase now offers a [hosted solution](https://www.metabase.com/hosting/). You'll still have to ensure your data sources are performant, but you'll no longer have to manage running the Metabase application.

### AWS Elastic Beanstalk

Check out our [guide to setting up Metabase on Elastic Beanstalk](running-metabase-on-elastic-beanstalk.md). We use Elastic Beanstalk to host our internal Metabase application.

### Heroku

See [running Metabase on Heroku](running-metabase-on-heroku.md).

### Docker & Kubernetes

See [running Metabase on Kubernetes](running-metabase-on-kubernetes).

### Other cloud providers

[Google Cloud Platform](https://cloud.google.com/), [Microsoft Azure](https://azure.microsoft.com/en-us/), [Digital Ocean](https://www.digitalocean.com/), and other cloud providers offer other great alternatives for hosting your Metabase application.
