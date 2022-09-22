---
title: Troubleshooting database performance
---

# Troubleshooting database performance

## Do you have the right database schema?

**Root cause:** If the database schema is poorly designed, questions cannot run quickly.

**Steps to take:** The difference between OLTP and OLAP, and how to design database schemas to support them, are out of scope for this troubleshooting guide. In brief, you must look at the data schema of the data warehouse, or ask the database administrator whether the database is designed for online transaction processing (OLTP) or online analytical processing (OLAP). Metabase is an OLAP application; if the database schema is designed for OLTP, you may need to create views that reorganize the data.

Similarly, you probably don't need indexes for simple tables with a few tens of thousands of rows, but you almost certainly *do* if you have a few million rows. All of this is very dependent on the underlying database: Redshift can easily handle millions of rows with thousands of columns, but MySQL or PostgreSQL may require a star schema designed for OLAP to deliver the performance you need.

## Is Metabase and/or the data warehouse running on under-powered hardware?

**Root cause:** If you run Metabase or the underlying data warehouse on a ten-year-old machine with only 1 GByte of RAM, it may not be able to keep up with your demands.

**Steps to take:**

1. Check the performance logs for the server where the database is running to see if it is hitting CPU or memory limits.
2. Check the performance logs for the server where Metabase is running.
3. If either is a bottleneck, upgrade to a more powerful server or one with more memory.

## Related problems

- [My connection or query is timing out](./timeout.md).
- [I can't connect to a database](./db-connection.md).
- [My dashboard is slow or failing to load](./my-dashboard-is-slow.md)