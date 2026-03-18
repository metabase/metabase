---
title: Table variables
summary: Table variables let you dynamically select which database table to query in the SQL editor.
---

# Table variables

![Table variables](../images/table-variable.png)

Table variables let you write a SQL query with a placeholder for the table name. When you run the query, Metabase substitutes the variable with the schema and table name.

Table variables are especially useful when combined with [snippets](./snippets.md), so you can write a generic query once and reuse it across different tables.

## Adding a table variable to a query

Use double braces where you'd normally write a table name:

```sql
{% raw %}
SELECT
  COUNT(*)
FROM
  {{table}}
{% endraw %}
```

You can use table variables anywhere a table name would go, including `FROM` and `JOIN` clauses:

```sql
{% raw %}
SELECT
  t.*,
  p.title
FROM
  {{table}} AS t
  JOIN {{products_table}} AS p ON t.product_id = p.id
{% endraw %}
```

See [Referencing table variables](#reference-table-variables).

### Setting the variable type to Table

After adding a `{% raw %}{{variable}}{% endraw %}` to your query:

1. Open the **Variables** sidebar (it should appear automatically).
2. Change the variable type to **Table**.
3. Under **Table to map to**, select a table from the picker (Required).
4. Depending on how you want to refer to the table variable in the query, toggle **Emit table alias** on or off, see [Referencing table variables](#reference-table-variables).

When you run the query, Metabase replaces the variable with the selected table's schema and table name. To preview the code Metabase will run, click the **eye** icon.

## Reference table variables

There are two ways you can refer to the table variable in the rest of the query:

1. If you want to use the variable's name, you'll need to toggle _on_ **Emit table alias** in the variable's settings. Your queries will look like this:

   ```sql
   {% raw %}
   SELECT
       var_name.id,
       p.title
   FROM
       {{var_name}} JOIN products as p on var_name.product_id = p.id

   {% endraw %}
   ```

2. If you want to specify an alias, you must toggle **Emit table alias** _off_ and manually add aliases to your query. You may want to specify your own alias if you already have a long query with existing aliases, and you just want to swap the table for a table variable. Your queries will look like this:

   ```sql
   {% raw %}
   SELECT
       o.id,
       p.title
   FROM
       {{var_name}} as o JOIN products as p on o.product_id = p.id

   {% endraw %}
   ```

## Using table variables with snippets

One neat thing you can do is combine table variables with [snippets](./snippets.md). You can write a generic query as a snippet and reuse the snippet in multiple questions, each mapped to a different table.

For example, create a snippet called "row count" with:

```sql
{% raw %}
SELECT
  COUNT(*)
FROM
  {{table}}
{% endraw %}
```

Then insert the snippet into different questions:

```sql
{% raw %}
{{snippet: row count}}
{% endraw %}
```

In each question, open the Variables sidebar and map `{% raw %}{{table}}{% endraw %}` to a different database table. This way, the same snippet can count rows in `Products`, `Orders`, or any other table.

## Limitations

- **Not available as dashboard filter parameters.** You can't connect a table variable to a dashboard filter widget. Table variables must be set directly on each question.
- **SQL queries only.** Table variables are available in native SQL queries, not in the query builder.
- **No input widget.** There's no input widget for people to plug in a table. You must select the table to insert into the variable from the variables sidebar.
- **Not supported in transforms.** Table variables aren't available in [transforms](../../data-studio/transforms/transforms-overview.md) yet.

## Further reading

- [SQL parameters](./sql-parameters.md)
- [Snippets](./snippets.md)
- [SQL troubleshooting guide](../../troubleshooting-guide/sql.md)
