---
title: Data structure
summary: See all the tables in your Metabase instance and configure how people work with them.
---

## Data structure

_Data studio > Data structure_

**Data structure** area of [Data Studio](overview.md) is where you can manage table metadata and configure how the end users of your Metabase interact with the data.

You can do things like:

- Browse all the tables in your Metabase
- Publish tables to the Library
- Sync and scan tables
- Assign owners and other attributes to tables
- Set table and field visibility
- Edit table and column names and types
- Set data formatting settings
- Create measures and segments

## Permissions for Data Structure

To access the Data Structure area of Data Studio, people will need to be members of the Admin group or Data Analyst group (Data Analyst group is only available on Pro/Enterprise plans).

Note that putting someone into Data Analyst group will give them table metadata and data structure access to _all_ tables in your Metabase, even if they have limited View Data permissions for those tables.

If you only want to give someone access to table metadata for some - but not all - tables, use the table metadata permissions and access the Table Metadata through Admin > Table metadata instead of Data Studio.

## Browse tables

Data Structure gives you an overview of all tables in all databases connected to your instance, together with their owner, row count, and published state. Note that row count is only displayed for PostgreSQL tables for now.

You can search for table names, but the search will only match beginnings of word in table names. This means if you search for “base”, it can find names like “Baseball stats”, “All your base are belong to us”, but it will not find tables like “Metabase secrets”.

You can also filter tables by attributes like owners, visibility, or source - for example, if you wanted to find all hidden tables, or all tables coming from CSV uploads.

You can select a table to set [table attributes](#table-attributes), [edit metadata](#table-and-field-metadata), [publish it](#publishing-and-unpublishing-tables) or create [segments](#segments) or [measures](#measures) on the table. You can also select tables in bulk to publish or assign attributes (including visibility) to multiple tables at once.

## Publishing and unpublishing tables

{% include plans-blockquote.html feature="Publishing tables to the Library" %}

Once you select a table in Data Structure, you can publish the table to add it to the Library. The Library is a special collection that helps you create a source of truth for analytics by providing a centrally managed set of curated content.

See [Publishing tables](./library.md#publishing-tables) in the [Library docs](./library.md).

Publishing a table will change [data permissions](../permissions/data.md) for the table: every person in your instance who has **View** access to the Library collection will automatically get **Create queries** permissions on a published table.

## Sync settings

You can trigger manual re-sync of the table schema. This can be useful if you have added or removed columns from the table, and you don't see those changes reflected in Metabase.

You can also re-scan field values for the table or discard cached field values, which is useful if you need to retrieve updated values for dropdown filters.

See [syncs and scans](../databases/sync-scan.md) for more information.

## Table attributes

### Owner

Table **owner** can be a Metabase user or an arbitrary email address. You can use this attribute to quickly identify who on your data team is responsible for which table.

Table owner attribute is not exposed to people outside Data Studio.

### Visibility layer

**Visibility layer** attribute controls whether people in your Metabase can see the table when building new queries. You can also use it to tag tables according to how ready for end-user consumption they are (for example, if you're using medallion architecture).

The options are:

- **Hidden**: the table isn't available in the query builder and isn't [synced](../databases/sync-scan.md). People with SQL access can still query the table.
- **Internal**: table visible in the query builder and synced.
- **Final**: table is visible in the query builder and synced.

### Entity type

You can use **entity type** to tell people what kind of information is contained in the table, for example "Transaction" or "Event". Metabase will try to detect and automatically assign appropriate entity types (like entity type "Person" for a `Users` table"), but you can always change it later.

Outside Data Studio, entity type determines the record icons in the [details view](../exploration-and-organization/exploration.md#view-details-of-a-record).

### Source

**Source** describes where the data comes from. It can be useful when you want to identify tables that are, for example, ingested tables, or tables coming from CSV uploads.

Metabase will automatically assign the source "Metabase transforms” to tables created by [Metabase transforms](./transforms/transforms-overview.md), and source "Uploaded data" to tables created by new [CSV uploads](../databases/uploads.md) (CSV uploads that you created before getting Data Studio will not be automatically tagged).

## Table and field metadata

You can edit field descriptions, types, visibility settings, and formatting. For example, you can choose to display a filter on a field as a dropdown, or display days as `21.03.2026` instead of `03/21/2026`.

See [Table metadata editing](../data-modeling/metadata-editing.md) for more information.

## Segments

Segments are saved filters on tables. You can use segments to create an official definition of a subset of customers, users, or products that everyone on your team can refer to consistently (for example what constitutes an "active user").

People will see segments as options in the Filter block of the [query builder](../questions/query-builder/editor.md).

For now, in addition to Data Studio, segments can also be managed through **Admin settings > Table Metadata**, see [Segments in table metadata](../data-modeling/segments.md).

To see all segments on a table, select the table in **Data Structure** and switch to **Segments** tab.

### Create a segment

1. Select the table in **Data Structure**.
2. Scroll down and switch to **Segments**.
3. Click on **+New Segment**. You'll see an abridged version of Metabase's query builder.
4. Add the filters describing the segment (e.g. `Active = true`) and name the segment.
5. To preview the records in the segment, click on the **three dots** icon next to the segment's name and select **Preview**.
6. Save.

### Delete a segment

Deleting a segment will not break questions using it. The questions that use the segment will keep using the same filters as before.

1. Select the table in **Data Structure**.
2. Scroll down and switch to **Segments** and choose your segment.
3. On the segment's page, click on the **three dots** icon next to the segment's name and select **Remove segment**.

### Use a segment in the query builder

To use a segment in the query builder, start a new question from the table that the segment is based on, and select the segment in the **Filter** block. Segment's saved filters will be applied behind the scenes.

## Measures

Measures are saved aggregations on tables. You can use measures to create an official saved calculation, e.g. what "Net Promoter Score" means.

People will see measures as options in the Summarize block of the [query builder](../questions/query-builder/editor.md).

To see all measures on a table, select the table in **Data Structure** and switch to **Measures** tab.

### Create a measure

1. Select the table in **Data Structure**.
2. Scroll down and switch to **Measures**.
3. Click on **+New measure**. You'll see an abridged version of Metabase's query builder.
4. Add your aggregation. You will probably be interested in [Custom expressions](../questions/query-builder/expressions.md).
5. To preview the results of the measure, click on the **three dots** icon next to the measure's name and select **Preview**.

### Delete a measure

Deleting a measure will not break questions using it. The questions that use the measure will keep using the same aggregations as before.

1. Select the table in **Data structure**.
2. Scroll down and switch to **Measures** and choose your measure.
3. On the measure's page, click on the **three dots** icon next to the measure's name and select **Remove measure**.

### Use a measure in the query builder

To use a measure in the query builder, start a new question from the table that the measure is based on, and select the measure in the **Summarize** block. Measure's saved aggregation will be applied behind the scenes. You can use breakouts with a saved measure.
