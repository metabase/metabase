(ns metabase.lib-be.source-swap
  (:require
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.parameters :as lib.parameters]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance  :as perf]))

(mu/defn- walk-clause-field-refs :- :any
  [clause :- :any
   f      :- fn?]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(mu/defn- can-upgrade-field-ref? :- :boolean
  [field-ref :- :mbql.clause/field]
  ;; name-based field ref is already upgraded
  ;; implicitly joined field ref cannot be upgraded
  (not (or (lib.ref/field-ref-name field-ref)
           (contains? (lib.options/options field-ref) :source-field))))

(mu/defn- can-upgrade-field-refs-in-clause? :- :boolean
  [clause :- :any]
  (boolean (lib.util.match/match-lite clause
             (field-ref :guard (every-pred lib.field/is-field-clause? can-upgrade-field-ref?))
             true)))

(mu/defn- upgrade-field-ref :- :mbql.clause/field
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field
   columns       :- [:sequential ::lib.schema.metadata/column]]
  (or (when (can-upgrade-field-ref? field-ref)
        (when-let [column (lib.equality/find-matching-column query stage-number field-ref columns)]
          ;; for inheried card columns, drop the :id to force a name-based field ref
          ;; preserve the expression name if this field ref is an identity expression
          (let [column (cond-> column (:lib/card-id column) (dissoc :id))
                expression-name (lib.util/expression-name field-ref)]
            (cond-> (lib.ref/ref column)
              expression-name (lib.expression/with-expression-name expression-name)))))
      field-ref))

(mu/defn- upgrade-field-refs-in-clauses :- [:sequential :any]
  [query        :- ::lib.schema/query
   stage-number :- :int
   clauses      :- [:sequential :any]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(upgrade-field-ref query stage-number % columns)))
             clauses))

