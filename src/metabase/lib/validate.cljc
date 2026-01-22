(ns metabase.lib.validate
  "Checks and validation for queries."
  (:require
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn missing-column-error :- [:ref ::lib.schema.validate/missing-column-error]
  "Create a missing-column lib validation error"
  [col-name :- :string]
  {:type :missing-column
   :name col-name})

(mu/defn missing-table-alias-error :- [:ref ::lib.schema.validate/missing-table-alias-error]
  "Create a missing-table-alias lib validation error"
  [alias-name :- :string]
  {:type :missing-table-alias
   :name alias-name})

(mu/defn duplicate-column-error :- [:ref ::lib.schema.validate/duplicate-column-error]
  "Create a duplicate-column lib validation error"
  [col-name :- :string]
  {:type :duplicate-column
   :name col-name})

(mu/defn syntax-error :- [:ref ::lib.schema.validate/syntax-error]
  "Create a syntax-error lib validation error"
  []
  {:type :syntax-error})

(mu/defn validation-exception-error :- [:ref ::lib.schema.validate/validation-exception-error]
  "Create a validation-exception-error lib validation error"
  [message :- :string]
  {:type :validation-exception-error
   :message message})

(defn- extract-source-from-field-ref
  "Extract the source entity (table or card) for a field ref.
   Returns `{:source-entity-type :table/:card, :source-entity-id <id>}` or `nil`.

   Rules (from the spec):
   1. If `:source-field` present → find the field's table
   2. If `:join-alias` present → find the join's source table/card
   3. If it's the first stage → use main source-table or source-card
   4. Otherwise → references previous stage column, no source"
  [query stage-number field-ref]
  (let [[_tag {:keys [source-field join-alias]} _id-or-name] field-ref
        stage (lib.util/query-stage query stage-number)]
    (cond
      ;; Case 1: :source-field present - find the field's table via implicit join
      source-field
      (when-let [field-metadata (lib.metadata/field query source-field)]
        (when-let [table-id (:table-id field-metadata)]
          {:source-entity-type :table
           :source-entity-id   table-id}))

      ;; Case 2: :join-alias present - find the join's source table/card
      join-alias
      (when-let [join (lib.join/maybe-resolve-join query stage-number join-alias)]
        (let [first-join-stage (first (:stages join))]
          (cond
            (:source-table first-join-stage)
            {:source-entity-type :table
             :source-entity-id   (:source-table first-join-stage)}

            (:source-card first-join-stage)
            {:source-entity-type :card
             :source-entity-id   (:source-card first-join-stage)})))

      ;; Case 3: First stage - use main source-table or source-card
      (zero? stage-number)
      (cond
        (:source-table stage)
        {:source-entity-type :table
         :source-entity-id   (:source-table stage)}

        (:source-card stage)
        {:source-entity-type :card
         :source-entity-id   (:source-card stage)})

      ;; Case 4: References previous stage column - no source
      :else nil)))

(mu/defn find-bad-refs :- [:set [:ref ::lib.schema.validate/error]]
  "Returns a set of validation errors in this query.

  Returns empty set if all refs on the query are sound, that is if they can be resolved to a column from some source."
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

(mu/defn find-bad-refs-with-source :- [:set ::lib.schema.validate/error-with-source]
  "Like [[find-bad-refs]] but includes source entity information for each error.
   Returns a set of error maps, each containing:
   - `:type` - the error type (e.g., `:missing-column`)
   - `:name` - the column name (for missing-column errors)
   - `:source-entity-type` - optional, `:table` or `:card` if source could be determined
   - `:source-entity-id` - optional, the ID of the source entity"
  [query :- ::lib.schema/query]
  (let [bad-fields (volatile! #{})]
    (lib.walk/walk-clauses
     query
     (fn [query path-type path clause]
       (when (and (= path-type :lib.walk/stage)
                  (vector? clause)
                  (= (first clause) :field))
         (let [{:keys [query stage-number]} (lib.walk/query-for-path query path)
               column (lib.field.resolution/resolve-field-ref query stage-number clause)]
           (when (or (not column)
                     (::lib.field.resolution/fallback-metadata? column)
                     (not (:active column true)))
             (let [col-name (lib.metadata.calculation/column-name query stage-number column)
                   source   (extract-source-from-field-ref query stage-number clause)
                   error    (cond-> (missing-column-error col-name)
                              source (merge source))]
               (vswap! bad-fields conj error)))))
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
