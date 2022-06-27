---
title: The SQL editor
---

# The SQL editor

If you ever need to ask questions that can't be expressed using the query builder, you can use [SQL][sql-gloss] instead.

## What's SQL?

SQL (pronounced "sequel", or sometimes as S.Q.L. — people argue about this) stands for Structured Query Language, and is a widely used standard for getting data from databases. We won't try to teach you all about SQL right now, but to learn more about it, check out [Working with SQL][learn-sql].

Even if you don't understand SQL or how to use it, it's worthwhile to get an idea of how it works inside Metabase, because sometimes other people will share SQL-based questions that might be useful to you.

## Starting a new SQL query

Select **+ New** in the main nav bar. If you have the [permissions](../administration-guide/05-setting-permissions.md) to use the SQL editor, you'll see an option to start a new **SQL query** next to a little console icon.

After clicking **SQL query**, you'll see an editor where you can write and run queries in SQL (or your database's native querying language).

![SQL editor](images/writing-sql/SQLInterface.png)

To try it out, make sure you've selected the [Sample Database][sample-database-gloss], then paste in this short SQL query:

```
SELECT 
    sum(subtotal), 
    created_at
FROM orders 
GROUP BY created_at;
```

Don't worry if you don't understand this just yet. Click the blue **Run query** button to execute your query. 

You'll notice that the table that comes back is the same as if you had used the [query builder][asking-questions] to ask for the sum of `Subtotal` in the `Orders` table, grouped by the `Created At` date.

### Running query selections

You can run your SQL query by pressing **ctrl + enter** on Windows and Linux, or **⌘ + return** on a Mac. You can also run only part of a query by highlighting the part you'd like to run before clicking the run button or using the run shortcut key.

Questions asked using SQL can be saved, downloaded, converted to models, and added to dashboards just like questions asked using the query builder.

You can also [refer to models and saved questions][ref-models] in your SQL queries.

## Using SQL filters

If you or someone else wrote a SQL query that includes [variables][variable-gloss], that question might have filter widgets at the top of the screen above the editor. Filter widgets let you modify the SQL query before it's run, changing the results you might get.

![SQL filter](images/writing-sql/SQL-filter-widget.png)

Writing SQL queries that use variables or parameters can be very powerful, but it's also a bit more advanced, so that topic has its own page if you'd like to [learn more](13-sql-parameters.md).

## SQL snippets

You can use [SQL snippets](sql-snippets.md) to save, reuse, and share SQL code across multiple questions that are composed using the SQL editor.

## How Metabase executes SQL queries

When you run a query from the SQL editor, Metabase sends the query to your database exactly as it is written. Any results or errors displayed in Metabase are the same as the results or errors that you would get if you ran the query directly against your database. If the SQL syntax of your query doesn’t match the SQL dialect used by your database, your database won’t be able to run the query.

## How Metabase executes SQL variables

When you run a query that includes a [variable][variable-gloss], the query will be executed by replacing the `{% raw %}{{ variable_name_or_id }}{% endraw %}` tag with the SQL query of the referenced question or model.

This means that your main query must be aware of all the tables that your variable is pointing to, otherwise you'll get a SQL syntax error. For example, if your main query uses the `Products` table, but your variable points to a query that uses the `Orders` table, you'll need to include a join to `Orders` in your main query.

For an example, see the documentation on [Referencing models and saved questions in SQL queries](../users-guide/referencing-saved-questions-in-queries.html).

## Learn more

- [Best practices for writing SQL queries](https://www.metabase.com/learn/sql-questions/sql-best-practices.html)

## Need help?

If you're having trouble with your SQL query, go to the [SQL troubleshooting guide][troubleshooting-sql].

---

## Next: Creating charts

Now that you have an answer to your question, you can learn about [visualizing answers](05-visualizing-results.md).

[asking-questions]: ../users-guide/04-asking-questions.html#creating-a-new-question-with-the-query-builder
[learn-sql]: https://www.metabase.com/learn/sql-questions 
[ref-models]: ./referencing-saved-questions-in-queries.md
[sample-database-gloss]: /glossary/sample_database
[sql-gloss]: /glossary/sql
[troubleshooting-sql]: ../troubleshooting-guide/sql.md
[variable-gloss]: /glossary/variable