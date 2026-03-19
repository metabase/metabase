---
title: Transform inspector
summary: Analyze how your transforms process data by inspecting input and output shapes, join behavior, and column distributions.
---

# Transform inspector

_Data Studio > Transforms > [transform name] > Inspect_

The transform inspector gives you a diagnostic view of your transforms. Instead of writing your own SQL to check row counts, join match rates, or column distributions, you can open the **Inspect** tab and let Metabase analyze your transform's inputs and outputs for you. The inspector is especially useful for catching data quality issues (like unmatched rows in joins) before they cause problems downstream.

![Transform inspector](../images/transform-inspector.png)

To inspect a transform, you need to run the transform at least once, since the inspector analyzes actual data in the target and source tables. If you change the transform definition, you'll need to re-run the query to refresh the inspector's analysis.

## Lenses

The inspector organizes its analysis into different lenses (displayed as tabs). Each lens focuses on specific aspects of your transform. Lenses only appear when relevant: for example, join analysis only shows up for transforms that include joins.

### Data summary

Data Summary gives you a quick snapshot of the transform's input and output tables:

- **Input tables**: table name, row count, column count.
- **Output table**: table name, row count, column count.
- **Field-level stats**: data type, distinct count, nil percentage, range, and averages.

### Column distributions

Visualizes how data distributions change through the transform. Can help you spot unexpected filtering, aggregation effects, or type changes. This lens is available when columns match between input and output tables (so you may not see it when pre-aggregating data).

Column distributions can be slow on large datasets because it computes distribution stats for every matched column.

### Join analysis

![Transform inspector join inspector detects unmatched rows](../images/join-problem.png)

Available when the transform includes joins. Shows how well your joins match across tables:

- **Join name**, **output rows**, **matched rows**, and **table rows** for each join.
- Shows a warning when more than 20% of rows are unmatched. You'll see them appear inline in the join analysis results.
- Can trigger [drill lenses](#drill-lenses) for deeper investigation into unmatched rows.

Join analysis generates multiple queries to compute match rates, so expect it to take longer than Data Summary. A clock icon on the tab indicates an expensive operation.

### Drill lenses

Drill lenses are dynamic tabs that appear based on analysis results. For example, if join analysis finds unmatched rows, a tab like "Unmatched Rows - Join 2" will appear.

Drill lenses show sample rows broken down by category:

- Rows with a key but no match.
- Rows with a NULL source key.
- Orphan rows on either side of the join.

Each card is clickable, so you can drill into a detailed question view. You can close a drill lens by clicking the **X** on its tab.

## Some lenses can take a while

![Some analyses may take a long time to load](../images/transform-inspector-analysis-warning.png)

Inspector lenses run queries against your database, and some lenses are can take longer than others. A clock icon on a lens tab means the lens could run a long query, depending on how many rows of data you're working with. For large datasets, consider running these lenses during off-peak hours.

## Further reading

- [Transforms overview](transforms-overview.md)
- [Query-based transforms](query-transforms.md)
- [Python transforms](python-transforms.md)
