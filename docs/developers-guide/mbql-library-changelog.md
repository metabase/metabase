---
title: MBQL Library changelog
---

# MBQL Library Changelog

Changes made to the library API for manipulating MBQL queries, found in `metabase.lib.js`. The latest API documentation
can be found [here](https://metabase-dev-docs.github.io/metabase/metabase.lib.js.html).

This library is mainly used by Metabase's own frontend, but it is treated as a proper API surface which is versioned
and documented in this changelog.

## Metabase 0.50.0

- Created this file and began versioning this API.
- New function `as-returned` has been added. It handles a tricky case when adding filters or expressions to a query
  with aggregations.

  Suppose we have a query with aggregations in its last stage. When adding a filter or expression to that stage, it's
  applied **before** the aggregations. That may be the desired behavior, but if we want a filter or custom expression
  based on the aggregations and breakouts in the last stage, there was no good support in this API.

  `as-returned` looks at the query and stage, and shifts to a later stage if necessary. If a later stage is needed but
  we were already on the last stage, a new empty stage is appended.
