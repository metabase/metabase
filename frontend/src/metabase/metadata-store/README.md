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

## The provider needs the hydrated object, not the records

`Lib.metadataProvider` reads eight keys off the object it is given: `databases`,
`tables`, `fields`, `questions`, `snippets`, `measures`, `metrics` and
`segments`. The store holds all eight, so passing `state.entities` looks like it
would work, and for plain tables it does.

Two things break, both covered by `provider-parity.unit.spec.ts`:

- A saved question's columns. `assemble-card` in `metadata.cljc` reads the
  virtual table's `fields` and deliberately ignores `_plainObject`, "because it
  can contain field names in the field property instead of the field objects
  themselves". The store's record holds field ids, so the card falls through to
  its source table and reports the wrong columns.
- A field's values and remapping. `getMetadata` assigns `field.values` and
  `field.remapping` during hydration, and the bridge excludes neither, so both
  reach the provider's columns. The records carry neither.

So the provider cannot be moved off `getMetadata` by handing it the records.
Anything that replaces it has to denormalize those relations first.

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
