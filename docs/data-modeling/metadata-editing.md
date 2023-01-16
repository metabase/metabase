---
title: "Metadata editing"
redirect_from:
  - /docs/latest/administration-guide/03-metadata-editing
---

# Data model admin settings

When you're [pushing and pulling data](https://www.metabase.com/learn/analytics/push-and-pull) between different teams, you're bound to run into different names, formats, and definitions for the same thing. Metabase lets you add and edit metadata to your tables and columns so that you can manage your org's business logic as it changes.

To get started, go to the **Data Model** tab in your **Admin settings**. If you've got more than one database connected to Metabase, click on the database name (for example, "Sample Database") and select another database from the dropdown menu.

You'll find a playground of knobs and buttons that'll let you:

- Set display names and descriptions for [tables](#table-display-name) and [columns](#column-name).
- Hide outdated or irrelevant [tables](#table-visibility) and [columns](#column-visibility).
- [Cast a text or number column to a date column](#casting-to-a-specific-data-type) (so you can use the column in Metabase features such as datetime-specific [filters](../dashboards/filters.md) and [formulas](../questions/query-builder/expressions.md)).
- [Change a filter widget](#changing-the-filter-widget) (for example, from a [search box to a dropdown](#changing-a-search-box-filter-to-a-dropdown-filter)).
- [Link column values to URLs](#linking-a-column-to-a-url).
- [Refresh or clear cached filter values](#refresh-or-discard-cached-values).
- Set up reusable [segments and metrics](./segments-and-metrics.md).

> The **Data Model** admin settings only affect the way data's displayed and interpreted in Metabase. None of the settings will change the data in your database.

## Data Model vs. models

Metadata isn't restricted to admins. People can set up mini versions of the **Data Model** using [models](../data-modeling/models.md).

You can think of the Data Model admin settings as global defaults for metadata in Metabase. Model metadata will apply on top of the Data Model admin settings, and will be "local" to the model. For example, models can act as command centers for different areas of business logic.

|                                               | Data Model | Models |
|-----------------------------------------------|------------|--------|
| Display names                                 | ✅          | ✅     |
| Descriptions                                  | ✅          | ✅     |
| Hide tables                                   | ✅          | ❌     |
| Hide columns                                  | ✅          | ✅     |
| Edit [field types](./field-types.md)          | ✅          | ✅     |
| Cast text or numbers to dates                 | ✅          | ❌     |
| Change the filter widget                      | ✅          | ❌     |
| Remap column values                           | ✅          | ❌     |
| Refresh cached values                         | ✅          | ❌     |
| Link columns to URLs                          | ✅          | ✅     |
| [Number and date formatting](./formatting.md) | ✅          | ✅     |
| Map SQL columns to database columns           | ❌          | ✅     |
| Version history                               | ❌          | ✅     |
| Verification\*                                | ❌          | ✅     |

\* Available on [paid plans](https://www.metabase.com/pricing).

## Table settings

Once you select a database, the tables in that database will appear in the sidebar. Click on a table name to view the table's settings in Metabase:

- [Change the display name](#table-display-name)
- [Add or edit the description](#table-description)
- [Show or hide the table across Metabase](#table-visibility)
- [View the original schema](#original-schema)
- [Edit column (field) settings](#column-field-settings)

### Table display name

To edit a table's display name in Metabase, click into the box that contains the current table name. Changes will be saved automatically once you click out of the box. These changes won't affect your database.

### Table description

To add a table description, click into the box below the table name. Descriptions are displayed in Metabase's [data reference](../exploration-and-organization/data-model-reference.md) to help people find the right table for their use case.

### Table visibility

| Visibility | [Query builder](../questions/query-builder/introduction.md) | [SQL editor](../questions/native-editor/writing-sql.md) | [Data reference](../exploration-and-organization/data-model-reference.md) |
|------------|-------------------------------------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------|
| Queryable  | ✅                                                          | ✅                                                       | ✅                                                                        |
| Hidden     | ❌                                                          | ✅                                                       | ❌                                                                        |

**Hidden** tables won't show up in the query builder or data refererence, but they're still accessible if someone writes `SELECT * FROM hidden_table` from the [SQL editor](../questions/native-editor/writing-sql.md). To prevent people from writing queries against specific tables, see [data permissions](../permissions/data.md).

Tip: To hide all of the tables in a database (say, if you've migrated to a new database), click on the **hidden eye** icon beside "# queryable tables" in the left sidebar.

### Original schema

To remind yourself of column names and data types as they're stored in your database, click **Original schema** (below **Visibility**).

## Column (field) settings

[Select a database](#data-model-admin-settings) and click on a table's name in the sidebar to bring up basic column display settings:

- [Change the display name](#column-name)
- [Add or edit the description](#column-description)
- [Show or hide the column across Metabase](#column-visibility)
- [Set a default column order](#column-order)
- [Change the column's field type](#field-type)

For extra column settings, click on the **gear** icon at the right of a column's settings box:

- [Cast text or numbers to dates](#casting-to-a-specific-data-type)
- [Change the filter widget](#changing-the-filter-widget) (for example, to a dropdown menu)
- [Remap column values](#remapping-column-values) (for example, from "5" to "Great")
- [Link a column to a URL](#linking-a-column-to-a-url)

### Column name

To change the display name of a column in Metabase, click on the name of the column. For example, you could display "auth.user" as "User" to make the column more readable. The display name won't affect your database.

### Column description

To add a description, click into the box below the column name. Descriptions are displayed in the [data reference](../exploration-and-organization/data-model-reference.md) to help people interpret the column's values. You should consider adding a description if your column contains:

- abbreviations or codes
- zeroes, nulls, or blank values
- placeholder values, like `9999-99-99`

### Column visibility

By default, users can see all of the columns in a table.

| Visibility            | [Query builder](../questions/query-builder/introduction.md) | [SQL editor](../questions/native-editor/writing-sql.md) | [Data reference](../exploration-and-organization/data-model-reference.md) |
|-----------------------|-------------------------------------------------------------|---------------------------------------------------------|---------------------------------------------------------------------------|
| Everywhere            | ✅                                                          | ✅                                                       | ✅                                                                        | 
| Only in detail views  | ✅                                                          | ✅                                                       | ✅                                                                        | 
| Do not include        | ❌                                                          | ✅                                                       | ❌                                                                        | 

**Only in detail views** will hide lengthy text from question results. This setting is applied by default if a column's values have an average length of more than 50 characters. You might want to use this setting on a column like "Comments" if you already have a column for "Rating".

**Do not include** columns won't show up in the query builder or data reference, but these columns are still accessible if someone writes `SELECT hidden_column FROM table` from the [SQL editor](../questions/native-editor/writing-sql.md). You can set "do not include" on sensitive columns (such as PII) or irrelevant columns.

### Column order

Metabase defaults to the column order defined in your database schema. To reorder the column display order in question results and menus **manually**, click on the grab bar to the right of each column, and drag the column to a new position.

![Reordering columns](./images/column-reorder.gif)

To sort the columns **automatically**, click on the **sort** icon at the top right of the first column's settings box. The sorting options are:

- **Database.** (Default) The order of columns as they appear in the database.
- **Alphabetical.** A, B, C... however the alphabet works.
- **Custom.** You choose the order. Metabase will automatically switch the sort order to "Custom" if you rearrange any of the columns.
- **Smart.** Metabase chooses for you.

### Field type

[Field types](../data-modeling/field-types.md) help Metabase suggest the right display options for your data, such as the map visualization for "Longitude" and "Latitude" columns.

To change the field type of a column, click on the **Type** dropdown menu in a column's setting box. You can also use the **Type** menu to label a column as an [entity key](https://www.metabase.com/glossary/entity_key) (primary key) or [foreign key](https://www.metabase.com/glossary/foreign_key) in Metabase (with no consequence to your database). 

Primary keys and foreign keys show up in the [data reference](../exploration-and-organization/data-model-reference.md#connections) to help people identify unique records and create [joins](../questions/query-builder/join.md).

### Casting to a specific data type

If you want Metabase to interpret a text or number column as a datetime [data type](https://www.metabase.com/learn/databases/data-types-overview) (for example, if you want to change a filter picker to a calendar style). Casting types from the **Data Model** admin settings won't affect the original data types in your database.

To cast a text or number column:

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click on the **gear** icon at the right of a column's settings box.
4. Scroll to **Cast to a specific data type**
5. Select a casting option.

**Text to datetime casting options**:

- ISO8601->Date
- ISO8601->Datetime
- ISO8601->Time

**Numeric to datetime casting options**:

- UNIXMicroSeconds->DateTime
- UNIXMilliSeconds->DateTime
- UNIXSeconds->DateTime

Casting is different from changing the [field type](../data-modeling/field-types.md). A field type is meant to give people more context. For example, you can set a "Created At" column to a "Creation timestamp" so that Metabase has some idea that "Creation timestamp" comes before "Deletion timestamp". However, if the "Created At" column is stored as text, Metabase won't give you a calendar option for a filter on that column until you explicitly cast "Created At" to one of the datetime data types above.

### Changing the filter widget

To change the [filter widget](../dashboards/filters.md) in questions and dashboards, you'll have to adjust the **Data Model** admin settings for the column used in that filter.

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click on the **gear** icon at the right of a column's settings box.
4. Scroll to **Filtering on this field**.
5. Select a filter widget option.

#### Filter widget options
- **Search box**: start typing to search, and Metabase will display checkboxes that match the search term.
- **A list of all values**: dropdown menu with checkboxes for all values.
- **Plain input box**: start typing to search, and Metabase will make autocomplete suggestions (no checkboxes).

#### Default filters
- Columns with more than 100 unique values will default to a plain input box filter.
- Columns with fewer values will display a search box filter.

### Changing a search box filter to a dropdown filter

The dropdown filter widget can be finicky, because it depends on a column's [field type](#field-type), and it's a lot less performant than other filter types.

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Scroll to your column.
4. In the column's settings box, set **Type** to “Category”.
5. Set **Filtering on this field** to “A list of all values".

When you change a search box filter to a dropdown filter, you'll trigger a query against your database to get the first 1,000 distinct values (ordered ascending) for that column. Metabase will cache the first 100kB of text to display in the dropdown menu. If you have columns with more than 1,000 distinct values, or columns with text-heavy data, we recommend setting **Filtering on this field** to "Search box" instead. For more info, see [How database scans work](../databases/connecting.md#how-database-scans-work).

### Remapping column values

Let's say you have a column with the values 1, 2, and 3, and you want to map each number to the values "low", "medium" and "high". This kind of mapping can be done on columns that have numeric or foreign key [field types](#field-type).

#### Remapping numbers

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click **gear** icon at the right of a column's settings box.
4. Scroll to **Display values**.
5. Select "Custom mapping" from the dropdown menu.
6. Enter the display values under **Mapped values**.

#### Remapping foreign keys

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click **gear** icon at the right of a column's settings box.
4. Scroll to **Display values**.
5. Select "Use foreign key" from the dropdown menu.
6. Select a column name from the second dropdown menu.

### Linking a column to a URL

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click on the **gear** icon at the right of a column's settings box.
4. Select **Formatting** from the sidebar.
5. From **Display as**, select **Link**.
6. Optional: set display text under **Link text**.
7. Enter the URL in the **Link URL** field.
8. Optional: create a dynamic URL by adding the column name as a `{% raw %}{{parameter}}{% endraw %}`.

For example, if you set the **Link URL** for an "Adjective" column to:

```
https://www.google.com/search?q={{adjective}}
```

When someone clicks on the value "askew" in the "Adjective" column, they'll be taken to the Google search URL:

```
https://www.google.com/search?q=askew
```

## Refresh or discard cached values

To update the values in your filter dropdown menus, refresh or reset the cached values. **Cache actions** include:

- **Re-scan this table or field** to run a manual scan for new or updated column values. If possible, re-scan the table during off-peak hours, as [scans](../databases/connecting.md#how-database-scans-work) can slow down your database.
- **Discard cached field values** to clear cached values and stop them from showing up in your [filter widgets](#changing-the-filter-widget).

### Table cache actions

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click the **gear** icon at the top right (below **Exit admin**).
4. Select a cache action.

### Column cache actions

1. Go to **Admin settings** > **Data Model**.
2. Find your database and table.
3. Click **gear** icon at the right of a column's settings box.
4. Scroll to **Cached field values**.
5. Select a cache action.

## Further reading

- [Segments and metrics](./segments-and-metrics.md)
- [Keeping your analytics organized](https://www.metabase.com/learn/administration/same-page)
- [Data modeling tutorials](https://www.metabase.com/learn/data-modeling/models)
