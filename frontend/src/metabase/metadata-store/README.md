# The metadata store

`state.entities` holds one normalized record per database, table, field, and so
on. `getMetadata` builds the metabase-lib v1 `Metadata` object from those
records.

## This store is not a deletable mirror slice

The store doctrine says to delete mirror slices and to read the RTK Query cache
instead. That rule fits a slice which copies one endpoint. The `user` slice is
the example: one endpoint fills it, so a cache read serves it.

This store is different. It folds 34 endpoints into one record per entity, so it
needs a reducer. It is one write path over many sources, not a copy of one
response.

## The slices are the CLJS provider's input format

`parse-metadata` in `src/metabase/lib/js/metadata.cljc` reads eight keys off the
`Metadata` object by string: `databases`, `tables`, `fields`, `snippets`,
`cards`, `measures`, `metrics`, and `segments`.

Two rules follow:

- No slice can be deleted on its own while `getMetadata` feeds
  `Lib.metadataProvider`.
- A slice with no JS readers is still live. Search for its key in
  `metadata.cljc` before you call it dead.

## The RTK Query cache is not a drop-in for an accumulator

RTK Query removes a cache entry 60 seconds after its last subscriber unmounts.
`runRtkEndpoint` unsubscribes as soon as the request resolves.

A reader whose data must outlive its own fetch needs owned state, not a cache
read. The `dashboards` slice is the worked example. Both of its readers depended
on the accumulator, so neither could move to a cache read.

## One write door

`hydration.ts` holds the only writer. Every hydrating endpoint flows through it.

That single door is the seam for a later swap to a CLJS-backed store. Keep it
single.
