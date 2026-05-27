# lib API gap: readers for field-ref opts (`:join-alias`, `:source-field`)

Status: ready-for-human

## Context

`metabase.explorations.impl/target-resolvable?` (`src/metabase/explorations/impl.clj` L201-223) builds a fast positive-lookup short-circuit for the common case where a dimension's `:dimension_mappings` target is a plain field ref. The cheap path needs to ask two questions about the field ref's opts map:

1. Does it have a `:join-alias`? (If so, fall through to `lib/find-matching-column` — explicit-join disambiguation needs the full matcher.)
2. What's the `:source-field` (FK column id), if any? (Used as part of the `[source-field-id field-id]` identity key in `breakoutable-column-index`.)

The current implementation reads both keys directly off the opts map:

```clojure
;; src/metabase/explorations/impl.clj L213-218
(let [field-ref? (and (vector? target) (= :field (first target)))
      opts       (when field-ref? (second target))
      field-id   (when field-ref? (nth target 2 nil))]
  (or (and (int? field-id)
           (not (:join-alias opts))
           (contains? col-index [(:source-field opts) field-id]))
      ...))
```

`metabase.lib` does not yet expose readers for these field-ref opt keys, so the call site reaches into the MBQL clause shape directly. Per the "queries are a black box outside `metabase.lib`" convention (`feedback_query_blackbox`), this is the kind of access we want to push behind a lib API.

`breakoutable-column-index` (`src/metabase/explorations/impl.clj` L157-167) has a sibling shape on the column side — it filters out columns with `:metabase.lib.join/join-alias` and indexes by `[:fk-field-id :id]` — and that one is already lib-shaped, which is part of why the field-ref side stands out.

## Ask

Add lib accessors so callers can ask the same two questions without destructuring the clause. Suggested shapes (final names TBD by `metabase.lib` owners):

- `(lib/field-ref-join-alias field-ref)` → string or nil
- `(lib/field-ref-source-field field-ref)` → field id or nil

Or a single `(lib/field-ref-opts field-ref)` that returns a normalized opts view, with downstream `(lib/join-alias …)` / `(lib/source-field …)` readers that work on that view.

Once these exist, `target-resolvable?` can swap its two kw reads for the lib calls and stop touching the clause directly.

## Out of scope

- Changing the cheap-path logic itself. The short-circuit and the fallback to `lib/find-matching-column` should stay as-is; this is purely about hiding the clause-shape access.
- Other LIB-GAP findings from the explorations Phase B inventory — file separate follow-ups in this directory as they come up.

## References

- Call site: `src/metabase/explorations/impl.clj` L217-218
- Inventory entry: `.scratch/explorations-jank-inventory.md` (`impl.clj` section)
- Convention: `feedback_query_blackbox` (user memory)
