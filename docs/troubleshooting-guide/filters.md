# My filters don't work

[Filtering][filter-gloss] is one of the most common operations analysts perform on data. Metabase enables you to add filters to questions using the Notebook Editor or by writing SQL, and to add [filter widgets][filter-widget] to dashboards so that people can control what data they see without having to modify questions. Metabase also supports [cross-filtering][cross-filter-gloss] so that clicking on a chart or a table in a dashboard changes the filters for other cards in the same dashboard.

To learn more about these features, please read the articles listed below. If you have problems or encounter unexpected behavior, please look at the specific problems and their solutions.

- "[Cross-filtering: using a chart to update a dashboard filter][learn-cross-filtering]"
- "[SQL variables][learn-filter-charts-sql-variables]"
- "[Adding filters to dashboards with SQL questions][learn-filter-sql-questions]"
- "[Create filter widgets for charts using SQL variables][learn-filter-sql-variables]"

## I can't connect a filter to a question

**How to detect this:** You can create a new filter in a dashboard, but when you try to connect it, the question you want to connect to doesn't show up as an option.

**How to fix this:** A filter controls the value of a variable in a question; if the question doesn't actually have any variables, you can't connect a filter to it, so check that the question contains a variable.

## My filter doesn't show a dropdown list of possible values

**How to detect this:** You have created a filter, but instead of displaying a dropdown list of possible choices, it displays a text entry box for you to type in.

**How to fix this:** The root cause is usually that the field has not been identified as a category in the data model. To fix this:

1. Go to the Admin Panel and select the **Data Model** tab.
2. Select the database, schema, table, and field in question.
3. Click the gear-icon to view all the field's settings.
4. Set **Field Type** to "Category" and **Filtering on this field** to "A list of all values."
5. Click the button **Re-scan this field** in the bottom.

## My filters don't work after a change to the underlying database schema

**How to detect this:** Someone has renamed a column in the database, and a filter that used that column no longer seems to have any effect, or seems to eliminate all of the rows even after you [re-sync][sync-scan] Metabase with the database.

**How to fix this:** Tools like Excel can automatically update formulas when cell values are moved around in a spreadsheet, but databases schemas are much more complicated, so Metabase does not automatically update the names of columns used in questions when the underlying database changes. If the schema has changed, you must update your questions and filters to match.

## My filter does not work when I embed my question

**How to detect this:** A SQL question with a filter works correctly in Metabase itself, but the filter has no effect when the question is embedded via public sharing. For example, the question is `select {% raw %}{{filter}}{% endraw %}`, and filling in a constant value such as `1` works when the question is in Metabase, but is removed when the question is embedded in a web page using an iframe.

**How to fix this:** Signed embedding must be used to pass filter settings to embedded questions.

Depending on the programming language, you must ensure that an empty set of parameters is passed as an object so that they will be deserialized correctly. For example, in R the parameters must be:

```
params <- list()
names(params) <- character(0)
```

while in PHP, they must be:

```
(object) []
```

Without this, the parameters are deserialized as an empty array rather than an empty object.

[cross-filter-gloss]: /glossary.html#cross_filtering
[filter-gloss]: /glossary.html#filter
[filter-widget-gloss]: /glossary.html#filter_widget
[learn-cross-filtering]: /learn/dashboards/cross-filtering.html
[learn-filter-charts-sql-variables]: /learn/sql-questions/sql-variables.html
[learn-filter-sql-questions]: /learn/dashboards/filters.html
[learn-filter-sql-variables]: /learn/sql-questions/sql-variables.html
[sync-scan]: ./sync-fingerprint-scan.html
