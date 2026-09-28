(ns metabase.source-swap.mbql
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.source-swap.schema :as source-swap.schema]
   [metabase.source-swap.util :as source-swap.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(mu/defn- preserve-expression-name :- ::lib.schema.ref/ref
  "Copy the expression name from `old-field-ref` to `new-field-ref`."
  [old-ref :- ::lib.schema.ref/ref
   new-ref :- ::lib.schema.ref/ref]
  (let [expression-name (lib.util/expression-name old-ref)]
    (cond-> new-ref
      expression-name
      (lib.options/update-options assoc :lib/expression-name expression-name))))

(defn- resolved-field-ref
  [query stage-number original-ref candidate-ref]
  (or (when-let [column (lib.field.resolution/resolve-field-ref query stage-number candidate-ref)]
        (when-not (::lib.field.resolution/fallback-metadata? column)
          (let [new-ref (preserve-expression-name original-ref (lib.ref/ref column))]
            (when-not (= (lib.schema.util/mbql-clause-distinct-key original-ref)
                         (lib.schema.util/mbql-clause-distinct-key new-ref))
              new-ref))))
      original-ref))

(mu/defn upgrade-field-ref :- ::lib.schema.ref/ref
  "Resolve a field ref to its column's current ref, preserving expression names and unresolved refs."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (resolved-field-ref query stage-number field-ref field-ref))

(defn- map-field-refs-in-clauses
  [f distinct? clauses]
  (if (keyword? clauses)
    clauses
    (into []
          (cond-> (map #(lib.walk/walk-clause % (fn [clause]
                                                  (cond-> clause (lib.util/field-clause? clause) f))))
            distinct? (comp (m/distinct-by lib.schema.util/mbql-clause-distinct-key)))
          clauses)))

(defn- map-field-refs-in-stage
  [stage f]
  (-> (reduce (fn [stage [k distinct?]]
                (m/update-existing stage k #(map-field-refs-in-clauses f distinct? %)))
              stage
              [[:fields true] [:expressions false] [:filters false]
               [:aggregation false] [:breakout true] [:order-by true]])
      (m/update-existing :joins
                         (fn [joins]
                           (mapv #(-> %
                                      (m/update-existing :fields (partial map-field-refs-in-clauses f true))
                                      (m/update-existing :conditions (partial map-field-refs-in-clauses f false)))
                                 joins)))))

(defn- map-field-refs-in-query
  [query f]
  (update query :stages
          #(into [] (map-indexed (fn [stage-number stage]
                                   (map-field-refs-in-stage stage (partial f query stage-number)))) %)))

(mu/defn upgrade-field-refs-in-mbql-stages :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query :- ::lib.schema/query]
  (map-field-refs-in-query query upgrade-field-ref))

(mu/defn- parameter-target-stage-number :- [:maybe :int]
  "Gets the stage number from the parameter target, if it exists and is valid."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (let [stage-number (lib/parameter-target-stage-number target)
        stage-count  (lib/stage-count query)]
    (when (and (>= stage-number -1) (< stage-number stage-count) (pos-int? stage-count))
      stage-number)))

