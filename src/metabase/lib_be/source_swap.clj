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

(mr/def ::swap-source.source
  [:map [:type [:enum :table :card]]
   [:id [:or ::lib.schema.id/table ::lib.schema.id/card]]])

(mr/def ::swap-source.source-error
  [:enum :database-mismatch
   :cycle-detected])

(mr/def ::swap-source.column-error
  [:enum :column-type-mismatch
   :missing-primary-key
   :extra-primary-key
   :missing-foreign-key
   :foreign-key-mismatch])

(mr/def ::swap-source.column-mapping
  [:map
   [:source {:optional true} ::lib.schema.metadata/column]
   [:target {:optional true} ::lib.schema.metadata/column]
   [:errors {:optional true} [:sequential ::swap-source.column-error]]])

(mr/def ::swap-source.field-id-mapping
  [:map-of ::lib.schema.id/field [:or ::lib.schema.id/field :string]])

(mu/defn- column-match-key :- :string
  [column :- ::lib.schema.metadata/column]
  (or (:lib/desired-column-alias column) (:name column)))

(mu/defn- column-errors :- [:sequential ::swap-source.column-error]
  [old-column :- ::lib.schema.metadata/column
   new-column :- ::lib.schema.metadata/column]
  (cond-> []
    (and new-column (not= (:effective-type old-column) (:effective-type new-column)))
    (conj :column-type-mismatch)

    (and new-column
         (= :type/PK (:semantic-type old-column))
         (not= :type/PK (:semantic-type new-column)))
    (conj :missing-primary-key)

    (and new-column
         (not= :type/PK (:semantic-type old-column))
         (= :type/PK (:semantic-type new-column)))
    (conj :extra-primary-key)

    (and new-column
         (= :type/FK (:semantic-type old-column))
         (not= :type/FK (:semantic-type new-column)))
    (conj :missing-foreign-key)

    (and new-column
         (= :type/FK (:semantic-type old-column))
         (= :type/FK (:semantic-type new-column))
         (not= (:fk-target-field-id old-column)
               (:fk-target-field-id new-column)))
    (conj :foreign-key-mismatch)))

(mu/defn check-column-mappings :- [:sequential ::swap-source.column-mapping]
  "Build column mappings between source and target query columns."
  [source-query :- ::lib.schema/query
   target-query :- ::lib.schema/query]
  (let [old-columns    (into [] (remove :remapped-from) (lib.metadata.calculation/returned-columns source-query))
        new-columns    (into [] (remove :remapped-from) (lib.metadata.calculation/returned-columns target-query))
        old-by-name    (m/index-by column-match-key old-columns)
        new-by-name    (m/index-by column-match-key new-columns)
        all-names      (distinct (concat (map column-match-key old-columns)
                                         (map column-match-key new-columns)))]
    (mapv (fn [column-name]
            (let [old-column (get old-by-name column-name)
                  new-column (get new-by-name column-name)
                  errors     (when (and old-column new-column)
                               (not-empty (column-errors old-column new-column)))]
              (cond-> {}
                old-column (assoc :source old-column)
                new-column (assoc :target new-column)
                errors     (assoc :errors errors))))
          all-names)))

