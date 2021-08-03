# My linked filters don't work

Metabase lets you [link filters][linked-filter-gloss] so that (for example) if a dashboard contains both a "State" and a "City" filter, the "City" filter only shows cities in the state selected by the "State" filter; the article ["Linking filters in dashboards"][learn-linking] explains how to set them up.

In order to fix problems associated with linked filters, you need a clear understanding of how they work:

1. A filter isn't part of a specific question. Instead, a filter is added to a dashboard and its value is used to fill in a variable in a question (or in several questions).

2. In order for Metabase to display a dropdown list of possible filter values, it must know that the filter corresponds to a category. If the question is created using the Notebook Editor, this happens automatically, since Metabase analyzes the query as it turns the graphical representation into SQL.

3. If the question that contains the variable is written in SQL, on the other hand, the author of the question must have selected "Field Filter" to tell Metabase that the variable should be displayed like a category. In addition, someone must have edited the metadata for the database to specify that the column in question is a category.

## My cards are showing "No result" when I apply linked filters

**How to detect this:** Some data shows up when the first filter is applied, but nothing shows up when the second (dependent) filter is applied as well. For example, you may have a "State" and a "City" filter linked so that the "City" filter only shows cities in the selected state; some rows are displayed when you select a state, but none appear when you also add a city.

**How to fix this:** The root cause of this problem is usually that there really are no rows that satisfy both conditions. For example, if you manually enter the name of a city that isn't in the selected state, no record will satisfy both conditions. You can check this by writing a native SQL query that you think should produce the same result. If it does not, check for typing mistakes and that you are using the correct type of join.

## My linked filter seems to have no effect

**How to detect this:** After creating and applying a linked filter, you see the same set of rows that you saw before the second (linked) filter was applied.

**How to fix this:**

1. The most common cause is that the filters have been linked in the wrong direction. If you want the values shown by Filter B to be restricted by the setting of Filter A, you have to change the settings for Filter B, not Filter A---i.e., the downstream filter has the setting, not the upstream filter.

2. A less common cause is that all of the rows that pass the first test also pass the second. Again, you can check this by writing a native SQL query that you think should produce the reduced result; if it does not, the problem is most likely with the logic.

## My linked filter widget does not display a dropdown of filtered values

**How to detect this:** After linking Filter A to Filter B, you expect Filter B to display a dropdown showing only the values constrained by the current setting of Filter A. Instead, the dropdown shows all available values.

**How to fix this:** In order for a linked filter widget to display the correct subset of values, an explicit [foreign key][foreign-key-gloss] definition must be set up---linking the filters does not by itself tell Metabase about the relationship. To check this, look at Metabase's data model for your database.

[foreign-key-gloss]: /glossary.html#foreign_key
[learn-linking]: /learn/dashboards/linking-filters.html
[linked-filter-gloss]: /glossary.html#linked_filter
