## Contents

1. [Should we drop dimension descriptions?](#should-we-drop-dimension-descriptions)
2. [Are metrics only math over measures?](#are-metrics-only-math-over-measures)

## Should we drop dimension descriptions?

The Dimensions tab of a metric in Data Studio lets you write a description for
each dimension, and the backend saves it with the metric. Nothing reads it:

- The metrics viewer, explorations and dimension pickers don't show it.
- Metabot's `get_research_candidates` doesn't send it
  (`src/metabase/explorations/impl.clj`).

<div class="callout">
<strong>Question.</strong>
Drop the description field, or keep it and show it somewhere, such as a
tooltip in the dimension picker or the dimension groups Metabot gets?
</div>

Dropping it keeps the Dimensions tab to what has an effect: display name,
default, time grouping and source column. Keeping it only pays off once it is
shown. See [Dimension descriptions today](prototypes/notes#dimension-descriptions-today)
in the notes.

## Are metrics only math over measures?

[DSN-785](https://linear.app/metabase/issue/DSN-785/metrics-30-metric-trees)
says a metric is "a number with dimensions, not a data source", defined as math
over measures or other metrics. A simple aggregation on one table, such as
Orders count, is already a measure.

<div class="callout">
<strong>Question.</strong>
Should the prototype assume metrics are only these higher-level concepts, and
leave a simple aggregation on a single table to measures?
</div>

If yes:

- Every metric has at least two terms, or one term with its own filter, so a
  metric always says something a measure alone doesn't.
- Measure and metric stop overlapping: measures hold the table and the
  aggregation, metrics hold the math and the meaning.

If no, a metric can be a single measure with no math. That keeps today's
metrics, which are single-table aggregations, working as they are, but the
same number can then exist both as a measure and as a metric.
