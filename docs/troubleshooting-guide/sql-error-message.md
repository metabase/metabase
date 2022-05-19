## What's wrong with your SQL query?

- [I get an error message that mentions part of my SQL query][sql-debugging].
- [I get an error message that isn't specific to my SQL query][troubleshoot-error-messages].
- [I don't have an error message, but my query results are incorrect][troubleshoot-sql-logic].

## Debugging SQL queries

If your SQL query contains [SQL variables][sql-variable-def] that look like `{% raw %}{{ variable }}{% endraw %}`, go to [Troubleshooting SQL variables][troubleshoot-sql-variables] first.

1. Go to the line that is failing in your SQL query.
   - [I don’t know where my SQL query is failing][how-to-find-failing-sql-line].
2. Check the [SQL syntax][troubleshoot-sql-syntax] on the line that is failing in your SQL query.
3. Check your [query logic][troubleshoot-sql-logic] if the query uses joins, subqueries, or CTEs.
4. If you get an error message that isn't specific to your SQL query, go to [Troubleshooting error messages][troubleshoot-error-messages].

### How does SQL debugging work?

- SQL error messages are displayed for each line in your query that fails to run. You'll need to follow the steps above for each line that failed.
- If you make any changes to a line, run your query to check if the problem is fixed before moving on to the next step. You can add a `LIMIT` clause at the end of your query to speed up the process.
- Note that [SQL queries are not run from top to bottom][sql-order-execution], so you won’t be debugging your query lines in the order that they are written. Follow the error messages to help you find the lines that need attention.

## Troubleshooting SQL syntax errors

1. Review the spelling on the line that is failing in your SQL query.
2. Review for missing brackets or commas on the line that is failing in your SQL query.
3. Remove commented lines (lines that begin with `--` or `/*`).
4. Review for common syntax errors that are [specific to your SQL dialect][sql-reference-guide].

### Common SQL reference guides

Before you start, open up the SQL reference guide for the SQL dialect that you’re using. We’ve linked to some of the most common ones here:

- [MySQL](https://dev.mysql.com/doc/refman/8.0/en/language-structure.html)
- [PostgreSQL](https://www.postgresql.org/docs/current/sql-syntax-lexical.html)
- [Microsoft SQL Server](https://docs.microsoft.com/en-us/sql/t-sql/language-reference)
- [Amazon Redshift](https://docs.aws.amazon.com/redshift/latest/dg/cm_chap_SQLCommandRef.html)
- [Google BigQuery](https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical)
- [Snowflake](https://docs.snowflake.com/en/sql-reference/constructs.html)
- [I don’t know what SQL dialect to use][how-to-find-sql-dialect].

### Common SQL syntax errors

What does your error message say?

- [My column or table name is "not found" or "not recognized"][sql-error-not-found].
- [My SQL "function does not exist”][sql-error-function-does-not-exist].

If you have a different error message, search or ask the [Metabase community][discourse].

#### My column or table name is "not found" or "not recognized"

If your SQL query contains [SQL variables][sql-variable-def] that look like `{% raw %}{{ variable }}{% endraw %}`, go to [Troubleshooting SQL variables][troubleshoot-sql-variables] first.

**Steps**

1.  Review the **structure** section of the [reference guide][sql-reference-guide] for your SQL dialect.

    - Are you using the correct quotation marks? For example:

      - `SELECT 'column_name'`
      - `SELECT "column_name"`
      - ``SELECT `column_name` ``

    - Are you using the correct path to columns and tables? For example:

      - `FROM table_name`
      - `FROM schema_name.table_name`
      - `FROM database_name.schema_name.table_name`

    - Is your column name a reserved word? For example:

      [In PostgresSQL, 'users' is a reserved key word](https://www.postgresql.org/docs/current/sql-keywords-appendix.html).

      - `SELECT users` will throw an error.
      - `SELECT "users"` will run correctly.
    
    - **Tip: Use Metabase to check for column and table name syntax**

      1. Create a simple question in the [notebook editor][notebook-editor] using the same columns and tables as your SQL question.
      2. [Convert the question to SQL][how-to-convert-gui-question-to-sql].
      3. Look at how the Metabase-generated SQL query refers to column and table names.

2.  Review the [data reference][data-reference] for the column and table names in your query.

    - If the column or table name doesn't exist in the data reference:
      - Run `SELECT * FROM your_table_name LIMIT 10;` to look for the column or table name to use in your query.
      - If you're a Metabase admin, check the Data model page for the [original schema][original-schema].

    - If the column name exists, but you can’t query the column from the SQL editor: 
      - Ask your Metabase admin if the column was re-named or removed on the database side.
      - If you’re a Metabase admin, you may need to [run a sync][database-syncing] to refresh your data.

3.  If you no longer have an error message, but your query results are incorrect, go to [Troubleshooting SQL logic][troubleshoot-sql-logic].
4.  If you get an error message that isn't specific to your SQL query, go to [Troubleshooting error messages][troubleshoot-error-messages].
5.  If you're still stuck, search or ask the [Metabase community][discourse].

**Explanation**

You need to make sure that you're using the correct syntax for the SQL dialect used by your database. 

Your query also needs to use column and table names that match the original names in your database. Metabase uses [display names][column-metadata] that can be updated by your Metabase admin, so the data reference may not match your database schema. It's also possible that a column or table was re-named on the database side, but Metabase hasn’t run a sync to grab the updates.

**Further reading**

- [How Metabase executes SQL queries][how-metabase-executes-queries].
- [How Metabase syncs with your database][database-syncing].

#### My SQL "function does not exist”

If your SQL query contains [SQL variables][sql-variable-def] that look like `{% raw %}{{ variable }}{% endraw %}`, go to [Troubleshooting SQL variables][troubleshoot-sql-variables] first.

**Steps**

1. Review the data type of the column that you want your function to apply to.

   - You can use the Metabase [data reference][data-reference] to review the column's [field type][field-type-def] (as a proxy for [data type][data-type-def]).
   - You can also directly query the information schema in your database if you have permission to access it.

2. Review the **function** section of the [reference guide][sql-reference-guide] for your SQL dialect.

   - Confirm that the function exists for your SQL dialect.
   - Review the data type(s) that are accepted by your function.

3. If the field type of your column does not match the expected data type of your function:

   - Cast your column to the correct data type in your SQL query.
   - If you’re a Metabase admin, you can also [cast data types from the Data model page][how-to-cast-data-type].

4. If you no longer have an error message, but your query results are incorrect, go to [Troubleshooting SQL logic][troubleshoot-sql-logic].
5. If you get an error message that isn't specific to your SQL query, go to [Troubleshooting error messages][troubleshoot-error-messages].
6. If you're still stuck, search or ask the [Metabase community][discourse].

**Explanation**

SQL functions are designed to work on specific data types in your database. For example, the [`DATE_TRUNC` function in PostgresSQL](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC) works on columns with `date`, `timestamp`, and `time` typed data in a Postgres database. If you try to use the `DATE_TRUNC` function on a column with a `string` data type in your database, it won’t work. 

Note that Metabase [field types][field-type-def] are not one-to-one with the data types in your database. In this case, the field type gives you enough information about the column data type to troubleshoot the error.

**Further reading**

- [How Metabase executes SQL queries][how-metabase-executes-queries].
- [Field types documentation][field-type-doc].

## I don’t know which line of my SQL query is failing

If your SQL query contains [SQL variables][sql-variable-def] that look like `{% raw %}{{ variable }}{% endraw %}`, go to [Troubleshooting SQL variables][troubleshoot-sql-variables] first.

Once you find the line that is failing in your SQL query, go to the [Debugging SQL][sql-debugging] steps.

### Reading your SQL error message

Does your error message:
- Tell you the line or character position?
- Include a table or column name? If the table or column name appears more than once in your query, [reduce the size of your query][how-to-reduce-sql-query-size].
- Mention a SQL clause?

### Reducing the size of a SQL query

If your query uses:

- **Subqueries** (nested queries), run each subquery separately. Start with the inner subqueries and work your way out.
- **CTEs**, run each CTE separately. Start with your base CTE and work your way down the query.
- **SQL variables that point to Metabase models**, run each model separately. Go to the model by opening the variables panel, or enter the model ID number from the variable in the Metabase search bar.
- Remember to [read the SQL error message][how-to-read-sql-error] as you try to isolate the problem. For more information, go to [How does SQL debugging work?][how-does-sql-debugging-work].

**Tips for working in the Metabase SQL editor**

Highlight lines of your SQL query to:
- Run the lines with `Cmd + Return` or `Ctrl + Enter`.
- Comment/uncomment the lines with  `Cmd + /` or `Ctrl + /`.

## I don’t know what SQL dialect to use

The SQL dialect is based on the [database][data-source-list] that stores the tables you want to query. Once you find out what SQL dialect to use, you can follow the [Debugging SQL][sql-debugging] steps.

To find out which database you’re querying:

- If you’re a Metabase admin, go to **Admin > Databases,** and look under the **Engine** column.
- Otherwise, ask the person who set up your Metabase.

## Are you still stuck?

Search or ask the [Metabase community][discourse].

[column-metadata]: ../administration-guide/03-metadata-editing.html#metadata-for-columns
[data-reference]: ../users-guide/12-data-model-reference.html
[data-source-list]: https://www.metabase.com/datasources/
[database-syncing]: ../administration-guide/01-managing-databases.html#database-syncing
[data-type-def]: /glossary/data_type.html
[discourse]: https://discourse.metabase.com/search?q=sql%20error%20message
[field-type-def]: /glossary/field_type.html
[field-type-doc]: ../users-guide/field-types.html
[how-metabase-executes-queries]: ../users-guide/writing-sql.html#how-metabase-executes-sql-queries
[how-to-cast-data-type]: ../administration-guide/03-metadata-editing#casting-to-a-specific-data-type 
[how-to-convert-gui-question-to-sql]: ../users-guide/04-asking-questions.html#viewing-the-sql-that-powers-your-question
[how-does-sql-debugging-work]: #how-does-sql-debugging-work
[how-to-find-failing-sql-line]: #i-dont-know-which-line-of-my-sql-query-is-failing
[how-to-find-sql-dialect]: #i-dont-know-what-sql-dialect-to-use
[how-to-read-sql-error]: #reading-your-sql-error-message
[how-to-reduce-sql-query-size]: #reducing-the-size-of-a-sql-query
[notebook-editor]: ../users-guide/04-asking-questions.html#the-query-builder
[original-schema]: ../administration-guide/03-metadata-editing.html#original-schema
[sql-debugging]: #debugging-sql-queries
[sql-error-function-does-not-exist]: #my-sql-function-does-not-exist
[sql-error-message]: ./sql-error-message.html
[sql-error-not-found]: #my-column-or-table-name-is-not-found-or-not-recognized
[sql-editor]: /glossary/native_query_editor.html
[sql-order-execution]: /learn/sql-questions/sql-best-practices.html#the-general-order-of-query-execution
[sql-reference-guide]: #common-sql-reference-guides
[sql-variable-def]: /glossary/variable.html#example-variable-in-metabase
[troubleshoot-error-messages]: ./error-message.html
[troubleshoot-sql-logic]: ./sql.html#my-sql-query-results-are-incorrect
[troubleshoot-sql-syntax]: #troubleshooting-sql-syntax-errors
[troubleshoot-sql-variables]: ./sql.html#my-sql-variables-arent-working