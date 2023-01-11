---
title: "Admin Data Model"
redirect_from:
  - /docs/latest/administration-guide/03-metadata-editing
---

# Admin Data Model

Do you use "count of users", "user count", or "distinct users"? What about "10,000", "10K", or "10000"? When you're [pushing and pulling data](https://www.metabase.com/learn/analytics/push-and-pull) between different teams, you're bound to run into different names or different formats for the same business logic. Adding metadata helps everybody get on the same page, and makes your Metabase feel a lot nicer to use.

To edit the metadata of tables and columns, go to the **Data Model** tab of your **Admin settings**. You'll find a playground of knobs and buttons that'll let you:

- Set display names and descriptions
- Hide outdated or technical data
- Cast text or numbers to dates
- Change the filter style from a search box to a dropdown
- Link a column to a URL
- Set up reusable [segments and metrics](./segments-and-metrics.md).

## Selecting a database

If you've got more than one database connected to Metabase, click on the database name (for example, "Sample Database") and select another database from the dropdown menu.

## Table settings

Once you select a database, its tables will appear in the sidebar. Click on a table name to view the table's display settings in Metabase:

- [Change the display name](#table-display-name)
- [Add or edit the description](#table-description)
- [Show or hide the table across Metabase](#table-visibility)
- [Update cached values]()
- [Edit column (or field) display settings](#columns-or-fields)

### Table display name

To edit a table's display name in Metabase, click into the box that contains the current table name. Changes will be saved automatically once you click out of the box. These changes won't affect your database.

### Table description

To add a description, click into the box below the table name. Descriptions are displayed in Metabase's [data reference](../exploration-and-organization/data-model-reference) to help people find the right table for their use case.

### Table visibility

| Visibility | [Query builder](../questions/query-builder/introduction.md) | [SQL editor](../questions/native-editor/writing-sql.md) | [Data reference](../exploration-and-organization/data-model-reference.md) |
|------------|-------------------------------------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------|
| Queryable  | ✅                                                          | ✅                                                       | ✅                                                                        |
| Hidden     | ❌                                                          | ✅                                                       | ❌                                                                        |

**Hidden** tables won't show up in the query builder or data refererence, but they're still accessible if someone writes `SELECT * FROM hidden_table` in the SQL editor. To prevent people from writing queries against specific tables, see [data permissions](../permissions/data.md).

To hide all of the tables in a database (say, if you've migrated to a new database), click on the **hidden eye** icon beside "# queryable tables" in the left sidebar.

### Refresh table values

To update the values in your filter dropdown menus for the whole table at once, click the **gear** icon to the top right of the table name. You can:

- **Re-scan this table** to run a manual [scan](../databases/connecting#how-database-scans-work) for new or updated column values.
- **Discard cached field values** to stop displaying cached values in your filters.

Running a scan on the whole table can take a while. To update the values for a specific column, click on the **gear** icon beside a specific column.

### Original schema

To remind yourself of column names and data types as they're stored in your database, click **Original schema** (below **Visibility**).

## Columns (field) settings

Click on a table's name in the sidebar to bring up basic column display settings:

- [Change the display name](#column-name)
- [Add or edit the description](#column-description)
- [Show or hide the column across Metabase](#column-visibility)
- [Set a default column order](#column-order)
- [Change the column's field type](#field-type)

For extra column settings, click on the **gear** icon inside the box for a specific column:

- [Cast text or numbers to dates](#casting-to-a-specific-data-type)
- [Change the filter style](#changing-a-search-box-filter-to-a-dropdown-filter)
- [Remap column values](#remapping-column-values)
- [Refresh the column's values]()
- [Link a column to a URL](#linking-a-column-to-a-url)

### Column name

To change the display name of a column in Metabase, click on the name of the column. For example, you could display "auth.user" as "User" to make the column more readable. The display name won't affect your database.

### Column description

To add a description, click into the box below the column name. Descriptions are displayed in the [data reference](../exploration-and-organization/data-model-reference) to help people interpret the column's values. You should consider adding a description if your column contains:

- abbreviations or codes
- zeroes, nulls, or blank values
- dummy values, like `9999-99-99` in a datetime column.

### Column visibility

By default, users can see all of the columns in a table.

| Visibility            | [Query builder](../questions/query-builder/introduction.md) | [SQL editor](../questions/native-editor/writing-sql.md) | [Data reference](../exploration-and-organization/data-model-reference.md) |
|-----------------------|-------------------------------------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------|
| Everywhere            | ✅                                                          | ✅                                                       | ✅                                                                        | 
| Only in detail views  | ✅                                                          | ✅                                                       | ✅                                                                        | 
| Do not include        | ❌                                                          | ✅                                                       | ❌                                                                        | 

**Only in detail views** will hide lengthy text from question results. This setting is applied by default if a column's values have an average length of more than 50 characters. You might want to use this setting on a column like "Comments" if you already have a column for "Rating".

**Do not include** columns won't show up in the query builder or data reference, but they're still accessible if someone writes `SELECT hidden_column FROM table` in the SQL editor. You can use this setting on sensitive columns (such as PII) or irrelevant columns (such as the last updated time).

### Column order

Metabase defaults to the column order defined in your database schema. 

To reorder the column display order in question results and menus **manually**, click on the grab bar to the right of each column, and drag the column to a new position.

![Reordering columns](./images/column-reorder.gif)

To sort the columns **automatically**, click on the **sort** icon at the top right of the first column's settings box. The sorting options are:

- **Database.** (Default) The order of columns as they appear in the database.
- **Alphabetical.** A, B, C... however the alphabet works.
- **Custom.** You choose the order. Metabase will automatically switch to custom if you rearrange any of the columns.
- **Smart.** Metabase chooses for you.

### Field type

[Field types](../data-modeling/field-types) help Metabase suggest the right display options for your data, such as map options for "Longitude" and "Latitude" columns. 

To change the field type of a column, click on the **Type** dropdown menu in a column's setting box. 

You can also use the **Type** menu to label a column as an [entity key](https://www.metabase.com/glossary/entity_key) (primary key) or [foreign key](https://www.metabase.com/glossary/foreign_key) in Metabase (with no consequence to your database). 

Primary keys and foreign keys show up in the [data reference](../exploration-and-organization/data-model-reference#connections) to help people identify distinct records and [join data](../questions/query-builder/join.md).

### Casting to a specific data type

Use this setting if you want Metabase to interpret a text or number column as a datetime data type (for example, if you want to change a filter widget to a calendar style). Casting won't affect the original data types in your database.

To cast a text or number column, click on the **gear** icon in the column's settings box and scroll to **Cast to a specific data type**. You can cast text in ISO8601 format, and numbers representing Unix epoch to date, datetime, or time types. The exact casting options will differ depending on which kind of database you're connected to, but here are some types you can cast:

- ISO8601->Date
- ISO8601->Datetime
- ISO8601->Time
- UNIXMicroSeconds->DateTime
- UNIXMilliSeconds->DateTime
- UNIXSeconds->DateTime

Casting is different from changing the [field type](../data-modeling/field-types). A field type is meant to give people more context. For example, you can set a "Created At" column to a "Creation timestamp" so that Metabase has some idea that "Creation timestamp" comes before "Deletion timestamp". However, if the "Created At" column is stored as text, Metabase won't give you a calendar option for a filter on that column until you explicitly cast "Created At" to one of the datetime data types above.

### Remapping column values

Let's say you have a column with the values 1, 2, and 3, and you want to map each number to the values "low", "medium" and "high". This kind of mapping can be done on columns that have numeric or foreign key [field types](#field-type).

To manually replace a numeric column's values with different values (numbers or text):

1. Click **gear** icon in a column's settings box.
2. Scroll to **Display values**.
3. Select "Custom mapping" from the dropdown menu.
4. Enter the display values under **Mapped values**.

To automatically replace foreign key values with the values from a linked table:

1. Click **gear** icon in a column's settings box.
2. Scroll to **Display values**.
3. Select "Use foreign key" from the dropdown menu.
4. Select a column name from the second dropdown menu.

### Changing the filter widget

To change a column's [filter widget](), click on the **gear** icon in the column's settings box and scroll to **Filtering on this field**.

Filter widget options:

- **Search box**: Default filter for columns with more than 100 unique values.
- **A list of all values**: A dropdown menu.
- **Plain input box**: Default filter for columns with less than 100 unique values.

### Changing a search box filter to a dropdown filter

1. Go to **Settings** > **Admin settings** > **Data Model**.
2. Select the database, schema, table, and column in question.
3. Click the **gear** icon to view all the column's settings.
4. Set **Field Type** to “Category”.
5. Set **Filtering on this field** to “A list of all values".

This setting will run a query against your database to get the first 1,000 distinct values (ordered ascending) for that field and cache the first 100kB of text to display in the dropdown menu. If you have columns with more than 1,000 distinct values, or columns with text-heavy data, we recommend setting **Filtering on this field** to "Search box" instead. For more info, see [How database scans work](../databases/connecting.md#how-database-scans-work).

### Linking a column to a URL

1. Click on the **gear** icon in a column's settings box.
2. Select **Formatting** from the sidebar.
3. From **Display as**, select **Link**.
4. Optional: set display text under **Link text**.
5. Enter the URL in the **Link URL** field.

For example, if you set the Link URL for the "Adjective" column to:

```
https://www.google.com/search?q={{adjective}}
```

Let's say you click on the value "askew" in the "Adjective" column. You'll be taken to the Google search URL:

```
https://www.google.com/search?q=askew
```

## Further reading

- [Segments and metrics](./segments-and-metrics.md)
- [Models](./models.md)
