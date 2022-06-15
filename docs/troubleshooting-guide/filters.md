---
title: My dashboard filters don't work
---

# My dashboard filters don't work

You've tried to add a [filter widget][filter-widget-gloss] to your dashboard, but:

- the question you want to connect the filter to doesn't show up, or
- the filter doesn't show a dropdown list of possible values when you use it, or
- the filter removes all of the rows from the table no matter what value you set it to.

If you've created a [linked filter][linked-filter-gloss], please see [this troubleshooting guide][troubleshoot-linked-filters] instead.

If you're using a [SQL variable][sql-variable-gloss] with the variable type "field filter", go to [Troubleshooting SQL variables][troubleshoot-sql-variables].

## Is the dashboard filter actually connected to your question?

**Root cause:** The filter isn't connected to any cards on the dashboard, or connected to the wrong field.

**Steps to take:**

1. In dashboard edit mode, click on the gear icon next to the filter. Check that each card you want to wire up to the filter has a column selected.
2. If no columns are available to select on that card, you may need to change the filter type, from say a text filter to a date filter, to connect the filter to the card.
3. Check that the filter widget is connected to the column you want to filter on each relevant card.

## If the card you're trying to filter is written in SQL, does its SQL query contain a variable?

**Root cause**: If your SQL question doesn't contain a variable, the filter can't insert the value into the query to filter the results.

**Steps to take**:

1. Check that your SQL query contains at least [one variable][sql-variable-gloss] for the filter to insert the value. These can be plain variables, or [Field Filters][field-filter], with names enclosed in double curly braces `{% raw %}{{variable_name}}{% endraw %}`, typically in a `WHERE` clause.
2. If these steps don’t fix your error, go to [Troubleshooting SQL variables][troubleshoot-sql-variables].

If you built your question in the Query Builder, Metabase knows which columns you're using, and which columns you can connect to different types of filters. So you can add a dashboard filter and refer to columns in the question's results without creating variables explicitly.

## Are you seeing a different kind of input widget than you expected?

For example, you want a dropdown but you're seeing a search box or a text input box.

**Root cause:** Metabase only displays a dropdown list of possible values for a variable if it knows that the field in question is a category rather than (for example) an arbitrary number or arbitrary text. However, if the number of unique categories exceeds 100 values, Metabase will display a search box with autocomplete instead of a dropdown.

**Steps to take:**

1. Go to the **Admin Panel** and select the **Data Model** tab.
2. Select the database, schema, table, and field in question.
3. Click the gear-icon to view all the field's settings.
4. Set **Field Type** to "Category" and **Filtering on this field** to "A list of all values."
5. Click the button **Re-scan this field** in the bottom.

If you created the question in SQL, then you only get a dropdown if the filter is a Field Filter _and_ the Filtering on this field option is set to your preferred input type: A list of all values (dropdown list) _and_ the number of unique values is less than 100.

## Has someone renamed or deleted columns in the database?

**Root cause:** Someone has changed the database schema, e.g., renamed or deleted a column in a table.

**Steps to take:**

If a filter that used to work no longer seems to, or seems to eliminate all of the rows:

1. [Re-sync][sync-scan] Metabase with the database (i.e., refresh Metabase's understanding of the database's structure).
2. Compare the names of the fields used in the question with the actual names of the fields in the database.
3. Modify the question to match the current database schema.

[field-filter]: /learn/sql-questions/field-filters.html
[filter-widget-gloss]: /glossary/filter_widget
[linked-filter-gloss]: /glossary/linked_filter
[sql-variable-gloss]: /glossary/variable#example-variable-in-metabase
[sync-scan]: ./sync-fingerprint-scan.html
[troubleshoot-linked-filters]: ./linked-filters.html
[troubleshoot-sql-variables]: ./sql.html#my-sql-variables-arent-working