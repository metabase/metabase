## Contents

1. [Should we drop dimension descriptions?](#should-we-drop-dimension-descriptions)

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
