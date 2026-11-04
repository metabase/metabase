(ns metabase.queries.card-schema
  "The `:model/Card` columns that have to be SELECTed together for the `:card_schema` upgrade to run, plus the
  helpers that project them.

  This namespace is deliberately tiny. `metabase.queries.core` pulls in most of the `queries` module, and the
  low-level `db.clj` namespaces that need these helpers sit *below* it in the load graph — requiring the module's
  main API namespace from them is a cyclic load. Nothing here needs more than Toucan.")

(def schema-governed-columns
  "The columns of `:model/Card` whose stored representation is relevant to `:card_schema`. These columns must be
  read together, and will be written back together.

  Reading any one of them is what arms the upgrade: a projection that names none of them has nothing an upgrade
  could change, so it is free to SELECT whatever narrow set of columns it likes.

  Keep this in sync when adding an upgrade that rewrites a new column."
  #{:dataset_query :result_metadata :dimensions :dimension_mappings})

(def schema-upgrade-triggers
  "Every column a [[metabase.queries.models.card/upgrade-card-schema-to]] implementation reads or writes. A SELECT
  naming any [[schema-governed-columns]] must include all of these, or the upgrade cannot run correctly.

  Beyond the governed columns themselves this is:

  - `:card_schema`, the version marker that says which upgrades still have to run. It is not a governed
    representation, so selecting it alone must not demand the rest of the set.
  - `:type`, read by the upgrade to 24 to recognize a metric. It is never written by an upgrade, but leaving it out
    is worse than an error: the upgrade silently skips the card and still stamps it as current.
  - `:entity_id`, which the upgrade to 24 seeds the backfilled dimension ids from. Same failure mode as `:type`, and
    quieter still: without it the ids are derived from `nil`, so this SELECT's dimension set disagrees with every
    other one's and the card serializes differently depending on who read it.

  Keep this in sync with the columns read by the `upgrade-card-schema-to` implementations."
  (conj schema-governed-columns :card_schema :type :entity_id))

(def ^:private schema-select-columns
  "The `[modelable & columns]` projection [[selection]] SELECTs with: `:id`, so callers can key the rows they get
  back, plus every [[schema-upgrade-triggers]] column."
  (into [:id] schema-upgrade-triggers))

(def ^:private base-selection
  (into [:model/Card] schema-select-columns))

(defn selection
  "Returns a `[:model/Card columns...]` projection with all the query-related fields (see [[schema-upgrade-triggers]])
  plus `:id` and similar.

  Accepts an optional seq of extra columns to include."
  ([] base-selection)
  ([extras]
   (into base-selection extras)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *skip-dimension-backfill?*
  "When true, the `:card_schema` 24 upgrade leaves a pre-curation metric's `:dimensions` and
  `:dimension_mappings` exactly as stored instead of backfilling them.

  Bind it around a read whose caller does not look at a metric's dimensions -- one that wants an id, a name
  and a link. The backfill builds the metric's full implicitly-joined dimension set, which costs time and
  allocation proportional to (metrics x columns); hydrating a wide table's metrics for `query_metadata` did
  that once per metric and discarded all of it, taking minutes and exhausting the heap (#83937).

  Deliberately narrow:

  - **Only upgrade 24's backfill is skipped.** The upgrades to 21, 22 and 23 still run, so `:result_metadata`
    is still modernized, and `:dataset_query` is still normalized to current MBQL.

  - **`:card_schema` is still stamped to the current version.** The returned row therefore claims a vintage
    whose dimensions it is not carrying. That is in-memory only -- no read path writes it back -- and it
    cannot mislead `t2/update!`, which decides what to upgrade from the row's *stored* `card_schema` (read
    with the upgrades suppressed), never from an incoming card.

  - **Do not bind it around a write.** Writes legitimately need the real backfill. Note also that feeding a
    whole card read under this flag into `t2/update!` would put `:dimensions nil` into the changes and clobber
    the stored dimension set -- true of any card read whose `:dimensions` you pass back, but worth knowing."
  false)
