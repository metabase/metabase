(ns metabase.lib-be.source-swap
  (:require
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.field :as lib.field]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.parameters :as lib.parameters]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]))

(mr/def ::swap-source.source-type
  [:enum :table :card])

(mr/def ::swap-source.source-id
  [:or ::lib.schema.id/table ::lib.schema.id/card])

(mr/def ::swap-source.source
  [:map
   [:type ::swap-source.source-type]
   [:id ::swap-source.source-id]])

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

;;; ------------------------------------------------ column matching ---------------------------------------------------

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
    (conj :missing-foreign-key)))

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
    (perf/mapv (fn [column-name]
                 (let [old-column (get old-by-name column-name)
                       new-column (get new-by-name column-name)
                       errors     (when (and old-column new-column)
                                    (not-empty (column-errors old-column new-column)))]
                   (cond-> {}
                     old-column (assoc :source old-column)
                     new-column (assoc :target new-column)
                     errors     (assoc :errors errors))))
               all-names)))

;;; ------------------------------------------------ upgrade-field-refs ------------------------------------------------

(mu/defn- same-field-ref? :- :boolean
  [field-ref-1 :- :mbql.clause/field
   field-ref-2 :- :mbql.clause/field]
  (= (lib.options/update-options field-ref-1 dissoc :lib/uuid :base-type :effective-type)
     (lib.options/update-options field-ref-2 dissoc :lib/uuid :base-type :effective-type)))

(mu/defn- walk-clause-field-refs :- :any
  [clause :- :any
   f      :- fn?]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(mu/defn- preserve-field-ref-options :- :mbql.clause/field
  "Copy options from `old-field-ref` that should be preserved to `new-field-ref`."
  [old-field-ref :- :mbql.clause/field
   new-field-ref :- :mbql.clause/field]
  (let [expression-name (lib.util/expression-name old-field-ref)]
    (cond-> new-field-ref
      expression-name
      (lib.options/update-options assoc :lib/expression-name expression-name))))

(mu/defn- upgrade-field-ref :- :mbql.clause/field
  "Upgrade a field ref for a non-implicitly joinable column to use a string-based field ref."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field]
  (or (when-let [column (lib.field.resolution/resolve-field-ref query stage-number field-ref)]
        (when-not (::lib.field.resolution/fallback-metadata? column)
          (let [column (cond-> column
                         (not (:fk-field-id column)) (dissoc :id))
                new-field-ref (preserve-field-ref-options field-ref (lib.ref/ref column))]
            (when-not (same-field-ref? field-ref new-field-ref)
              new-field-ref))))
      field-ref))

(mu/defn- upgrade-field-refs-in-clauses :- [:sequential :any]
  [query        :- ::lib.schema/query
   stage-number :- :int
   clauses      :- [:sequential :any]]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(upgrade-field-ref query stage-number %)))
             clauses))

