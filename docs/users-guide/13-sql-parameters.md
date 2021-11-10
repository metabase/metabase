# Creating SQL templates

You can create SQL templates by adding variables to your SQL queries in the [Native/SQL editor][sql-editor]. These variables will create filter widgets that you can use to change the variable's value in the query. You can also add parameters to your question's URL to set the filters' values, so that when the question loads, those values are inserted into the variables.

![Variables](images/sql-parameters/02-widget.png)

## Defining variables

Typing `{% raw %}{{variable_name}}{% endraw %}` in your native query creates a variable called `variable_name`.

This example defines a Text variable called `cat`:

```
SELECT count(*)
FROM products
WHERE category = {% raw %}{{cat}}{% endraw %}
```

Metabase will read the variable and attach a filter widget to the query, which people can use to change the value inserted into the `cat` variable. So if someone entered "Gizmo" into the filter widget, the query Metabase would run would be:

```
SELECT count(*)
FROM products
WHERE category = "Gizmo"
```

If you're writing a native MongoDB query, your query would look more like this, with the `cat` variable being defined inside of the `match` clause.

```
{% raw %}[{ $match: { category: {{cat}} } }]{% endraw %}
```

Field filters, a special type of filter, have a [slightly different syntax](#field-filter-syntax).

## Setting SQL variables

To set a SQL variable to a value, you can either:

- Enter a value into the filter widget, and re-run the question, or
- Add a parameter to the URL and load the page.

To add a value to the URL, follow this syntax:

```
?variable_name=value
```

For example, to set the `{% raw %}{{cat}}{%endraw%}` variable on a question to the value "Gizmo", your URL would look something like:

```
https://www.yourmb.com/question/42-eg-question?cat=Gizmo
```

To set multiple variables, separate parameters with an ampersand (`&`):

```
https://www.yourmb.com/question/42-eg-question?cat=Gizmo&maxprice=50
```

## Setting a default value

If you input a default value for your variable, this value will be inserted into filter widget by default. If you clear the filter widget, no value will be passed (i.e., not even the default value).


### Default value in the query

You can also define default values directly in your query, which are useful when defining complex default values. Note that the hash (`#`) might need to be replaced by the comment syntax of the database you're using. Some databases use double-dashes (`--`) as comment syntax.

Here's an example that sets the default value of a Date filter to the current date:

```
SELECT *
FROM products
WHERE created_at = [[ {% raw %}{{dateOfCreation}}{% endraw %} #]]CURRENT_DATE()
```

## SQL variable types

When you define a variable, the __Variables__ side panel will appear. You can set a type for a variable, which changes the kind of filter widget that Metabase presents.

There are four types of variables:

- **Text**: a plain input box.
- **Number**: a plain input box.
- **Date**: a simple date picker.
- [Field Filter](#the-field-filter-variable-type): different filter widgets, depending on the mapped field.

That last variable type, [Field Filter](#the-field-filter-variable-type), is special; it lets you create "smart" filter widgets, like a search box, or a dropdown menu of values, or a dynamic date picker that can allow you to specify a date range.

You can include multiple variables in the query, and Metabase will add multiple filter widgets to the question. When you have multiple filter widgets, you can click on a filter widget and drag it around to rearrange the order.

### Optional clauses

You can make a clause optional in a query. For example, you can create an optional `WHERE` clause that contains a SQL variable, so that if no value is supplied to the variable (either in the filter or via the URL), the query will still run as if there were now `WHERE` clause.

To make a clause optional in your native query, type `[[brackets around a {% raw %}{{variable}}{% endraw %}]]`. If you input a value in the filter widget for the `variable`, then the entire clause is placed into the template; otherwise Metabase will ignore the clause.

In this example, if no value is given to `cat` (either from its filter widget or parameters in the URL), then the query will just select all the rows from the `products` table. But if `cat` does have a value, like `Widget`, then the query will only grab the products with a category type of `Widget`:

```
SELECT count(*)
FROM products
[[WHERE category = {% raw %}{{cat}}{% endraw %}]]
```

Or in MongoDB:

```
{% raw %}
[
    [[{
        $match: {category: {{cat}}}
    },]]
    {
        $count: "Total"
    }
]
{% endraw %}
```

To use multiple optional clauses, you must include at least one regular `WHERE` clause followed by optional clauses, each starting with `AND`:

```
SELECT count(*)
FROM products
WHERE True
  [[AND id = {% raw %}{{id}}{% endraw %}]]
  [[AND category = {% raw %}{{category}}{% endraw %}]]
```

When using a field filter, the column name should not be included in the SQL. Instead, the variable should be mapped to a field in the side panel:

```
SELECT count(*)
FROM products
WHERE True
  [[AND {% raw %}{{id}}{% endraw %}]]
  [[AND {% raw %}{{category}}{% endraw %}]]
```

## The Field Filter variable type

Setting a variable to the "Field Filter" type allows you to map the variable to a field in any table in the current database, and lets you create a "smart" filter widget that makes sense for that field.

Field filter variables should be used inside of a `WHERE` clause in SQL, or a `$match` clause in MongoDB.

### Field filter compatible types

Field filters ONLY work with the following field types:

- Category
- City
- Entity Key
- Entity Name
- Foreign Key
- State
- UNIX Timestamp (Seconds)
- UNIX Timestamp (Milliseconds)
- ZIP or Postal Code

The field can also be a datetime, which can be left as "No semantic type" in the data model.

When you set the __Variable type__ to "Field Filter", Metabase will present an option to set the __Field to map to__, as well as the __Filter widget type__. The options available for the Filter widget type depend on the field's type. For example, if you map to a field of type Category, you'll see options for either "Category" or None. If you map to a Date Field, you'll see options for None, Month and year, Quarter and year, Single date, Date range, or Date filter.

If you don't want a widget on the question at all, which you might do, for example, if you just want to allow this question to be mapped to a dashboard filter (see more on that below), you can set the __Filter widget type__ to "None".

If you're not seeing the option to display a filter widget, make sure the mapped field is set to one of the above types, and then try manually syncing your database from the "Databases" section of the Admin Panel to force Metabase to scan and cache the field's values.

If you want to map a Field Filter to a field that isn't one of the compatible types listed above, you'll need an Admin to change the [field type for that column][column-types]. 

## Field filter syntax

The syntax for Field Filters differs from a Text, Number, or Date SQL variable.

```
SELECT count(*)
FROM products
WHERE {% raw %}{{date_var}}{% endraw %}
```

Note the lack of an `=`. The reason you need to structure field filters this way is to handle cases where Metabase generates the code for you. For example, for handling situations where someone selects multiple values in the filter widget, or a range of dates.


A MongoDB native query example might look like this:

```
{% raw %}[ {$match: {{date_var}} } ]{% endraw %}
```

## Creating SQL question filters using Field Filter variables

Let's say you want to create a field filter that filters the `People` table by state, and you want people to be able to select multiple states at a time. Here's the query:

```
SELECT *
FROM PEOPLE
WHERE {%raw%}{{state}}{%endraw%}
```

Then, in the side panel, select the "Field Filter" variable type, and choose which field to map your variable to (in this case, `State`).

For a more in-depth guide, check out [Field Filters: create smart filter widgets for SQL questions][field-filter].

## Field types that don't work with Field Filter widgets

You cannot create a field filter widget if the variable is mapped to a field marked as any of the following:

- Avatar Image URL
- Description
- Email
- Enum
- Field containing JSON
- Image URL
- Number
- Latitude
- Longitude
- URL

## How to create different types of filter widgets

The kind of filter widget that Metabase displays when you create a Field Filter widget depends on a setting for that field in Metabase called **Filtering on this field**. Admins can set this field option to:

- Plain input box
- Search box
- A list of all values (also known as a dropdown menu)

Date fields will either have a simple date filter (for Date variables) or a dynamic date picker (for Field Filters mapped to a date field).

If you want to change the filter widget for a particular field, you'll need to ask an Admin to [update that field][filtering-on-this-field] in the data model and set the desired "Filtering on this field" option.

### Filter widget with plain input box

Create a simple __Text__ or __Number__ variable. Additionally, you can use a Field Filter with a field that has its __Filtering on this field__ value set to "Plain input box".

Note: to guard against SQL injection attacks, Metabase converts whatever is in the Search box to a string. If you want to use wildcards, check out [our Learn article][basic-input].

### Filter widget with search box

- Include a SQL variable in you query.
- Set the __Variable type__ to __Field Filter__.
- Set the __Field to map to__ to a field of type "Category" that has its __Filtering on this field__ option set to "Search box"

### Filter widget with dropdown menu and search

To create a dropdown menu with search and a list of all values, you need to:

- Include a SQL variable in you query.
- Set the __Variable type__ to __Field Filter__.
- Set the __Field to map to__ to a field of type "Category" that has its __Filtering on this field__ option set to "A list of all values".
- Set the __Filter widget type__ to "Category".

If the field you want to create a dropdown for is not set to the type "Category" with __Filtering on this field__ set to "A list of all values", an Admin will need to update the settings for that field. For example, if you want to create a dropdown menu for an incompatible field type like an Email field, an admin will need to change that field type to "Category", set the __Filtering on this field__ option to __A list of all values__, then re-scan the values for that field.

If however, there are too many different values in that column to display in a dropdown menu, Metabase will simply display a search box instead. So if you have a lot of email addresses, you may just get a search box anyway. The dropdown menu widgets work better when there's a small set of values to choose from (like the fifty U.S. States).

## Field filter gotchas

Some things that could trip you up when trying to set up a Field filter variable:

### Field filters don't work with table aliases

Table aliases are not supported. The reason is that field filters generate SQL based on the mapped field; Metabase doesn't parse the SQL, so it can't tell what an alias refers to.

The workaround is to either avoid aliases and use full table names, or instead use a subquery, e.g., a query nested inside a SELECT statement. Alternatively, you could create a view in your database that shows the results of a complicated query, and then query that view.

### Some databases require the schema in the FROM clause

An example for Oracle would be `FROM "schema"."table"`. In BigQuery, back ticks are needed, like `` FROM `dataset_name.table` ``.

## Connecting a SQL question to a dashboard filter

In order for a saved SQL/native question to be usable with a dashboard filter, the question must contain at least one variable.

The kind of dashboard filter that can be used with the SQL question depends on the field. For example, if you have a field filter called `{% raw %}{{var}}{% endraw %}` and you map it to a State field, you can map a Location dashboard filter to your SQL question. In this example, you'd create a new dashboard (or go to an existing dashboard), click the "Edit" button, add the SQL question that contains your State field filter variable, add a new dashboard filter (or edit an existing Location filter), then click the dropdown on the SQL question card to see the State field filter.

**Note that the SQL variable's default value for a question has no effect on the behavior of your SQL question when viewed in a dashboard.**

![Field filter](images/sql-parameters/state-field-filter.png)

More on [Dashboard filters][dashboard-filters].

## Further reading

- [Create filter widgets for charts using SQL variables][sql-variables].
- [Field Filters: create smart filter widgets for SQL questions][field-filters].
- [Troubleshooting filters][troubleshooting-filters].
- [Dashboard filters][dashboard-filters].

---

## Next: Referencing saved questions in queries

Learn how to [refer to a saved question in a SQL query](referencing-saved-questions-in-queries.md).

[sql-editor]: ./writing-sql.html
[column-types]: ../administration-guide/03-metadata-editing.html#types
[dashboard-filters]: 08-dashboard-filters.html
[field-filter]: /learn/sql-questions/field-filters.html
[filtering-on-this-field]: ../adminstration-guide/03-metadata-editing.html#picking-the-filter-user-interface-for-a-column
[sql-variables]: /learn/sql-questions/sql-variables.html
[troubleshooting-filters]: ../troubleshooting-guide/filters.html
[basic-input]: /learn/sql-questions/sql-variables.html#basic-input-variable-text
