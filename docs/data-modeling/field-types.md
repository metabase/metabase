---
title: "Field types"
redirect_from:
  - /docs/latest/users-guide/field-types
---

# Field types

While data types indicate to a database how it should interpret the values in a field, **field types** or **semantic types** describe the _meaning_ of a field. For example, a column's data type could be `type/text` but the semantic type may be **Email**. Field types are just one example of metadata—information about data—that [Admins can change](./metadata-editing.md) in Metabase.

Field types dictate how Metabase displays its data, as well as the column’s special functionality, if any. By marking columns in a table as **Latitude** and **Longitude**, Metabase can use the columns to create pin and heat maps. Similarly, designating a column as a **URL** allows users to click on the link to visit that URL.

## Overall Row

- **Entity Key**: The field in this table that uniquely identifies each row. Could be a product ID, serial number, etc.
- **Entity Name**: Different from the entity key, the entity name represents what each row in the table _is_. For example, in a Users table, you might want to use a field containing usernames as the entity name.
- **Foreign Key**: The column in this table that (usually) refers to the entity key of another table in order to connect data from different tables that are related. For example, in a Products table, you might have a Customer ID field that points to a Customers table, where Customer ID is the primary key.

## Common

Common field types are text/varchar types.

- **Category**: If set to category, Metabase will know that it can use this field to group results when creating questions for automatic insights like [X-rays](../exploration-and-organization/x-rays.md).
- **Comment**
- **Description**
- **Title**

## Location

Marking fields as locations tell Metabase that it can use the field to display data on a [map chart](../questions/sharing/visualizations/map.md).

- **City**
- **Country**
- **Latitude**: Tells Metabase that the data could be plotted on a [pin map](../questions/sharing/visualizations/map.md).
- **Longitude**: Did you know that you can use the moons of Jupiter to calculate longitude?
- **State**
- **Zip Code**

## Financial

Financial field types tell Metabase to treat the field's values as money. If you select any of the financial field types, Metabase will ask which currency you want to use. Metabase treats each of the following types as money, their differences are purely semantic.

- **Cost**
- **Currency**
- **Discount**
- **Gross margin**
- **Income**
- **Price**

See [Currency formatting options](../questions/sharing/visualizations/table.md#currency-formatting-options).

## Numeric

Metabase will treat numeric field types as [numbers](../questions/sharing/visualizations/table.md#number-formatting-options).

- **Percentage**: Displays the number as a percentage by default.
- **Quantity**: Displays the number as normal by default.
- **Score**: Displays the number as normal by default.
- **Share**: The same as percentage, so prefer "Percentage".

See [Number formatting options](../questions/sharing/visualizations/table.md#number-formatting-options).

## Profile

Fields that deal with people.

- **Birthday**. Date field.
- **Company**: Text field.
- **Email**: Displays as a [mailto](https://en.wikipedia.org/wiki/Mailto) link.
- **Owner**: Text field.
- **Subscription**: Text field.
- **User**: Text field.

## Date and Time

Date and time field types tell Metabase the field contains datetime values, so it can use date pickers and display time series (e.g., a line chart).

If your database stores datetimes as a number or string, you can [cast that column to a datetime](./metadata-editing.md#casting-to-a-specific-data-type).

- **Cancelation date**
- **Cancelation time**
- **Cancelation timestamp**
- **Creation date**
- **Creation time**
- **Creation timestamp**
- **Deletion date**
- **Deletion time**
- **Deletion timestamp**
- **Updated date**
- **Updated time**
- **Updated timestamp**
- **Join date**
- **Join time**
- **Join timestamp**
- **UNIX Timestamp (Milliseconds)**
- **UNIX Timestamp (Seconds)**

See [Date formatting options](../questions/sharing/visualizations/table.md#date-formatting-options).

## Categorical

- **Enum**: An abbreviation for “enumerated type,” the value of an enum draws on a predefined list of options. An example of an enum would be a field for the months of the year. This list of twelve options is defined in the makeup of the column, and no options outside this list would be valid.
- **Product**
- **Source**: For example, the source of a visitor to your website (such as a search engine or other website).

## URLs

Metabase can display fields with URLs as images or links.

- **Avatar Image URL**: Displays the field as an image in table and detail views.
- **Image URL**: Displays the field as an image in table and detail views.
- **URL**: Displays the field as a link.

## Other

- **Field containing JSON**. See [Working with JSON](./json-unfolding.md)
- **No semantic type** – Used for fields that don't fall into any of the above field types.

## Using field types in Metabase

### Set column types in models to enable people to explore results with the query builder

You can set field types for [models](./models.md), which helps Metabase understand how to work with data in models built using SQL. If you set each column type in a SQL model, people will be able to explore that model using the query builder and drill-through menus.

With records that include integer entity keys, you can also configure text fields in models to [surface individual records in search](./models.md#surface-individual-records-in-search-by-matching-against-this-column).

### X-rays

When you [X-ray](../exploration-and-organization/x-rays.md) a table, model, or entity, Metabase considers both the data type and the field type to display different charts that summarize that data.

### Field Filters

Knowing what field types are and how they work is helpful when using [field filters](https://www.metabase.com/learn/sql-questions/field-filters.html), as you can only create field filters for [certain field types](../questions/native-editor/sql-parameters.md#field-filter-compatible-types).

### Editing types in the Table Metadata page

If you're an administrator, you can edit field types using the [Table Metadata page](./metadata-editing.md) in the Admin Panel.

While data types themselves can't be edited in Metabase, admins can manually [cast certain data types](./metadata-editing.md#casting-to-a-specific-data-type) to be read differently, like interpreting a numerical data type as a date format.

> Metabase currently supports only casting to a datetime type in Metadata settings.

### JSON unfolding

See [Working with JSON](./json-unfolding.md).

## Further Reading

- [Exploring data with Metabase's data browser](https://www.metabase.com/learn/getting-started/data-browser.html).
- [The Table Metadata page: editing metadata](./metadata-editing.md).
- [Field Filters: create smart filter widgets for SQL questions](https://www.metabase.com/learn/sql-questions/field-filters.html).
