---
title: My linked filters don't work
---

# My linked filters don't work

You have created a [linked filter][linked-filter-gloss] so that (for example) if a dashboard contains both a "State" and a "City" filter, the "City" filter only shows cities in the state selected by the "State" filter. However:

- your cards are showing "No result" when you apply the linked filter,
- your linked filter seems to have no effect, or
- your linked filter widget does not display a dropdown of filtered values.

If you are having problems with a regular [filter widget][filter-widget-gloss], please see [this guide](./filters.md). In order to fix problems with linked filters, you need a clear understanding of how they work:

## Does a connected dashboard card use a SQL variable?

**Root cause**: Native/SQL questions must have a [field filter](../questions/native-editor/sql-parameters.md#the-field-filter-variable-type) variable in order to be linked. Regular SQL variables won't work.

**Steps to take**:

1. Update the card's query to change the regular variable to a [field filter](../questions/native-editor/sql-parameters.md#the-field-filter-variable-type) variable.

See [Limitations of linking filters](../dashboards/filters.md#limitations-of-linking-filters)

## Do you understand the directionality of linked filters?

**Root cause:** Linked filters are one of the more complex features of Metabase, and many problems stems from misunderstanding their operation.

**Steps to take:** Check that you understand the points below, and that your linked filter is set up with them in mind.

1. A filter isn't part of a specific question. Instead, a filter is added to a dashboard and its value is used to fill in variables in questions.

2. In order for Metabase to display a dropdown list of possible filter values, it must know that the column corresponds to a category. This happens automatically if the question is created from tables via the Notebook Editor, since Metabase has knowledge about the table and columns from synchronization.

3. If the question that contains the variable is written in SQL, on the other hand, the author of the question must have selected "Field Filter". Also, the field referenced must be set as a category in the Table Metadata in order for Metabase to show a dropdown list of values.

## Are the filters linked in the correct direction?

**Root cause:** The most common cause is that the filters have been linked in the wrong direction. If you want the values shown by Filter B to be restricted by the setting of Filter A, you have to change the settings for Filter B, not Filter A---i.e., the downstream filter has the setting, not the upstream filter.

**Steps to take:**

1. Remove the existing linkage and create a new one in the opposite direction.

## Do some rows actually satisfy the full filter condition?

**Root cause:** There aren't any rows that satisfy all the conditions in a linked filter. Continuing with the city and state example, if you manually enter the name of a city that isn't in the selected state, no record will satisfy both conditions.

**Steps to take:**

1. Create a question that only uses the first filter and check that it produces some rows. (If it does not, adding a second filter isn't going to make any rows appear.)
2. Create a question that you think should produce the same result as the combination of linked filter settings that isn't producing any data. If it produces the result you expect, check for typing mistakes and that you are using [the correct type of join][join-types].

## Do all rows that pass the first test also pass the second?

**Root cause:** In some cases all of the rows that satisfy the first filter's condition also satisfy the second filter's condition, so the second filter has no effect.

**Steps to take:**

1. Create a question that includes the first filter condition directly (i.e., in the question rather than using a variable), then add the second filter's condition. If the result set does not change, the problem is in the logic rather than in the filters.

## Does the linked filter widget display a dropdown of filtered values?

**Root cause:** In order for a linked filter widget to display the correct subset of values as a dropdown, an explicit [foreign key][foreign-key-gloss] definition must be set up---linking the filters does not by itself tell Metabase about the relationship.

**Steps to take:**

1. Check that Metabase's table metadata for your database includes the foreign key relationship.

[filter-widget-gloss]: https://www.metabase.com/glossary/filter_widget
[foreign-key-gloss]: https://www.metabase.com/glossary/foreign_key
[join-types]: https://www.metabase.com/learn/sql-questions/sql-join-types.html
[learn-linking]: https://www.metabase.com/learn/dashboards/linking-filters.html
[linked-filter-gloss]: https://www.metabase.com/glossary/linked_filter