(mu/defn- walk-clause-field-refs :- :any
  [clause :- :any
   f      :- fn?]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(mu/defn- should-upgrade-field-ref? :- :boolean
  [field-ref :- :mbql.clause/field]
  (and (some? (lib.ref/field-ref-id field-ref))
       (not (contains? (lib.options/options field-ref) :source-field))))

(mu/defn- upgrade-field-ref :- :mbql.clause/field
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field
   columns       :- [:sequential ::lib.schema.metadata/column]]
  (or (when (should-upgrade-field-ref? field-ref)
        (when-let [column (lib.equality/find-matching-column query stage-number field-ref columns)]
          ;; for inheried card columns, drop the :id to force a name-based field ref
          ;; preserve the expression name if this field ref is an identity expression
          (let [column (cond-> column (:lib/card-id column) (dissoc :id))
                expression-name (lib.util/expression-name field-ref)
                new-field-ref (cond-> (lib.ref/ref column)
                                expression-name (lib.expression/with-expression-name expression-name))]
            ;; only replace the ref if it becomes a name-based field ref
            (when-not (lib.ref/field-ref-id new-field-ref)
              new-field-ref))))
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

(mu/defn- table-only-stage? :- :boolean
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{:keys [source-table joins]} (lib.util/query-stage query stage-number)]
    (and (zero? stage-number)
         (some? source-table)
         (every? #(some? (:source-table %)) joins))))

(mu/defn- should-upgrade-field-refs-in-stage? :- :boolean
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)]
    (and (not (table-only-stage? query stage-number))
         (some? (lib.util.match/match-lite
                  stage
                  (field-ref :guard (every-pred lib.field/is-field-clause? should-upgrade-field-ref?))
                  field-ref)))))

(mu/defn should-upgrade-field-refs-in-query? :- :boolean
  "Check if any field refs in `query` can be upgraded to use name-based field refs."
  [query :- ::lib.schema/query]
  (boolean (some #(should-upgrade-field-refs-in-stage? query %)
                 (range (lib.query/stage-count query)))))

(mu/defn- parameter-target-stage-number :- [:maybe :int]
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (let [stage-number (lib.parameters/parameter-target-stage-number target)
        stage-count  (lib.query/stage-count query)]
    (when (and (>= stage-number -1) (< stage-number stage-count) (pos-int? stage-count))
      stage-number)))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when (lib.parameters/parameter-target-field-ref target)
        (when-let [stage-number (parameter-target-stage-number query target)]
          (let [columns (lib.metadata.calculation/visible-columns query stage-number)]
            (lib.parameters/update-parameter-target-field-ref
             target
             #(upgrade-field-ref query stage-number % columns)))))
      target))

(mu/defn should-upgrade-field-ref-in-parameter-target? :- :boolean
  "If the parameter target is a field ref, check if it can be upgraded to use a name-based field ref."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when-let [field-ref (lib.parameters/parameter-target-field-ref target)]
        (when-let [stage-number (parameter-target-stage-number query target)]
          (and (not (table-only-stage? query stage-number))
               (should-upgrade-field-ref? field-ref))))
      false))

(mu/defn- build-swap-field-id-mapping-for-table :- [:maybe ::swap-source.field-id-mapping]
  [query           :- ::lib.schema/query
   source-table-id :- ::lib.schema.id/table
   target-table-id :- ::lib.schema.id/table]
  (let [source-fields (lib.metadata/fields query source-table-id)
        target-fields (lib.metadata/fields query target-table-id)
        target-fields-by-name (m/index-by :name target-fields)]
    (not-empty (into {} (keep (fn [source-field]
                                (when-let [target-field (get target-fields-by-name (:name source-field))]
                                  [(:id source-field) (:id target-field)]))
                              source-fields)))))

(mu/defn- build-swap-field-id-mapping-for-card :- [:maybe ::swap-source.field-id-mapping]
  [query           :- ::lib.schema/query
   source-table-id :- ::lib.schema.id/table
   target-card-id  :- ::lib.schema.id/card]
  (let [source-fields (lib.metadata/fields query source-table-id)
        target-columns (lib.card/saved-question-metadata query target-card-id)
        target-columns-by-name (m/index-by :lib/desired-column-alias target-columns)]
    (not-empty (into {} (keep (fn [source-field]
                                (when-let [target-column (get target-columns-by-name (:name source-field))]
                                  [(:id source-field) (:lib/desired-column-alias target-column)]))
                              source-fields)))))