(mu/defn- upgrade-field-refs-in-join :- ::lib.schema.join/join
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (-> join
      (u/update-some :fields #(if (keyword? %) % (upgrade-field-refs-in-clauses query stage-number % columns)))
      (u/update-some :conditions #(upgrade-field-refs-in-clauses query stage-number % columns))))

(mu/defn- upgrade-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- [:sequential ::lib.schema.join/join]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (perf/mapv #(upgrade-field-refs-in-join query stage-number % columns) joins))

(mu/defn- upgrade-field-refs-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (when ((some-fn :fields :filters :expressions :aggregation :breakout :order-by :joins) stage)
                          (lib.metadata.calculation/visible-columns query stage-number))
        orderable-columns (if ((some-fn :aggregation :breakout) stage)
                            (lib.order-by/orderable-columns query stage-number)
                            visible-columns)]
    (-> stage
        (u/update-some :fields      #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :joins       #(upgrade-field-refs-in-joins query stage-number % visible-columns))
        (u/update-some :expressions #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :filters     #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :aggregation #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :breakout    #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :order-by    #(upgrade-field-refs-in-clauses query stage-number % orderable-columns)))))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query     :- ::lib.schema/query]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (upgrade-field-refs-in-stage query stage-number))
                                           %))))

(mu/defn can-upgrade-field-refs-in-query? :- :boolean
  "Check if any field refs in `query` can be upgraded to use name-based field refs."
  [query :- ::lib.schema/query]
  (can-upgrade-field-refs-in-clause? query))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when (lib.parameters/parameter-target-field-ref target)
        (let [stage-number (lib.parameters/parameter-target-stage-number target)
              stage-count  (lib.query/stage-count query)]
          (when (and (>= stage-number -1) (< stage-number stage-count) (pos-int? stage-count))
            (let [columns (lib.metadata.calculation/visible-columns query stage-number)]
              (lib.parameters/update-parameter-target-field-ref
               target
               #(upgrade-field-ref query stage-number % columns))))))
      target))

(mu/defn can-upgrade-field-ref-in-parameter-target? :- :boolean
  "If the parameter target is a field ref, check if it can be upgraded to use a name-based field ref."
  [target :- ::lib.schema.parameter/target]
  (if-let [field-ref (lib.parameters/parameter-target-field-ref target)]
    (can-upgrade-field-ref? field-ref)
    false))

(mr/def ::swap-source.source
  [:map [:type [:enum :table :card]]
   [:id [:or ::lib.schema.id/table ::lib.schema.id/card]]])

(mr/def ::swap-source.column-mapping
  [:map-of ::lib.schema.id/field [:or ::lib.schema.id/field :string]])

(mu/defn- build-swap-column-mapping-for-table :- [:maybe ::swap-source.column-mapping]
  "Builds a mapping of field IDs of the source table to field IDs of the target table."
  [query :- ::lib.schema/query
   source-table-id :- ::lib.schema.id/table
   target-table-id :- ::lib.schema.id/table]
  (let [source-fields (lib.metadata/fields query source-table-id)
        target-fields (lib.metadata/fields query target-table-id)
        target-fields-by-name (m/index-by :name target-fields)]
    (not-empty (into {} (keep (fn [source-field]
                                (when-let [target-field (get target-fields-by-name (:name source-field))]
                                  [(:id source-field) (:id target-field)]))
                              source-fields)))))

(mu/defn- build-swap-column-mapping-for-card :- [:maybe ::swap-source.column-mapping]
  "Builds a mapping of field IDs of the source table to desired column aliases of the target card."
  [query :- ::lib.schema/query
   source-table-id :- ::lib.schema.id/table
   target-card-id  :- ::lib.schema.id/card]
  (let [source-fields (lib.metadata/fields query source-table-id)
        target-columns (lib.card/saved-question-metadata query target-card-id)
        target-columns-by-name (m/index-by :lib/desired-column-alias target-columns)]
    (not-empty (into {} (keep (fn [source-field]
                                (when-let [target-column (get target-columns-by-name (:name source-field))]
                                  [(:id source-field) (:lib/desired-column-alias target-column)]))
                              source-fields)))))

(mu/defn build-swap-column-mapping :- [:maybe ::swap-source.column-mapping]
  "Builds a mapping of field IDs of the source table to what should replace them in a field ref."
  [query      :- ::lib.schema/query
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (cond
    (and (= (:type old-source) :table) (= (:type new-source) :table))
    (build-swap-column-mapping-for-table query (:id old-source) (:id new-source))

    (and (= (:type old-source) :table) (= (:type new-source) :card))
    (build-swap-column-mapping-for-card query (:id old-source) (:id new-source))))

(mu/defn- swap-field-id-in-ref :- :mbql.clause/field
  "If this field ref is field-id-based and there is a mapping for the field ID, 
  update the ref to use the target field ID or desired column alias."
  [field-ref        :- :mbql.clause/field
   column-mapping :- ::swap-source.column-mapping]
  (let [field-id (lib.ref/field-ref-id field-ref)
        source-field-id (:source-field (lib.options/options field-ref))
        new-field-id-or-name (get column-mapping field-id)
        new-source-field-id-or-name (when source-field-id (get column-mapping source-field-id))]
    (when (string? new-source-field-id-or-name)
      (throw (ex-info "Found an implicit join with a source field from the original table. It cannot be replaced with a card."
                      {:field-ref field-ref})))
    (cond-> field-ref
      (some? new-field-id-or-name)
      (lib.ref/update-field-ref-id-or-name new-field-id-or-name)

      (some? new-source-field-id-or-name)
      (lib.options/update-options assoc :source-field new-source-field-id-or-name))))

(mu/defn- swap-field-ids-in-clauses :- [:sequential :any]
  "Updates the field IDs in the clauses using the provided mapping."
  [clauses          :- [:sequential :any]
   column-mapping :- ::swap-source.column-mapping]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(swap-field-id-in-ref % column-mapping)))
             clauses))

(defn- swap-source-table-or-card
  "Updates the source table or card in the stage."
  [{:keys [source-table source-card], :as stage}
   source
   target]
  (if (or (and (= (:type source) :table) (= (:id source) source-table))
          (and (= (:type source) :card) (= (:id source) source-card)))
    (-> stage
        (dissoc :source-table :source-card)
        (assoc (case (:type target) :table :source-table :card :source-card) (:id target)))
    stage))

(mu/defn- swap-source-and-field-ids-in-join :- ::lib.schema.join/join
  "Updates the source table or card and field IDs in the join conditions using the provided mapping."
  [join             :- ::lib.schema.join/join
   source           :- ::swap-source.source
   target           :- ::swap-source.source
   column-mapping :- ::swap-source.column-mapping]
  (-> join
      (swap-source-table-or-card source target)
      (u/update-some :fields (fn [fields]
                               (if (keyword? fields)
                                 fields
                                 (swap-field-ids-in-clauses fields column-mapping))))
      (u/update-some :conditions swap-field-ids-in-clauses column-mapping)))

(mu/defn- swap-source-and-field-ids-in-joins :- [:sequential ::lib.schema.join/join]
  "Updates the field IDs in all joins using the provided mapping."
  [joins            :- [:sequential ::lib.schema.join/join]
   source           :- ::swap-source.source
   target           :- ::swap-source.source
   column-mapping :- ::swap-source.column-mapping]
  (mapv #(swap-source-and-field-ids-in-join % source target column-mapping) joins))

(mu/defn- swap-field-ids-in-stage :- ::lib.schema/stage
  "Updates the field IDs in the stage using the provided mapping."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   source           :- ::swap-source.source
   target           :- ::swap-source.source
   column-mapping :- ::swap-source.column-mapping]
  (let [stage (-> (lib.util/query-stage query stage-number)
                  (swap-source-table-or-card source target))]
    (if (some? column-mapping)
      (-> stage
          (u/update-some :fields      swap-field-ids-in-clauses column-mapping)
          (u/update-some :joins       swap-source-and-field-ids-in-joins source target column-mapping)
          (u/update-some :expressions swap-field-ids-in-clauses column-mapping)
          (u/update-some :filters     swap-field-ids-in-clauses column-mapping)
          (u/update-some :aggregation swap-field-ids-in-clauses column-mapping)
          (u/update-some :breakout    swap-field-ids-in-clauses column-mapping)
          (u/update-some :order-by    swap-field-ids-in-clauses column-mapping))
      stage)))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query            :- ::lib.schema/query
   source           :- ::swap-source.source
   target           :- ::swap-source.source
   column-mapping :- [:maybe ::swap-source.column-mapping]]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (swap-field-ids-in-stage query stage-number source target column-mapping))
                                           %))))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap its field ID using the provided mapping."
  [target           :- ::lib.schema.parameter/target
   column-mapping :- [:maybe ::swap-source.column-mapping]]
  (or (when (and (some? column-mapping)
                 (lib.parameters/parameter-target-field-ref target))
        (lib.parameters/update-parameter-target-field-ref
         target
         #(swap-field-id-in-ref % column-mapping)))
      target))