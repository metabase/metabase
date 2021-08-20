# My dashboard filters don't work

You have tried to add a [filter widget][filter-widget-gloss] to your dashboard, but:

- the question you want to connect the filter to doesn't show up,
- the filter doesn't show a dropdown list of possible values when you use it, or
- the filter removes all of the rows from the table no matter what value you set it to.

If you have created a [linked filter][linked-filter-gloss], please see [this troubleshooting guide](./linked-filters.html) instead.

## Is the filter actually connected to your question?

- in query builder, did you exclude the column from the results *or* have you connected the filter to column A instead of column B?

## Was the question built using the Query Builder or written in SQL? FIXME break this into two

- If built in Query Builder, Metabase knows what columns you're using
  - So you can add a dashboard filter and refer to them without creating variables explicitly
- If written in SQL, you need to have created variables or Field Filters (which are a special type of variable)
  - link link link

**Steps to take:**

1. Check that the question is written in SQL. (Variables cannot be used in GUI question created with the Notebook Editor.)
2. FIXME second step?

## If the question is written in SQL, does it actually include variables?

**Root cause:** A filter must be linked to a variable in a SQL question, so if the question doesn't have any variables, you can't connect a filter to it. FIXME reword (need an injection point)

**Steps to take:**

1. Check that the question contains one or more variables with names enclosed in double curly braces `{% raw %}{{name}}{% endraw %}`.

## Are you seeing a different kind of input widget than you expected?

- For example, you want a dropdown but you're seeing a search box or a text input box
- Logic for selecting input widgets is a bit complicated
- If you created the question in the query builder, then:
  - If there's more than a few hundred distinct values, you'll get a search box with autocomplete rather than a dropdown
- If you created the question in SQL, then:
  - You only get a dropdown if the filter is a Field Filter _and_ the field type is set correctly (see below)

**Root cause:** Metabase only displays a dropdown list of possible values for a variable if it knows that the field in question is a category rather than (for example) an arbitrary number or arbitrary text.

**Steps to take:**

1. Go to the **Admin Panel** and select the **Data Model** tab.
2. Select the database, schema, table, and field in question.
3. Click the gear-icon to view all the field's settings.
4. Set **Field Type** to "Category" and **Filtering on this field** to "A list of all values."
5. Click the button **Re-scan this field** in the bottom.

## Has someone renamed or deleted columns in the database?

**Root cause:** Someone has changed the database schema, e.g., renamed or deleted a column in a table.

**Steps to take:**

If a filter that used to work no longer seems to, or seems to eliminate all of the rows:

1. [Re-sync][sync-scan] Metabase with the database (i.e., refresh Metabase's understanding of the database's structure).
2. Compare the names of the fields used in the question with the actual names of the fields in the database.
3. Modify the question to match the current database schema.

[filter-widget-gloss]: /glossary.html#filter_widget
[linked-filter-gloss]: /glossary.html#linked_filter
[sync-scan]: ./sync-fingerprint-scan.html
