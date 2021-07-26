## Performance

In order to troubleshoot performance problems, you first need to understand what happens when a question or dashboard is created or updated in Metabase. Before diving into specifics, you may want to read our article on [Metabase at scale][metabase-at-scale].

1. Your browser goes to a web page that shows a Metabase question or dashboard.

2. The JavaScript in our front end sends a request to our back end. (It also does this as you type in filter controls or search fields to fill ahead.)

3. Our back end checks its cache to see if it can re-use a recently-fetched result rather than sending another request to the database. If so, that result comes back right away.

4. Otherwise, if the question was created using the notebook editor, we translate the MBQL representation of the question into SQL. Storing an abstract representation of the question and translating it on the fly lets us create SQL specific to the database you're using: while SQL is supposed to be a standard, its various implementations differ in many ways.

5. The back end then sends the request to the database. It needs a connection to the database in order to do this; like most applications, Metabase maintains a pool of connections that it re-uses rather than making a fresh connection each time.

6. The database executes the query and returns the result to the back end.

7. If caching is enabled and the query took longer to execute than the time specified in the cache configuration, the back end saves the result in its cache.

8. The back end forwards the results to the front end.

9. The front end creates the HTML to display the result in your browser.

## Specific Problems

Each of the steps described is a potential performance bottleneck.

### The Metabase instance is getting so much traffic that loading the HTML page is slow.

This is extremely rare, since our front end is not very large and browsers cache our JavaScript, but it's easy to rule out. What is more common is the lack of HTTP/2 or the lack of available connections to the application database; we cover both topics in our article on [Metabase at scale][metabase-at-scale].

**How to detect this:** Nothing appears on the page (not even the controls), or elements appear one by one.

**How to fix this:**

1.  Check that you are using HTTP/2 by looking at the network tab in your browser and checking the response headers.
2.  Check the server logs for Metabase's application database.
3.  Look at page load times in the browser console. If it's taking a long time to load our HTML, CSS, or JavaScript, check to see whether a proxy, firewall, or other network component is slowing things down.

### Caching is disabled.

By default caching is disabled so that we always re-run every question. However, if your data is only being updated every few seconds or minutes, you will improve performance by enabling caching. Note that ad hoc queries and exports are *not* cached, so doing a lot of either can impact performance.

**How to detect this:** Open the Admin Panel, go to "Settings", and look in the "Caching" tab to see whether caching is enabled or not.

**How to fix this:** [This guide][admin-caching] explains how to change the minimum query duration (we cache anything that takes longer than that to run) and the maximum cache size for each query result. You may need to experiment with these values over several days to find the best balance.

### The answer you want isn't cached.

Each question (and any filter combination) is its own query, so if different users are viewing the same question with different filters, each will have to load once before it's cached. This is particularly obvious with [data sandboxing][data-sandboxing]: filtering the data based on the user's identity means that each user's question is slightly different.

Additionally, since cached values are stored in the application database they will still be there if Metabase restarts, but only if the cache duration is still valid. 

**How to detect this:** If you are sure that caching is enabled (discussed above), then look at Metabase's logs or in the server's logs to see when it was last restarted. If performance problems are caused by data sandboxing, you may want to consider enlarging the cache.

**How to fix this:** 

### The database is overloaded by other traffic.

Metabase is usually not the only application using your database, and you may not be the only person using Metabase. If someone else has opened a dashboard that launches a couple of dozen long-running queries, everyone else may then have to wait until database connections become free. Our article on [Metabase at scale][metabase-at-scale] discusses this in more detail, and our article on [making dashboards faster][faster-dashboards] may help as well.

**How to detect this:** Checking the performance logs of the database server or the machine it's running on often reveals that the real problem is caused by some third-party application.

**How to fix this:** That depends on what those other applications are, how frequently they are making queries, whether the database can be replicated or the load can be moved onto other systems, and so on. If some of the applications involved are primarily being used for batch processing (e.g., daily or weekly reports), you can also check when those jobs are scheduled to ensure that they don't overlap.

