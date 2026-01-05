(ns metabase.lib.validate
  "Checks and validation for queries."
  (:require
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn missing-column-error :- [:ref ::lib.schema.validate/missing-column-error]
  "Create a missing-column lib validation error"
  [col-name :- :string]
  {:type :validate/missing-column-error
   :name col-name})

(mu/defn missing-table-alias-error :- [:ref ::lib.schema.validate/missing-table-alias-error]
  "Create a missing-table-alias lib validation error"
  [alias-name :- :string]
  {:type :validate/missing-table-alias-error
   :name alias-name})

(mu/defn duplicate-column-error :- [:ref ::lib.schema.validate/duplicate-column-error]
  "Create a duplicate-column lib validation error"
  [col-name :- :string]
  {:type :validate/duplicate-column-error
   :name col-name})

(mu/defn syntax-error :- [:ref ::lib.schema.validate/syntax-error]
  "Create a syntax-error lib validation error"
  []
  {:type :validate/syntax-error})

(mu/defn validation-error :- [:ref ::lib.schema.validate/validation-error]
  "Create a validation-error lib validation error"
  [message :- :string]
  {:type :validate/validation-error
   :message message})

(mu/defn find-bad-refs :- [:set [:ref ::lib.schema.validate/error]]
  "Returns a list of bad `:field` refs on this query.

  Returns nil if all refs on the query are sound, that is if they can be resolved to a column from some source."
  [query :- ::lib.schema/query]
  (let [bad-fields (volatile! #{})]
    (lib.walk/walk-clauses
     query
     (fn [query path-type path clause]
       (when (and (= path-type :lib.walk/stage)
                  (vector? clause)
                  (= (first clause) :field))
         (let [column (lib.walk/apply-f-for-stage-at-path
                       lib.field.resolution/resolve-field-ref
                       query path clause)]
           (when (or (not column)
                     (::lib.field.resolution/fallback-metadata? column)
                     (not (:active column true)))
             (vswap! bad-fields conj (missing-column-error
                                      (lib.metadata.calculation/column-name query (second path) column))))))
       nil))
    @bad-fields))

(comment
  (require '[metabase.lib.core :as lib])
  (require '[metabase.lib.test-metadata :as meta])
  (let [base             (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                             (lib/breakout (meta/field-metadata :orders :quantity))
                             (lib/aggregate (lib/count))
                             lib/append-stage)
        [_category cnt] (lib/visible-columns base)
        query            (lib/filter base (lib/> cnt 100))]
    {:valid-query (find-bad-refs query)
     :bad-query   (find-bad-refs (assoc-in query [:stages 1 :filters 0 2 2] "n"))}))
