# Identifiers and re-import

Every id in the tree is derived from the project, never generated, so a re-run writes the same ids and a re-import
updates what the first import created instead of duplicating it. The derivations live in `ids.clj`; `<tool>` is the
source's (`dbt`), so two sources never share an id:

| Id | Hashed from | How |
| -- | -- | -- |
| a metric card's `entity_id` | `<tool>-import/metric/` + the name of the Metabase Database the metric's table is mapped to (its `:databases` value) + `/` + the metric's unique id in the source | the first 60 bits of the string's SHA-256 hash seed Metabase's NanoID generator (`metabase.util/generate-nano-id`) |
| the collection's `entity_id` | `<tool>-import/collection/` + the names of the Metabase Databases the run writes cards for, sorted and joined with commas + `/` + the project's name | the same |
| a curated dimension's id | `<tool>-import/dimension/` + the metric's unique id + `/` + the dimension's path (`<join>__<dimension>`, or the bare name on the metric's own table) | a name-based (version 3) UUID |
| a dimension group's id | the group's type (`main` or `connection`) + `/` + its name, the table's label or its relation's name | the same, which is how Metabase derives a group's id from its display name |

The consequences, for better and worse:

- A metric whose unique id changes in the source is a new card on import, and the old card stays in the instance
  (import never deletes); a new label or description keeps the card and updates it.
- Importing again, after a re-run, overwrites the imported cards with what the import emits: a metric's curated
  dimensions, display name and description edited in the UI since the last import go back to what the source says,
  and the collection, if it was moved under another one, goes back to the root. Curate in the source, or import once.
- The ids carry the Metabase Database. One project imported for two Metabase databases (a `dev` and a `prod`
  warehouse, say, each connected as its own Database) is two sets of cards in two collections, each re-importable on
  its own; two projects with the same name collide only when they are also mapped to the same Database. The other side
  of that: renaming a Metabase Database (or changing what a warehouse database maps to in `:databases`) re-keys every
  card and the collection, so the next import creates a second set of cards next to the first instead of updating it.
  Rename before the first import, or delete the first set by hand.
- A re-run replaces what the previous run wrote for the collection (`collections/main/<collection-slug>.yaml` and
  `collections/main/<collection-slug>/`), so a metric renamed or removed since then does not survive as a stale file
  in the tree: a stale card file would come back as a card. Anything else under `:out-dir` is left alone, which
  includes the tree of a previous run with another `:collection-name`: its cards carry the same `entity_id`s as the new
  run's, so importing a directory holding both would load each metric twice, the second time over the first. Change
  the name and the old tree has to go by hand.