Note: you may also see your database being overloaded if you're using the same database as Metabase's app database and for your own data. We strongly recommend that you don't do this in a production system or if you have more than a handful of users.

### The question itself is slow.

Joining half a dozen tables, each with a few million rows, simply takes a lot of time. On the other hand, while we do our best to create fully-formed SQL queries from graphical questions, SQL snippets, and questions that use other questions as starting points, it's a hard problem---particularly across as many databases as we support. We also don't take advantage of every quirk of every backend database. For example, Redshift stores values in columns rather than rows: some queries that work well for row-oriented databases are slow on columns and vice versa.

**How to detect this:**

1. Run the same SQL that Metabase is running but using a different tool. For example, if you have created a question using the Notebook Editor and you are using Postgres as your database, you can view the SQL, copy it, and run it from the command line using `psql`. (If you have written the question in SQL you can just copy and paste it.) If the query runs noticeably faster this way than it does when you run it through Metabase, the problem is almost certainly one of the ones described above.

2. We also recommend running the query with a JDBC-based tool like [DBeaver][dbeaver], which is also Java-based and uses most of the same database drivers as Metabase. Using this, and running the test query from the same machine that Metabase is running on, can help you determine if the problem is a network bottleneck.

3. If the query runs slowly when sent by another tool, see if you can write a SQL query that calculates the same result as the question you have built in Metabase, but does so more quickly.

**How to fix this:* If the problem is the SQL we generate:

1. Check if you have the most recent version of Metabase: we fix problems as they're reported, and updating Metabase may make your problem go away.
2. You can use your SQL in place of the code we generate, and [make its result available][organizing-sql] to people who prefer the Notebook Editor as a starting point for their questions.
3. And please file a bug report to help us figure out how to generate better SQL.

### Values are repeatedly being converted on the fly.

Low performance when using Metabase can also be caused by incorrect typing of columns, e.g., by storing a numeric value as a string.  When this happens, the query converts values on the fly each time the query is run.

**How to detect this:** Even a handwritten query will be slow if it has to do this conversion every time. You can also spot this by looking at the raw data types of the columns being used in the query.

**How to fix this:** Amend the database schema to store numbers as numbers, timestamps as timestamps, and so on, rather than as strings or other data types.

### Metabase is running on an under-powered machine.

**How to detect this:** Checking the performance logs for the server where Metabase is running will tell you whether it is hitting CPU or memory limits. However, it's much more likely that the database itself is hitting its limits, so please check it first.

**How to fix this:** Upgrade to a more powerful server or one with more memory. If you would like this taken care of you, along with backups, cache configuration, and so on, please consider using [Metabase Cloud][metabase-start].

### A dashboard contains too many questions.

When Metabase displays a dashboard, it re-runs all of the questions. We do our best to do this concurrently, and the network layers and the database itself also do what they can, but a dashboard with a hundred cards is going to be slower than a single question. And if your dashboard contains filters, then each time someone changes a filter setting, all of the cards that depend on it have to re-execute. Careful dashboard design can prevent or eliminate these problems.

**How to detect this:** The individual questions load quickly when viewed on their own, but the dashboard loads or updates slowly.

**How to fix this:** See [this article][faster-dashboards] for tips on making dashboards more performant.

### The UI appears to freeze when saving a question that has not yet been run

**How to detect this:** If you save a question that has not been executed, MB runs the question while saving, which can make the UI look frozen.

**How to fix this:** This is [a bug](https://github.com/metabase/metabase/issues/14957) and we are working to fix it. Until it's corrected, the workaround is to run the question before saving it. However, it's very likely that the root cause is one of the more common problems described above.

[admin-caching]: ../administration-guide/14-caching.html
[data-sandboxing]: /learn/permissions/data-sandboxing-row-permissions.html
[dbeaver]: https://dbeaver.io/
[faster-dashboards]: /learn/administration/making-dashboards-faster.html
[metabase-at-scale]: /learn/administration/metabase-at-scale.html
[metabase-start]: /start/
[organizing-sql]: /learn/sql-questions/organizing-sql.html