(mu/defn- upgrade-field-refs-in-join :- ::lib.schema.join/join
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  (-> join
      (u/update-some :fields #(if (keyword? %) % (upgrade-field-refs-in-clauses query stage-number %)))
      (u/update-some :conditions #(upgrade-field-refs-in-clauses query stage-number %))))

(mu/defn- upgrade-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- [:sequential ::lib.schema.join/join]]
  (perf/mapv #(upgrade-field-refs-in-join query stage-number %) joins))

(mu/defn- upgrade-field-refs-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)]
    (-> stage
        (u/update-some :fields      #(upgrade-field-refs-in-clauses query stage-number %))
        (u/update-some :joins       #(upgrade-field-refs-in-joins query stage-number %))
        (u/update-some :expressions #(upgrade-field-refs-in-clauses query stage-number %))
        (u/update-some :filters     #(upgrade-field-refs-in-clauses query stage-number %))
        (u/update-some :aggregation #(upgrade-field-refs-in-clauses query stage-number %))
        (u/update-some :breakout    #(upgrade-field-refs-in-clauses query stage-number %))
        (u/update-some :order-by    #(upgrade-field-refs-in-clauses query stage-number %)))))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query     :- ::lib.schema/query]
  (update query :stages
          (fn [stages]
            (into []
                  (map-indexed (fn [stage-number _]
                                 (upgrade-field-refs-in-stage query stage-number)))
                  stages))))

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
  (let [result (or (when (lib.parameters/parameter-target-field-ref target)
                     (when-let [stage-number (parameter-target-stage-number query target)]
                       (lib.parameters/update-parameter-target-field-ref
                        target
                        #(upgrade-field-ref query stage-number %))))
                   target)]
    (log/warnf "upgrade-field-ref-in-parameter-target\nbefore: %s\nafter:  %s" (pr-str target) (pr-str result))
    result))

;;; ------------------------------------------------ swap-source -------------------------------------------------------

(mr/def ::swap-source.field-id-mapping
  [:map-of ::lib.schema.id/field ::lib.schema.id/field])

(mu/defn- build-field-id-mapping :- ::swap-source.field-id-mapping
  [query                                      :- ::lib.schema/query
   {old-source-id :id, old-source-type :type} :- ::swap-source.source
   {new-source-id :id, new-source-type :type} :- ::swap-source.source]
  (let [source-fields (fn [source-type source-id]
                        (case source-type
                          :table (lib.metadata/fields query source-id)
                          :card  (lib.card/saved-question-metadata query source-id)))
        old-fields       (source-fields old-source-type old-source-id)
        new-fields       (source-fields new-source-type new-source-id)
        new-field-by-key (m/index-by column-match-key new-fields)]
    (into {}
          (keep (fn [old-field]
                  (when-let [new-field (get new-field-by-key (column-match-key old-field))]
                    (let [old-field-id (:id old-field)
                          new-field-id (:id new-field)]
                      (when (and (some? old-field-id) (some? new-field-id))
                        [old-field-id new-field-id])))))
          old-fields)))

(mu/defn- swap-source-table-or-card :- ::lib.schema/stage
  [{:keys [source-table source-card], :as stage} :- ::lib.schema/stage
   old-source                                    :- ::swap-source.source
   new-source                                    :- ::swap-source.source]
  (if (or (and (= (:type old-source) :table) (= (:id old-source) source-table))
          (and (= (:type old-source) :card) (= (:id old-source) source-card)))
    (-> stage
        (dissoc :source-table :source-card)
        (assoc (case (:type new-source) :table :source-table :card :source-card) (:id new-source)))
    stage))

(mu/defn- swap-source-table-or-card-in-stage :- ::lib.schema/stage
  [stage      :- ::lib.schema/stage
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (-> (swap-source-table-or-card stage old-source new-source)
      (u/update-some :joins
                     (fn [joins]
                       (perf/mapv (fn [join]
                                    (u/update-some join :stages
                                                   (fn [stages]
                                                     (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))
                                  joins)))))

(mu/defn- swap-source-table-or-card-in-query :- ::lib.schema/query
  [query      :- ::lib.schema/query
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (update query :stages (fn [stages] (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))

(mu/defn- swap-field-ref :- :mbql.clause/field
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::swap-source.field-id-mapping
   field-ref        :- :mbql.clause/field]
  (let [old-source-field-id (-> field-ref lib.options/options :source-field)
        new-source-field-id (when old-source-field-id (get field-id-mapping old-source-field-id))
        swapped-field-ref   (cond-> field-ref
                              new-source-field-id
                              (lib.options/update-options assoc :source-field new-source-field-id))]
    (or (when-let [new-column (lib.field.resolution/resolve-field-ref query stage-number swapped-field-ref)]
          (when-not (::lib.field.resolution/fallback-metadata? new-column)
            (let [new-field-ref (preserve-field-ref-options field-ref (lib.ref/ref new-column))]
              (when-not (same-field-ref? field-ref new-field-ref)
                new-field-ref))))
        swapped-field-ref)))

(mu/defn- swap-field-refs-in-clauses :- [:sequential :any]
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::swap-source.field-id-mapping
   clauses          :- [:sequential :any]]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(swap-field-ref query stage-number field-id-mapping %)))
             clauses))

(mu/defn- swap-field-refs-in-join :- ::lib.schema.join/join
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::swap-source.field-id-mapping
   join             :- ::lib.schema.join/join]
  (-> join
      (u/update-some :fields (fn [fields]
                               (if (keyword? fields)
                                 fields
                                 (swap-field-refs-in-clauses query stage-number field-id-mapping fields))))
      (u/update-some :conditions #(swap-field-refs-in-clauses query stage-number field-id-mapping %))))

(mu/defn- swap-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::swap-source.field-id-mapping
   joins            :- [:sequential ::lib.schema.join/join]]
  (perf/mapv #(swap-field-refs-in-join query stage-number field-id-mapping %) joins))

(mu/defn- swap-field-refs-in-stage :- ::lib.schema/stage
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::swap-source.field-id-mapping]
  (-> (lib.util/query-stage query stage-number)
      (u/update-some :fields      #(swap-field-refs-in-clauses query stage-number field-id-mapping %))
      (u/update-some :joins       #(swap-field-refs-in-joins query stage-number field-id-mapping %))
      (u/update-some :expressions #(swap-field-refs-in-clauses query stage-number field-id-mapping %))
      (u/update-some :filters     #(swap-field-refs-in-clauses query stage-number field-id-mapping %))
      (u/update-some :aggregation #(swap-field-refs-in-clauses query stage-number field-id-mapping %))
      (u/update-some :breakout    #(swap-field-refs-in-clauses query stage-number field-id-mapping %))
      (u/update-some :order-by    #(swap-field-refs-in-clauses query stage-number field-id-mapping %))))

(mu/defn- swap-field-refs-in-query :- ::lib.schema/query
  [query            :- ::lib.schema/query
   field-id-mapping :- ::swap-source.field-id-mapping]
  (u/update-some query :stages
                 (fn [stages]
                   (into []
                         (map-indexed (fn [stage-number _]
                                        (swap-field-refs-in-stage query stage-number field-id-mapping)))
                         stages))))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (swap-field-refs-in-query (swap-source-table-or-card-in-query query old-source new-source)
                            (build-field-id-mapping query old-source new-source)))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [query      :- ::lib.schema/query
   target     :- ::lib.schema.parameter/target
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (or (when (lib.parameters/parameter-target-field-ref target)
        (when-let [stage-number (parameter-target-stage-number query target)]
          (lib.parameters/update-parameter-target-field-ref
           target
           #(swap-field-ref query stage-number (build-field-id-mapping query old-source new-source) %))))
      target))
