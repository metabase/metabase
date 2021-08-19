# My filters don't work

You have tried to add a [filter widget][filter-widget-gloss] to your dashboard, but:

- the question you want to connect the filter to doesn't show up,
- the filter doesn't show a dropdown list of possible values when you use it, or
- the filter removes all of the rows from the table no matter what value you set it to.

If you have created a [linked filter][linked-filter-gloss], please see [this troubleshooting guide](./linked-filters.html) instead.

## Does the question actually include variables?

**Root cause:** A filter controls the value of a variable in a question, so if the question doesn't have any variables, you can't connect a filter to it.

**Steps to take:**

1. Check that the question is written in SQL. (Variables cannot be used in GUI question created with the Notebook Editor.)
2. Check that the question contains one or more variables with names enclosed in double curly braces `{% raw %}{{name}}{% endraw %}`.

## Is the field identified as a category in the data model?

**Root cause:** Metabase only displays a dropdown list of possible values for a variable if it knows that the field in question is a category rather than (for example) an arbitrary number or arbitrary text.

**Steps to take:**

1. Go to the **Admin Panel** and select the **Data Model** tab.
2. Select the database, schema, table, and field in question.
3. Click the gear-icon to view all the field's settings.
4. Set **Field Type** to "Category" and **Filtering on this field** to "A list of all values."
5. Click the button **Re-scan this field** in the bottom.

## Has the underlying database schema changed?

**Root cause:** Someone has renamed a column in the database.

**Steps to take:**

If a filter that used to work no longer seems to, or seems to eliminate all of the rows:

1. [Re-sync][sync-scan] Metabase with the database (i.e., refresh Metabase's understanding of the database's structure).
2. Compare the names of the fields used in the question with the actual names of the fields in the database.
3. Modify the question to match the current database schema.

[filter-widget-gloss]: /glossary.html#filter_widget
[linked-filter-gloss]: /glossary.html#linked_filter
[sync-scan]: ./sync-fingerprint-scan.html
