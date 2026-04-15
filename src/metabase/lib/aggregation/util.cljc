(ns metabase.lib.aggregation.util
  "Helpers shared by the various parts of the lib that need to assign unique `:name`s to aggregation clauses."
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util.malli :as mu]))

(mu/defn- clause-name :- [:maybe :string]
  "Get the `:name` from the options of an aggregation clause."
  [a-clause :- ::lib.schema.expression/expression]
  (:name (lib.options/options a-clause)))

(mu/defn- with-clause-name :- ::lib.schema.expression/expression
  "Set the `:name` in the options of an aggregation clause."
  [a-clause :- ::lib.schema.expression/expression
   a-name   :- :string]
  (lib.options/update-options a-clause assoc :name a-name))

(mu/defn- aggregation-column-names :- [:sequential :string]
  "Compute the ordered list of deduplicated effective column names for the aggregations currently in `stage-number`
  of `query`."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [generator (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
    (into []
          (comp (map #(lib.metadata.calculation/column-name query stage-number %))
                (map generator))
          (:aggregation (lib.util/query-stage query stage-number)))))

(mu/defn with-unique-aggregation-name :- ::lib.schema.expression/expression
  "Set a unique `:name` on the aggregation `a-clause` that is derived from its effective column name (its existing
  `:name` option if set, otherwise the computed `column-name-method` — e.g. `sum`, `count`, `avg`) and deduplicated
  against the effective column names of the existing aggregations on `stage-number`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   a-clause     :- ::lib.schema.expression/expression]
  (with-clause-name
    a-clause
    (lib.util/unique-indexed-name
     (set (aggregation-column-names query stage-number))
     (lib.metadata.calculation/column-name query stage-number a-clause))))

(mu/defn with-unique-aggregation-name-after-replacement :- ::lib.schema.expression/expression
  "When replacing an aggregation, decide what `:name` the replacement clause should carry.

    * If the replacement already has `:name` set, use it as-is.
    * Otherwise, if the target had `:name` and the two clauses compute the same column name (ignoring `:name` on the
      target), preserve the target's `:name` on the replacement so refs from later stages stay valid.
    * Otherwise return the replacement unchanged — we deliberately don't regenerate a unique name here since that
      would silently rewrite unrelated references when the aggregation shape changes."
  [query        :- ::lib.schema/query
   stage-number :- :int
   target       :- ::lib.schema.expression/expression
   replacement  :- ::lib.schema.expression/expression]
  (let [target-name (clause-name target)]
    (cond
      (clause-name replacement)
      replacement

      (and target-name
           (= (lib.metadata.calculation/column-name-method query stage-number target)
              (lib.metadata.calculation/column-name query stage-number replacement)))
      (with-clause-name replacement target-name)

      :else
      replacement)))
