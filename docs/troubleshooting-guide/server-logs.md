---
title: How to read the server logs
---

# How to read the server logs

Here's an example log from running a query:

```
2021-07-07 15:53:18,560 DEBUG middleware.log :: POST /api/dataset 202 [ASYNC: completed] 46.9 ms (17 DB calls) App DB connections: 1/10 Jetty threads: 3/50 (4 idle, 0 queued) (72 total active threads) Queries in flight: 0 (0 queued); h2 DB 4 connections: 0/1 (0 threads blocked)
```

Let's unpack the log:

- **Time of log:** `2021-07-07 15:53:18,560`.
- **Log level:** `DEBUG`. There are different types of log levels. To learn more, check out [Metabase logs][log-level].
- **Namespace:**. `middleware.log`. You can tweak your logging level to get more or less information from this namespace.
- **Method:** `POST`. The HTTP method verb, like POST, PUT, GET, DELETE.
- **Path:** `/api/dataset`. The handling URL. Note that URL parameters aren't included, which can make debugging certain issues a little tricky.
- **Code:**  `202`. The HTTP status code.
- **ASYNC:** `[ASYNC: completed]`. Whether Metabase could deliver the results to the browser. If Metabase couldn't deliver the results, for example if someone starts a query and closes their browser before the query finishes, the ASYNC status will say "cancelled".
- **Response time:** `46.9 ms`. The time Metabase takes to handle the request (from when Metabase receives the request until it's returned results back to the browser).
- **Database calls:** `(17 DB calls)`. The number of query statements used, which in addition to calls to the queried data source(s), includes calls to the Metabase application database.
- **Application database connections:** `App DB connections: 1/10`. The number of active connections, and the available pool of connections.
- **Jetty threads:** `Jetty threads: 3/50 (4 idle, 0 queued)`. List the number of active threads, and the total pool of threads available. The `(4 idle, 0 queued)` are the spare hot threads, and the number of threads queued. If you find you're maxing out the number threads in your pool, check out [Metabase at scale][scale].
- **Java threads:** `(72 total active threads)`. The total number of threads Metabase is using.
- **Queries in flight:** `Queries in flight: 0 (0 queued)`. The number of active and queued queries across all database sources connected to Metabase. We recommend checking the **Database info** below for troubleshooting issues with the database related to the request.
- **Database info**:`h2 DB 4 connections: 0/1 (0 threads blocked)`. Shows database type, database ID, connections active/pool (and queue). This info is specific to the database related to the request (in this case a `POST` request), and not to the overall queries in flight.

[log-level]: ../configuring-metabase/log-configuration.md
[scale]: https://www.metabase.com/learn/administration/metabase-at-scale
