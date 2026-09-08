(ns metabase.queries.card-schema
  "The `:model/Card` columns that have to be SELECTed together for the `:card_schema` upgrade to run, plus the
  helpers that project them.

  This namespace is deliberately tiny. `metabase.queries.core` pulls in most of the `queries` module, and the
  low-level `db.clj` namespaces that need these helpers sit *below* it in the load graph — requiring the module's
  main API namespace from them is a cyclic load. Nothing here needs more than Toucan.")

(def schema-governed-columns
  "The columns of `:model/Card` whose stored representation is relevant to `:card_schema`. These columns must be
  read together, and will be written back together.

  Keep this in sync when adding an upgrade that rewrites a new column."
  #{:dataset_query :result_metadata :dimensions :dimension_mappings})

(def schema-upgrade-triggers
  "All the columns which any [[metabase.queries.models.card/upgrade-card-schema-to]] function reads, implying that
  they can impact a card at read time. A SELECT of any [[schema-governed-columns]] must include all of these.

  `:card_schema` belongs here rather than in [[schema-governed-columns]]: it is the version marker, not a governed
  representation, so selecting it alone (to satisfy this very rule) must not itself demand the rest of the set.

  Keep this in sync with the columns read by the `upgrade-card-schema-to` implementations."
  (conj schema-governed-columns :card_schema :type :database_id))

(def ^:private schema-select-columns
  "The `[modelable & columns]` projection [[card-by-id]] and [[cards-by-id]] SELECT with: `:id` (without it the
  upgrade never runs at all) plus every [[schema-upgrade-triggers]] column."
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
