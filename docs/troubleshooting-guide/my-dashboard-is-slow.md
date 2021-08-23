# My dashboard is slow

You have created a dashboard that shows the right things but:

- it takes longer to load than you think it should, or
- some cards load quickly but others take much longer, but
- the dashboard and/or the slow cards do load eventually.

Our articles on [Metabase at scale][metabase-at-scale] and [making dashboards faster][faster-dashboards] will help set the stage for the steps below.

## Did it used to be fast enough, but has recently slowed down?

**Root cause:** Metabase is not an island, complete unto itself, so if the dashboards and the cards it shows haven't changed, the slowdown is probably due to a change in the environment.

**Steps to take:**

1. Check if the volume of data being analyzed has grown recently---for example, are some of your tables much larger than they used to be? If so, you may need to move your database server to a more powerful machine.
2. Check if more people are accessing the data warehouse, or if the same set of users are running more queries. (You can find this out by looking at the database server's logs.) If this is the case, you can either move the data warehouse to a more powerful machine or institute quotas to manage the volume of access.
3. Check if queries from Metabase are being queued for execution, i.e., whether they are having to wait their turn to execute. If so, you may be able to raise the priority of Metabase queries (though this will necessarily come at the cost of slowing others down).

## Do you have too many cards in your dashboard?

**Root cause:** When Metabase displays a dashboard, it re-runs all of the questions. We do our best to do this concurrently, but a dashboard with a hundred cards is going to be slower than one with a single question. And if your dashboard contains filters, then each time someone changes a filter setting, all of the cards that depend on it have to re-execute.

**Steps to take:**

1. Move cards from this dashboard into other dashboards until this dashboard's performance is acceptable.
2. Use [custom destinations][custom-destinations] to link cards in the main dashboard to the other dashboards.

Note: this is a good way to design dashboards even when there aren't performance issues. A dashboard with a hundred cards isn't just slow, it's also hard to understand. Breaking things up improves comprehension as well as performance. Please read [this article][faster-dashboards] for tips on making dashboards more performant, and [this one][bi-best-practices] for designing good dashboards in general.

## Is the database overloaded by other traffic?

**Root cause:** Metabase is usually not the only application using your database, and you may not be the only person using Metabase. If someone else has opened a dashboard that launches a couple of dozen long-running queries, everyone else may then have to wait until database connections become free.

**Steps to take:**

1. Check the performance logs of the database server or the machine it's running on often reveals that the real problem is caused by some third-party application.
2. The next steps depend on what those other applications are, how frequently they are making queries, whether the database can be replicated or the load can be moved onto other systems, and so on. If some of the applications involved are primarily being used for batch processing (e.g., daily or weekly reports), you can also check when those jobs are scheduled to ensure that they don't overlap.

Note: you may also see your database being overloaded if you're using the same database for Metabase's app database and for your own data. We strongly recommend that you don't do this in a production system or if you have more than a handful of users. If you are doing this, set up a second database for Metabase's own use.

## Are some of your queries intrinsically slow?

**Root cause:** Joining half a dozen tables, each with a few million rows, simply takes a lot of time. While we do our best to create fully-formed SQL queries from graphical questions, SQL snippets, and questions that use other questions as starting points, it's a hard problem---particularly across as many databases as we support.

**Steps to take:**

1. Run each question in the dashboard on its own to see which ones are slow.
2. Look at the size of the result set for each question that is slow. If it contains hundreds of columns or many thousands of rows, see if you can modify the question to return a smaller result set.
3. Run the same SQL that Metabase is running but using a different tool. For example, if you have created a question using the Notebook Editor and you are using Postgres as your database, you can view the SQL, copy it, and run it from the command line using `psql`. (If you have written the question in SQL you can just copy and paste it.) If the query runs noticeably faster this way than it does when you run it through Metabase, the problem is almost certainly one of the ones described above.
4. Run the query with a JDBC-based tool like [DBeaver][dbeaver], which is also Java-based and uses most of the same database drivers as Metabase. Using this, and running the test query from the same machine that Metabase is running on, can help you determine if the problem is a network bottleneck.
5. If the query runs slowly when sent by another tool, see if you can write a SQL query that calculates the same result as the question you have built in Metabase, but does so more quickly.

## Is Metabase generating inefficient SQL?

**Root cause:** Metabase saves questions created graphically in Metabase Query Language (MBQL), then translate MBQL into queries for particular back-end databases. It creates the most efficient queries it can, but for the sake of portability, it doesn't take advantage of every database's idiosyncracies, so sometimes a GUI question will be slower than the equivalent hand-written SQL.

**Steps to take:**

1. Check if you have the most recent version of Metabase: we fix problems as they're reported, and updating Metabase may make your problem go away.
2. You can use your SQL in place of the code we generate, and [make its result available][organizing-sql] to people who prefer the Notebook Editor as a starting point for their questions.
3. Please [file a bug report][bugs] to help us figure out how to generate better SQL.

## Do you have the right database schema?

**Root cause:** If the database schema is poorly designed, questions cannot run quickly.

**Steps to take:** The difference between OLTP and OLAP, and how to design database schemas to support them, are out of scope for this troubleshooting guide. In brief, you must look at the data schema of the data warehouse, or ask the database administrator whether the database is designed for online transaction processing (OLTP) or online analytical processing (OLAP). Metabase is an OLAP application; if the database schema is designed for OLTP, you may need to create views that reorganize the data.

Similarly, you probably don't need indexes for simple tables with a few tens of thousands of rows, but you almost certainly *do* if you have a few million rows. All of this is very dependent on the underlying database: Redshift can easily handle millions of rows with thousands of columns, but MySQL or PostgreSQL may require a star schema designed for OLAP to deliver the performance you need.

## Is Metabase not caching the answer to your question?

**Root cause:** By default caching is disabled so that we always re-run every question. However, if your data is only being updated every few seconds or minutes, you will improve performance by enabling caching. Note that:

1. Ad hoc queries and exports are *not* cached, so doing a lot of either can impact performance.
2. Since cached values are stored in the application database they will still be there if Metabase restarts.
3. Each question (and any filter combination) is its own query, so if different users are viewing the same question with different filters, each will have to load once before it's cached. This is particularly obvious with [data sandboxing][data-sandboxing]: filtering the data based on the user's identity means that each user's question is slightly different.

**Steps to take:**

1. Go to Admin Panel > Settings > Caching to see if caching is enabled.
2. Determine whether the question *can* be cached. We hash the query string, so (for example) if results are being filtered by a user ID, every person who views the dashboard will be sending a slightly different question to the database, and the results will not be cached.
3. [This guide][admin-caching] explains how to change the minimum query duration (we cache anything that takes longer than that to run) and the maximum cache size for each query result. You may need to experiment with these values over several days to find the best balance. If the problem appears to be caused by a high proportion of sandboxed queries, check that the cache is large enough to store all of their results.

## Are values repeatedly being converted on the fly?

**Root cause:** Low performance can be caused by incorrect typing of columns, e.g., by storing a numeric value as a string.  When this happens, the query converts values on the fly each time it runs. (Even a handwritten query will be slow if it has to do this conversion every time.)

**Steps to take:**

1. Go to Admin > Data Model and look at the raw data types of the columns being used in your question. If (for example) a column is stored as a string when the question needs a number or a timestamp, you may need to convert the column in place.
2. Alternatively, you can create a new table with the converted values in the right type. This takes more storage, and needs to be updated as new data arrives, but will not affect any other applications that are using the same database.

## Is the dashboard fast when you view it in Metabase but slow when you've embedded it?

**Root cause:** You can embed the charts and dashboards you create in Metabase in other websites in [several ways][embedding]. If people have to authenticate in order to view the dashboard in that other website, then you can pass their credentials to Metabase and use them to filter data. If they don't have to authenticate, though, then you can't do that, which means you may return a larger result set than you expect.

**Steps to take:** This is almost always a result of a design error---if are only allowed to see a subset of the data when they're in Metabase, they shouldn't be able to see more (or all) of the data when the same question is displayed in an external web page. Please read [the introduction to embedding][embedding] to see how you can pass credentials from your site to Metabase.

## Is Metabase and/or the data warehouse running on under-powered hardware?

**Root cause:** If you run Metabase or the underlying data warehouse on a ten-year-old machine with only 1 GByte of RAM, it may not be able to keep up with your demands.

**Steps to take:**

1. Check the performance logs for the server where the database is running to see if it is hitting CPU or memory limits.
2. Check the performance logs for the server where Metabase is running.
3. If either is a bottleneck, upgrade to a more powerful server or one with more memory.

## Does Metabase appear to freeze when you save a question that has not yet been run?

**Root cause:** If you save a question that has never been executed, Metabase runs the question while saving it, which can make the UI look frozen.

**Steps to take:** This is [a bug][freeze-bug] and we are working to fix it. Until it's corrected, the workaround is to run the question before saving it. However, it's very likely that the root cause is one of the more common problems described above.

[admin-caching]: ../administration-guide/14-caching.html
[bi-best-practices]: /learn/dashboards/bi-dashboard-best-practices.html
[bugs]: ./bugs.html
[custom-destinations]: /learn/dashboards/custom-destinations.html
[data-sandboxing]: /learn/permissions/data-sandboxing-row-permissions.html
[dbeaver]: https://dbeaver.io/
[embedding]: /learn/embedding/embedding-charts-and-dashboards.html
[faster-dashboards]: /learn/administration/making-dashboards-faster.html
[freeze-bug]: https://github.com/metabase/metabase/issues/14957
[metabase-at-scale]: /learn/administration/metabase-at-scale.html
[organizing-sql]: /learn/sql-questions/organizing-sql.html