(mu/defn build-swap-field-id-mapping :- [:maybe ::swap-source.field-id-mapping]
  "Builds a mapping of field IDs of the source table to what should replace them in a field ref."
  [query      :- ::lib.schema/query
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (cond
    (and (= (:type old-source) :table) (= (:type new-source) :table))
    (build-swap-field-id-mapping-for-table query (:id old-source) (:id new-source))

    (and (= (:type old-source) :table) (= (:type new-source) :card))
    (build-swap-field-id-mapping-for-card query (:id old-source) (:id new-source))))

(mu/defn- swap-field-id-in-ref :- :mbql.clause/field
  [field-ref      :- :mbql.clause/field
   field-id-mapping :- ::swap-source.field-id-mapping]
  (let [field-id (lib.ref/field-ref-id field-ref)
        source-field-id (:source-field (lib.options/options field-ref))
        new-field-id-or-name (get field-id-mapping field-id)
        new-source-field-id-or-name (when source-field-id (get field-id-mapping source-field-id))]
    (cond-> field-ref
      (some? new-field-id-or-name)
      (lib.ref/update-field-ref-id-or-name new-field-id-or-name)

      (and (some? new-source-field-id-or-name) (pos-int? new-source-field-id-or-name))
      (lib.options/update-options assoc :source-field new-source-field-id-or-name))))

(mu/defn- swap-field-ids-in-clauses :- [:sequential :any]
  [clauses        :- [:sequential :any]
   field-id-mapping :- ::swap-source.field-id-mapping]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(swap-field-id-in-ref % field-id-mapping)))
             clauses))

(defn- swap-source-table-or-card
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
  [join           :- ::lib.schema.join/join
   source         :- ::swap-source.source
   target         :- ::swap-source.source
   field-id-mapping :- ::swap-source.field-id-mapping]
  (-> join
      (swap-source-table-or-card source target)
      (u/update-some :fields (fn [fields]
                               (if (keyword? fields)
                                 fields
                                 (swap-field-ids-in-clauses fields field-id-mapping))))
      (u/update-some :conditions swap-field-ids-in-clauses field-id-mapping)))

(mu/defn- swap-source-and-field-ids-in-joins :- [:sequential ::lib.schema.join/join]
  [joins          :- [:sequential ::lib.schema.join/join]
   source         :- ::swap-source.source
   target         :- ::swap-source.source
   field-id-mapping :- ::swap-source.field-id-mapping]
  (perf/mapv #(swap-source-and-field-ids-in-join % source target field-id-mapping) joins))

(mu/defn- swap-field-ids-in-stage :- ::lib.schema/stage
  [query          :- ::lib.schema/query
   stage-number   :- :int
   source         :- ::swap-source.source
   target         :- ::swap-source.source
   field-id-mapping :- ::swap-source.field-id-mapping]
  (let [stage (-> (lib.util/query-stage query stage-number)
                  (swap-source-table-or-card source target))]
    (if (some? field-id-mapping)
      (-> stage
          (u/update-some :fields      swap-field-ids-in-clauses field-id-mapping)
          (u/update-some :joins       swap-source-and-field-ids-in-joins source target field-id-mapping)
          (u/update-some :expressions swap-field-ids-in-clauses field-id-mapping)
          (u/update-some :filters     swap-field-ids-in-clauses field-id-mapping)
          (u/update-some :aggregation swap-field-ids-in-clauses field-id-mapping)
          (u/update-some :breakout    swap-field-ids-in-clauses field-id-mapping)
          (u/update-some :order-by    swap-field-ids-in-clauses field-id-mapping))
      stage)))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query          :- ::lib.schema/query
   source         :- ::swap-source.source
   target         :- ::swap-source.source
   field-id-mapping :- [:maybe ::swap-source.field-id-mapping]]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (swap-field-ids-in-stage query stage-number source target field-id-mapping))
                                           %))))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap its field ID using the provided mapping."
  [target         :- ::lib.schema.parameter/target
   field-id-mapping :- [:maybe ::swap-source.field-id-mapping]]
  (or (when (and (some? field-id-mapping)
                 (lib.parameters/parameter-target-field-ref target))
        (lib.parameters/update-parameter-target-field-ref
         target
         #(swap-field-id-in-ref % field-id-mapping)))
      target))