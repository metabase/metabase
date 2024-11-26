---
title: Sankey
---
# Sankey

Sankey charts show how data flows through multi-dimensional steps.

![Left-aligned sankey chart](../../images/sankey-left-aligned.png)

## Data shape

To create a Sankey chart, you'll need three columns in your results:

- **Source**: specifies a node in the sankey flow.
- **Target**: column that specifies a receiving node.
- **Count**: value that determines the thickness of the edge from a source to a target.

Here's the data shape used to create the chart above.

| Source page  | Target page  | Total Visitors |
| ------------ | ------------ | -------------- |
| Entry        | Homepage     | 584            |
| Homepage     | Product Page | 2,700          |
| Product Page | Add to Cart  | 572            |
| Add to Cart  | Checkout     | 2,490          |
| Checkout     | Purchase     | 1,756          |
| Homepage     | Search       | 2,427          |
| Search       | Product Page | 2,027          |
| Product Page | Add to Cart  | 2,203          |
| Add to Cart  | Checkout     | 1,475          |
| Search       | Product Page | 1,563          |
| Checkout     | Purchase     | 1,041          |
| Homepage     | Exit         | 810            |
| Product Page | Checkout     | 815            |
| Checkout     | Purchase     | 2,217          |
| Homepage     | Exit         | 1,020          |

Each row includes a source node, a target node, and a quantity to scale the size of the target node.

## Sankey display options

You can change a charts alignment, edge labels, and edge colors.

### Alignment

You can select left, right, or justified alignment for the sankey chart. Alignment determines how the chart should display the end nodes (a.k.a. leaf nodes or terminal nodes).

The chart in the section above is left-aligned. The end nodes, `Exit` and `Purchase`, are aligned to the left.

For right alignment, the end nodes, `Exit` and `Purchase`, move to the chart's right:

![Right-aligned sankey chart](../../images/sankey-right-aligned.png)

In this case, justified alignment looks the same, as the end nodes move to take up the whole chart.

### Edge labels

Whether an edge displays its value.

### Edge color

Options for edge colors include:

- **Gray**: All edges are gray. Nodes retain their color.
- **Source**: The source node determines the edge colors. The source node is the node to the left of an edge.
- **Target**: The target node determines the edge colors. The target node is the node to the right of an edge.

## Circular dependencies won't work

If your sources point to targets that point back to the same source, Metabase won't be able to create a sankey chart.
