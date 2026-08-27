(ns metabase.lib.validate
  "Checks and validation for queries."
  (:require
   [metabase.lib.field :as lib.field]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(mu/defn missing-table-error :- [:ref ::lib.schema.validate/missing-table-error]
  "Create a missing-table lib validation error. The offending table is carried via the `:source-entity-*`
  keys, so this error has no `:name`."
  []
  {:type :missing-table})

(mu/defn missing-card-error :- [:ref ::lib.schema.validate/missing-card-error]
  "Create a missing-card lib validation error. The offending card is carried via the `:source-entity-*`
  keys, so this error has no `:name`."
  []
  {:type :missing-card})

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

(mu/defn- find-bad-source-refs :- [:set ::lib.schema.validate/error-with-source]
  "Returns errors for any stage (including join stages) whose `:source-table`/`:source-card` references an
   entity that no longer backs a valid query: a table that is missing or inactive (e.g. dropped from the
   warehouse and retired during sync), or a source card that has been deleted.

   The field-ref walk in [[find-bad-field-refs-with-source]] can't catch this: a `SELECT *`-style query has
   no `:field` clauses to inspect, and retiring a table doesn't deactivate its fields. So we resolve each
   stage source directly, reporting a `:missing-table`/`:missing-card` error carrying the offending entity as
   the source, so dependency analysis attributes the breakage to it.

   An inactive table is still returned by [[lib.metadata/table]] (it's fetched by id), so we catch it via the
   `:active` flag; a truly deleted table id makes [[lib.metadata/table]] throw, so we treat a throw as a
   deleted table and flag it too rather than letting it abort the analysis. A deleted source card resolves to
   nil via [[lib.metadata/card]] (and a throw is likewise treated as unresolvable); an *archived* card still
   resolves and can back a query, so it is not flagged."
  [query :- ::lib.schema/query]
  (let [mp          (lib.metadata/->metadata-provider query)
        bad-sources (volatile! #{})
        flag!       (fn [error entity-type entity-id]
                      (vswap! bad-sources conj
                              (assoc error
                                     :source-entity-type entity-type
                                     :source-entity-id   entity-id)))]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (when-let [table-id (:source-table stage)]
         (let [table (try
                       (lib.metadata/table mp table-id)
                       (catch #?(:clj Throwable :cljs :default) _
                         nil))]
           (when (or (nil? table) (not (:active table)))
             (flag! (missing-table-error) :table table-id))))
       (when-let [card-id (:source-card stage)]
         (when (nil? (try
                       (lib.metadata/card mp card-id)
                       (catch #?(:clj Throwable :cljs :default) _
                         nil)))
           (flag! (missing-card-error) :card card-id)))
       nil))
    @bad-sources))

(mu/defn- find-bad-field-refs-with-source :- [:set ::lib.schema.validate/error-with-source]
  "Returns source-annotated errors for any `:field` ref in the query that can't be resolved to an active
   column. See [[find-bad-refs-with-source]] for the shape of each error map."
  [query :- ::lib.schema/query]
  (let [bad-fields (volatile! #{})]
    (lib.walk/walk-clauses
     query
     (fn [query path-type path clause]
       (when (and (= path-type :lib.walk/stage)
                  (vector? clause)
                  (= (first clause) :field))
         (let [{:keys [query stage-number]} (lib.walk/query-for-path query path)
               column (lib.field.resolution/resolve-field-ref query stage-number clause)
               fields (lib.field/fields query stage-number)]
           (when (or (not column)
                     (::lib.field.resolution/fallback-metadata? column)
                     (not (:active column true)))
             (let [col-name (lib.metadata.calculation/column-name query stage-number column)
                   source   (extract-source-from-field-ref query stage-number clause)
                   error    (cond-> (missing-column-error col-name)
                              source                                          (merge source)
                              (and (not (:active column true))
                                   (seq fields)
                                   (perf/some #(identical? clause %) fields)) (assoc :soft? true))]
               (vswap! bad-fields conj error)))))
       nil))
    @bad-fields))

(mu/defn find-bad-refs-with-source :- [:set ::lib.schema.validate/error-with-source]
  "Like [[find-bad-refs]] but includes source entity information for each error.
   Returns a set of error maps, each containing:
   - `:type` - the error type (e.g., `:missing-column`)
   - `:name` - the column name (for missing-column errors)
   - `:source-entity-type` - optional, `:table` or `:card` if source could be determined
   - `:source-entity-id` - optional, the ID of the source entity
   - `:soft?` - optional, true when the ref could be dropped (eg. from a `:fields` list) without breaking the query

   Catches both unresolvable `:field` refs and stages whose `:source-table`/`:source-card` is missing or inactive."
  [query :- ::lib.schema/query]
  (into (find-bad-source-refs query)
        (find-bad-field-refs-with-source query)))

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