(mu/defn upgrade-field-ref-in-parameter-mbql-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when (lib/parameter-target-field-ref target)
        (when-let [stage-number (parameter-target-stage-number query target)]
          (lib/update-parameter-target-field-ref
           target
           #(upgrade-field-ref query stage-number %))))
      target))

;;; ------------------------------------------------ swap-source -------------------------------------------------------

(mu/defn- swap-source-table-or-card :- ::lib.schema/stage
  "Swaps the source table or card in a stage if the stage uses the old source."
  [{:keys [source-table source-card], :as stage} :- ::lib.schema/stage
   [old-type old-id]                             :- ::source-swap.schema/source
   [new-type new-id]                             :- ::source-swap.schema/source]
  (if (or (and (= old-type :table) (= old-id source-table))
          (and (= old-type :card) (= old-id source-card)))
    (-> stage
        (dissoc :source-table :source-card)
        (assoc (case new-type :table :source-table :card :source-card) new-id))
    stage))

(mu/defn- swap-source-table-or-card-in-stage :- ::lib.schema/stage
  "Swaps the source table or card in a stage."
  [stage      :- ::lib.schema/stage
   old-source :- ::source-swap.schema/source
   new-source :- ::source-swap.schema/source]
  (-> (swap-source-table-or-card stage old-source new-source)
      (m/update-existing :joins
                         (fn [joins]
                           (perf/mapv (fn [join]
                                        (m/update-existing join :stages
                                                           (fn [stages]
                                                             (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))
                                      joins)))))

(mu/defn- swap-source-table-or-card-in-query :- ::lib.schema/query
  "Swaps the source table or card in a query."
  [query      :- ::lib.schema/query
   old-source :- ::source-swap.schema/source
   new-source :- ::source-swap.schema/source]
  (update query :stages (fn [stages] (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))

(mr/def ::field-id-mapping
  [:map-of ::lib.schema.id/field ::lib.schema.metadata/column])

(mu/defn- build-field-id-mapping :- ::field-id-mapping
  "Builds a mapping of old field IDs to new columns."
  [query      :- ::lib.schema/query
   old-source :- ::source-swap.schema/source
   new-source :- ::source-swap.schema/source]
  (let [old-columns       (source-swap.util/source-columns query old-source)
        new-columns       (source-swap.util/source-columns query new-source)
        new-column-by-key (m/index-by source-swap.util/column-match-key new-columns)]
    (into {}
          (keep (fn [old-column]
                  (when-let [new-column (get new-column-by-key (source-swap.util/column-match-key old-column))]
                    (when (:id old-column)
                      [(:id old-column) new-column]))))
          old-columns)))

(mu/defn- swap-field-ref :- ::lib.schema.ref/ref
  "Resolve a ref against swapped sources, remapping column IDs and implicit-join :source-field IDs.
   Input should already use aliases where possible. Unresolved refs and expression names are preserved."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::field-id-mapping
   field-ref        :- :mbql.clause/field]
  (let [old-id            (lib.ref/field-ref-id field-ref)
        new-id-column     (get field-id-mapping old-id)
        old-fk-id         (-> field-ref lib.options/options :source-field)
        new-fk-id-column  (get field-id-mapping old-fk-id)
        swapped-field-ref (cond-> field-ref
                            ;; base-type is required for name-based refs, make sure it's set
                            ;; don't use the column name for implicit joins or [[resolve-field-ref]] won't resolve it
                            (and new-id-column (not old-fk-id))
                            (-> (lib.options/update-options assoc :base-type (:base-type new-id-column))
                                (lib.ref/with-field-ref-name (source-swap.util/column-match-key new-id-column)))

                            ;; implicit joins FK table field ID
                            (and new-fk-id-column (:id new-fk-id-column))
                            (lib.options/update-options assoc :source-field (:id new-fk-id-column)))]
    (resolved-field-ref query stage-number field-ref swapped-field-ref)))

(mu/defn swap-source-in-mbql-stages :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::source-swap.schema/source
   new-source :- ::source-swap.schema/source]
  (let [field-id-mapping (build-field-id-mapping query old-source new-source)]
    (map-field-refs-in-query (swap-source-table-or-card-in-query query old-source new-source)
                             #(swap-field-ref %1 %2 field-id-mapping %3))))

(mu/defn swap-source-in-parameter-mbql-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [query      :- ::lib.schema/query
   target     :- ::lib.schema.parameter/target
   old-source :- ::source-swap.schema/source
   new-source :- ::source-swap.schema/source]
  (or (when (lib/parameter-target-field-ref target)
        (when-let [stage-number (parameter-target-stage-number query target)]
          (let [new-query (swap-source-table-or-card-in-query query old-source new-source)
                field-id-mapping (build-field-id-mapping query old-source new-source)]
            (lib/update-parameter-target-field-ref
             target
             #(swap-field-ref new-query stage-number field-id-mapping %)))))
      target))
