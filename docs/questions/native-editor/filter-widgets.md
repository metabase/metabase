---
title: Filter and parameter widgets for native code
---

# Filter and parameter widgets for native code

When you add a [SQL variable or parameter](./sql-parameters.md) to your native/SQL query, Metabase will add a widget to the top of the query that people can use to set the variable's value.

## How to create different types of filter and parameter widgets

The kind of filter widget that Metabase displays when you create a field filter widget depends on a setting for that field in Metabase called **Filtering on this field**. Admins can set this field option to:

- [Input box](#input-box)
- [Search box](#search-box)
- [Dropdown list](#dropdown-menu-and-search)

Date fields will either have a simple date filter (for date variables) or a dynamic date picker (for field filters mapped to a date field).

If you want to change the default filter widget for a particular field, you'll need to ask an admin to update that field in [the Table Metadata](../../data-modeling/metadata-editing.md) and set the desired "Filtering on this field" option.

For dropdown lists and search boxes, you can also customize values available in the list. See below.

### Input box

1. Include a SQL variable in your query.
2. Set the **Variable type** to **Field filter**. If the query lacks a database field, you could use a Text or Number type as well, depending on what you're filtering.
3. Set **Field to map to** to the appropriate field (only if you selected the field filter variable type).
4. Set **Filter widget operator** to whatever [operator](#filter-widget-operators) you want.
5. Set **How should users filter on this variable** to "Input box".

### Search box

1. Include a SQL variable in your query.
2. Set the **Variable type** to **Field filter**. If the query lacks a database field, you could use a Text or Number type as well, depending on what you're filtering.
3. Set **Field to map to** to a field of type "Category" (only if you selected the field filter variable type).
4. Set **Filter widget operator** to whatever [operator](#filter-widget-operators) you want.
5. Set **How should users filter on this variable** to "Search box". If you're not using a field filter, you'll need to edit the search box settings to [tell Metabase where to get the values to search](#customizing-values-for-dropdown-lists-and-search-boxes).

To guard against SQL injection attacks, Metabase converts whatever is in the search box to a string. If you want to use wildcards, check out [our Learn article][sql-variables].

### Dropdown menu and search

To create a dropdown menu with search and a list of all values:

1. Include a variable in your query.
2. Set the **Variable type** to **Field filter**. If the query lacks a database field, you could use a Text or Number type as well, depending on what you're filtering.
3. Set **Field to map to** to the appropriate field (only if you selected the field filter variable type).
4. Set **Filter widget operator** to whatever [operator](#filter-widget-operators) you want.
5. Set **How should users filter on this variable** to "Dropdown list". If you're not using a field filter, you'll need to edit the dropdown list settings to [tell Metabase where to get the values to list in the dropdown](#customizing-values-for-dropdown-lists-and-search-boxes).

If there are too many different values in that column to display in a dropdown menu, Metabase will simply display a search box instead. So if you have a lot of email addresses, you may just get a search box anyway. The dropdown menu widgets work better when there's a small set of values to choose from (like the fifty U.S. states).

## Customizing values for dropdown lists and search boxes

When you add a dropdown menu or search box, you can tell Metabase which values people can choose from when using a filter with a dropdown list or search box.

1. Add a dropdown list or search box.
2. Next to the option you chose, click **Edit**.
3. Metabase will pop up a modal where you can select **Where the values should come from**.

You can choose:

- **From connected fields**. If you selected the Field filter variable type, you'll also have the option to use the connected field.
- **From another model or question**. If you select this option, you'll need to pick a model or question, then a field from that model or question that Metabase will use to supply the values for that dropdown or search box. For example, if you want the dropdown to list the different plans an account could be on, you could select an "Account" model you created, and select the field "Plan" to power that dropdown. The dropdown would then list all of the distinct plan options that appear in the "Plan" column in the Accounts model.
- **Custom list**. Enter each item on a line. You can enter any string values you like.

You can also [change a dashboard filter's selectable values](../../dashboards/filters.md#change-a-filters-selectable-values).

## Setting a default value in the filter widget

In the variables sidebar, you can set a default value for your variable. This value will be inserted into the corresponding filter widget by default (even if the filter widget is empty).

To override the default value, insert a new value into the filter widget.

## Requiring a value for a filter widget

In the **Variable** settings sidebar, you can toggle the **Always require a value** option. If you turn this on:

- You must enter a default value.
- The default value will override any [optional syntax](./optional-variables.md) in your code (like an optional `WHERE` clause). If no value is passed to the filter, Metabase will run the query using the default value. Click on the **Eye** icon in the editor to preview the SQL Metabase will run.

## Filter widget operators

For text, number, and date filter widgets, you'll need to select a filter operator.

### Text

Filter operator options include:

- String
- String is not
- String contains
- String does not contain
- String starts with
- String ends with

### Number

Filter operator options include:

- Equal to
- Not equal to
- Between
- Greater than or equal to
- Less than or equal to

### Dates

Filter operator options include:

- Month and year
- Quarter and year
- Single date
- Date range
- Relative date
- All options. Metabase will give you a menu where you can choose how they filter dates: by range, relative dates, etc.
