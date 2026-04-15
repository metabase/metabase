(ns metabase.lib.aggregation.util
  "Helpers shared by the various parts of the lib that need to assign unique `:name`s to aggregation clauses."
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]))

(defn aggregation-column-names
  "Compute the set of effective column names of the aggregations currently in `stage-number` of `query`, optionally
  excluding the clause with `except-uuid`. Each aggregation's effective name is its `:name` option if set (via
  [[lib.metadata.calculation/column-name]]) or the computed [[lib.metadata.calculation/column-name-method]]
  otherwise."
  [query stage-number & {:keys [except-uuid]}]
  (into #{}
        (comp (remove #(and except-uuid (= (lib.options/uuid %) except-uuid)))
              (map #(lib.metadata.calculation/column-name query stage-number %)))
        (:aggregation (lib.util/query-stage query stage-number))))

(defn with-unique-aggregation-name
  "Set a unique `:name` on the aggregation `a-clause` that is derived from its effective column name (its existing
  `:name` option if set, otherwise the computed `column-name-method` — e.g. `sum`, `count`, `avg`) and deduplicated
  against the effective column names of the other aggregations on `stage-number`, excluding the clause with
  `except-uuid` when provided."
  [query stage-number a-clause & {:keys [except-uuid]}]
  (lib.options/with-clause-name
    a-clause
    (lib.util/unique-indexed-name
     (aggregation-column-names query stage-number :except-uuid except-uuid)
     (lib.metadata.calculation/column-name query stage-number a-clause))))

(defn with-unique-aggregation-name-after-replacement
  "When replacing an aggregation, decide what `:name` the replacement clause should carry.

    * If the replacement already has `:name` set, use it as-is.
    * Otherwise, if the target had `:name` and the two clauses compute the same column name (ignoring `:name` on the
      target), preserve the target's `:name` on the replacement so refs from later stages stay valid.
    * Otherwise, regenerate a unique `:name` from the replacement's computed column name, deduplicated against the
      effective column names of the other aggregations in the stage."
  [query stage-number target replacement]
  (cond
    (lib.options/clause-name replacement)
    replacement

    (let [target-name (lib.options/clause-name target)]
      (and target-name
           (= (lib.metadata.calculation/column-name-method query stage-number target)
              (lib.metadata.calculation/column-name query stage-number replacement))))
    (lib.options/with-clause-name replacement (lib.options/clause-name target))

    :else
    (with-unique-aggregation-name
      query stage-number replacement
      :except-uuid (lib.options/uuid target))))
