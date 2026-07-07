---
title: Treemaps
---

# Treemaps

Treemap visualizations display hierarchical data as nested rectangles. The value of a metric determines the size of each rectangle, called a leaf. Larger values take up more area than smaller values.

When you group by two dimensions, the first dimension becomes the parent rectangles. The second dimension nests inside the parent rectangles as leaves.

![Treemap](../images/treemap.png)

## When to use a treemap

Use a treemap to compare how a total breaks down by one categorical dimension, or by a second categorical dimension nested within the first.

For example, you can show order counts by product category, then break each category down by vendor.

## Data shape for a treemap

To create a treemap, create a question that returns a single metric grouped by one or two dimensions.

When you group by one dimension, a treemap shows one leaf per value. Here's the data shape for a treemap of order count by category:

| Category  | Count |
| --------- | ----- |
| Widget    | 414   |
| Gadget    | 350   |
| Doohickey | 334   |
| Gizmo     | 289   |

When you group by two dimensions, the treemap nests the second dimension inside the first. The first dimension determines the outer rectangles and their colors. The second dimension determines the leaves nested inside the outer rectangles. The value of the metric determines each leaf's size.

Here's the data shape for a treemap of order count by category and vendor:

| Category  | Vendor                     | Count |
| --------- | -------------------------- | ----- |
| Widget    | Jerrell Gulgowski Inc      | 26    |
| Widget    | Brittany Mueller Inc       | 25    |
| Gadget    | Jerrod McLaughlin LLC      | 24    |
| Gadget    | Miles Ryan Group           | 22    |
| Gizmo     | Mr. Tanya Stracke and Sons | 30    |
| Doohickey | Kuhn-O'Reilly              | 27    |

## Build a query for a treemap

To build a nested treemap:

1. In the query builder, click **Summarize**.
2. Set a metric, such as **Count of rows**.
3. Group by a first dimension, such as **Category**.
4. Add a second grouping, such as **Vendor**.
5. In the visualization picker, select **Treemap**.

The order of the groupings matters. The first grouping determines the outer rectangles, and the second grouping nests inside.

## Treemap settings

To open chart settings, click the **Gear** icon in the bottom left of the visualization.

### Data

In chart settings, click the **Data** tab to configure the chart's groupings and value.

- **Grouping:** The dimension that determines the parent categories. To set a custom color for a parent category, click the color swatch next to the category's name. To rename a parent category, click the **...** next to the category's name.
- **Sub-grouping:** The dimension that nests inside each parent category as leaves.
- **Value:** The metric that determines the size of each leaf. To format the value, click the **...** to open the formatting menu. You can set the number style, separator style, number of decimal places, a multiplier, and a prefix or suffix.

### Display

In chart settings, click the **Display** tab to edit how the chart looks.

Use the following toggles to show or hide labels and values:

- **Show parent labels:** Display the name of each parent category.
- **Show parent values:** Display the value for each parent category.
- **Show leaf labels:** Display the name of each leaf.
- **Show leaf values:** Display the value for each leaf.

## Limitations and alternatives

- Treemaps display a single metric grouped by one or two dimensions. If your query returns more than one metric, the treemap uses the metric you select in the **Value** slot.
- When one leaf is far larger than the other leaves, the small leaves can become too small to see or select. If your values span a wide range, consider a [bar chart](./line-bar-and-area-charts.md) instead.
- To show a single level of part-to-whole composition, use a [pie chart](./pie-or-donut-chart.md) instead.