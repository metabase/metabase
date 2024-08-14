---
title: Troubleshooting filters
---

# Troubleshooting filters

It's always a good idea to start with a quick sanity check:

1. Clear your browser cache.
2. Refresh the page.
3. Open your question or dashboard in an incognito window.

## Dashboard filters

If a dashboard filter is giving you no results or the wrong results:

1. Click the **pencil** icon to go into edit mode.
2. Click the **gear** icon beside your filter widget.
3. Make sure you've selected a column for your filter under **Column to filter on**.
4. If you can't find the right **Column to filter on**, or you're getting "No Results" when you apply the filter:
   - Exit edit mode and click on a dashboard card to go to the _original question_.
   - Follow the troubleshooting steps under [Question filters](#question-filters).

## Question filters

If a question filter is giving you no results or the wrong results:

1. Make sure the question includes the column you want to filter on.
2. Check that the column actually contains the value(s) you're filtering on. You can do this by:
   - sorting number or date columns,
   - creating a "contains" filter for string columns, or
   - asking your database admin.
3. Ask your Metabase admin to help you check if:
   - Metabase is [up to date](../databases/sync-scan.md) with your database,
   - the column is [visible](../data-modeling/metadata-editing.md#column-visibility) in Metabase,
   - you have the correct [data permissions](../permissions/data.md) to access the column.

### Special cases

If you're having trouble filtering on a:

- [Custom column](../questions/query-builder/introduction.md#creating-custom-columns): check if the custom expression is working as expected. For example, your custom expression might be returning blank values when you expect numbers.
- [SQL field filter](../questions/native-editor/sql-parameters.md#the-field-filter-variable-type): make sure you're using the correct [field filter syntax](../questions/native-editor/sql-parameters.md#field-filter-syntax), then see [Troubleshooting SQL variables](./sql.md#sql-variables-and-field-filters).

**Explanation**

When we first set up a filter, we need to link the filter to a column. If we make the wrong assumptions about a column's values or data type, the filter won't work at all. If a column changes on the database side, the filter might suddenly stop working.

For example, let's say we want to create a filter named "Select Product ID" linked to a column named **Product ID**. The filter won't work if any of these things happen:

- Our question doesn't include the **Product ID** column.
- We type the number 4 into the "Select Product ID" filter, when the **Product ID** column only contains the values 1, 2, and 3.
- **Product ID** is renamed to something else in the database or Table Metadata page.
- **Product ID** is deleted from the database, or hidden in the Table Metadata page.
- **Product ID** is a custom column that's not working as expected.
- We don't have data permissions to access the **Product ID** column.
- We made "Select Product ID" a numerical filter, but **Product ID** is a string column (see the section below).

## Time, ID, and number filters

To debug dashboard and question filters that involve timestamps, UUIDs, or numeric data:

1. Find the [data type](https://www.metabase.com/learn/databases/data-types-overview) of the column that you want to filter on. You can find this info from:
   - the [Data reference](../exploration-and-organization/data-model-reference.md),
   - the [Table Metadata page](../data-modeling/metadata-editing.md) (admins only), or
   - directly from the database.
2. Cast the column to a data type that matches the desired [filter type](../questions/query-builder/introduction.md#filter-types). You can:
   - [cast strings or numbers to dates](../data-modeling/metadata-editing.md#casting-to-a-specific-data-type) from the Table Metadata page, or
   - change the data type of the column in your database, and [re-sync](../databases/sync-scan.md#manually-syncing-tables-and-columns) the database schema.

If you're not a Metabase admin, you might have to ask your admin to help you with some of these steps.

**Explanation**

Metabase needs to know the data type of a column in order to present you with a curated selection of filter types. Sometimes these columns are mistyped---if a column stores your numbers as strings, Metabase will only show you text or category filters (with options like "is", "is not") instead of number filters (with options like "greater than", "less than").

Timestamps, in particular, are the root of all evil, so please be patient with your Metabase admin (or yourself!) when trying to get the data type right.

## Missing or incorrect filter values

If your filter dropdown menu displays the wrong values for a column:

1. Go to **Admin settings** > **Table Metadata**.
2. Find your database, table, and column.
3. Click the **gear** icon at the right of a column’s settings box.
4. Scroll to **Cached field values**.
5. Optional: click **Discard cached field values**.
6. Click **Re-scan this field**.

**Explanation**

Metabase [scans](../databases/sync-scan.md#how-database-scans-work) get the values for your filter dropdown menus by querying and caching the first 1,000 distinct records from a table. You might see outdated filter values if your tables are getting updated more frequently compared to your [scan schedule](../databases/sync-scan.md#scheduling-database-scans).

## Related topics

- [Troubleshooting linked filters](./linked-filters.md)
- [Troubleshooting SQL variables and field filters](./sql.md#sql-variables-and-field-filters)
- [Troubleshooting dates and times](./timezones.md)
- [Creating dropdown filters](../data-modeling/metadata-editing.md#changing-a-search-box-filter-to-a-dropdown-filter)
- [Creating SQL filters](../questions/native-editor/sql-parameters.md)

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
