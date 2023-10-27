---
title: "Field types"
redirect_from:
  - /docs/latest/users-guide/field-types
---

# Field types


While data types indicate to a database how it should interpret the values in a field, __field types__ or __semantic types__ describe the _meaning_ of a field. For example, a column's data type could be ```type/text``` but the semantic type may be __Email__. Field types are just one example of metadata—information about data—that [Admins can change](./metadata-editing.md) in Metabase.

Field types dictate how Metabase displays its data, as well as the column’s special functionality, if any. By marking columns in a table as __Latitude__ and __Longitude__, Metabase can use the columns to create pin and heat maps. Similarly, designating a column as a __URL__ allows users to click on the link to visit that URL.

## List of Metabase Field Types

Metabase recognizes the following field types:

- **Overall Row**
  - **Entity Key** – The field in this table that uniquely identifies each row. Could be a product ID, serial number, etc.
  - **Entity Name** – Different from the entity key, the entity name represents what each row in the table *is*. For example, in a Users table, the User column might be the entity name.
  - **Foreign Key** – The column in this table that (usually) refers to the primary key of another table in order to connect data from different tables that are related. For example, in a Products table, you might have a Customer ID field that points to a Customers table, where Customer ID is the primary key.
- **Common**
  - Category
  - Comment
  - Description
  - Title
- **Location**
  - City
  - Country
  - Latitude
  - Longitude
  - State
  - Zip Code
- **Financial**
  - Cost
  - Currency
  - Discount
  - Gross margin
  - Income
  - Price
- **Numeric**
  - Quantity
  - Score
  - Share
- **Profile**
  - Birthday
  - Company
  - Email
  - Owner
  - Subscription
  - User
- **Date and Time**
  - Cancelation date
  - Cancelation time
  - Cancelation timestamp
  - Creation date
  - Creation time
  - Creation timestamp
  - Deletion date
  - Deletion time
  - Deletion timestamp
  - Updated date
  - Updated time
  - Updated timestamp
  - Join date
  - Join time
  - Join timestamp
  - UNIX Timestamp (Milliseconds)
  - UNIX Timestamp (Seconds)
- **Categorical**
  - **Enum** - An abbreviation for “enumerated type,” the value of an enum draws on a predefined list of options. An example of an enum would be a field for the months of the year. This list of twelve options is defined in makeup of the column, and no options outside this list would be valid.
  - Product
  - Source
- **URLs**
  - Avatar Image URL
  - Image URL
  - URL
- **Other**
  - Field containing JSON
  - **No semantic type** – Used for fields that don't fall into any of the above field types.

## Using field types in Metabase

### X-rays

When you [X-ray](../exploration-and-organization/x-rays.md) a table, Metabase considers both the data type and the field type to display different charts that summarize that data.

### Field Filters

Knowing what field types are and how they work is helpful when using [field filters](https://www.metabase.com/learn/sql-questions/field-filters.html), as you can only create field filters for [certain field types](../questions/native-editor/sql-parameters.md#field-filter-compatible-types).

### Editing types in the Table Metadata page

If you're an administrator, you can edit field types using the [Table Metadata page](./metadata-editing.md) in the Admin Panel.

While data types themselves can't be edited in Metabase, admins can manually [cast data types](./metadata-editing.md#casting-to-a-specific-data-type) to be read differently, like interpreting a numerical data type as a date format.

## Further Reading

- [Exploring data with Metabase's data browser](https://www.metabase.com/learn/getting-started/data-browser.html).
- [The Table Metadata page: editing metadata](./metadata-editing.md).
- [Field Filters: create smart filter widgets for SQL questions](https://www.metabase.com/learn/sql-questions/field-filters.html).
