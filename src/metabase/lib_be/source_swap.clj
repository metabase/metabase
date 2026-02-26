(ns metabase.lib-be.source-swap
  (:require
   [medley.core :as m]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
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
   [metabase.util.performance :as perf]))

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

(mu/defn- field-id-ref? :- :boolean
  [field-ref :- :mbql.clause/field]
  (some? (lib.ref/field-ref-id field-ref)))

;;; ------------------------------------------------ upgrade-field-refs ------------------------------------------------

(mu/defn- upgrade-field-ref :- :mbql.clause/field
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field
   columns       :- [:sequential ::lib.schema.metadata/column]]
  (or (when-let [column (lib.equality/find-matching-column query stage-number field-ref columns)]
          ;; TODO (Alex P 2/26/26) -- drop the :lib/card-id hack when Braden fixes join refs
        (let [column (cond-> column (:lib/card-id column) (dissoc :id))
              expression-name (lib.util/expression-name field-ref)
              new-field-ref (cond-> (lib.ref/ref column)
                              expression-name (lib.expression/with-expression-name expression-name))]
          (when (or (not= (lib.ref/field-ref-id field-ref) (lib.ref/field-ref-id new-field-ref))
                    (not= (lib.ref/field-ref-name field-ref) (lib.ref/field-ref-name new-field-ref)))
            new-field-ref)))
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

(mu/defn- maybe-visible-columns :- [:sequential ::lib.schema.metadata/column]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)]
    (if ((some-fn :fields :filters :expressions :aggregation :breakout :order-by :joins) stage)
      (lib.metadata.calculation/visible-columns query stage-number)
      [])))

(mu/defn- maybe-orderable-columns :- [:sequential ::lib.schema.metadata/column]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   visible-columns :- [:sequential ::lib.schema.metadata/column]]
  (let [stage (lib.util/query-stage query stage-number)]
    (if ((some-fn :aggregation :breakout) stage)
      (lib.order-by/orderable-columns query stage-number)
      visible-columns)))

(mu/defn- upgrade-field-refs-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (maybe-visible-columns query stage-number)
        orderable-columns (maybe-orderable-columns query stage-number visible-columns)]
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

;;; ------------------------------------------------ should-upgrade? ---------------------------------------------------

(mu/defn- field-id-ref-stage? :- :boolean
  [{:keys [source-table joins]} :- ::lib.schema/stage]
  (and (some? source-table)
       (every? (fn [{:keys [stages]}]
                 (and (= 1 (count stages))
                      (field-id-ref-stage? (first stages))))
               joins)))

(mu/defn- should-upgrade-field-refs-in-stage? :- :boolean
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)]
    (not (and (field-id-ref-stage? stage)
              (nil? (lib.util.match/match-lite
                      stage
                      (field-ref :guard lib.field/is-field-clause?)
                      (when-not (field-id-ref? field-ref) field-ref)))))))

(mu/defn should-upgrade-field-refs-in-query? :- :boolean
  "Check if any field refs in `query` can be upgraded to use name-based field refs."
  [query :- ::lib.schema/query]
  (boolean (some #(should-upgrade-field-refs-in-stage? query %)
                 (range (lib.query/stage-count query)))))

;;; ------------------------------------------------ parameter targets -------------------------------------------------

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
          (let [stage (lib.util/query-stage query stage-number)]
            (not (and (field-id-ref-stage? stage)
                      (field-id-ref? field-ref))))))
      false))

;;; ------------------------------------------------ swap-source -------------------------------------------------------

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
  [stage  :- ::lib.schema/stage
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
  [query :- ::lib.schema/query
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (update query :stages (fn [stages] (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))

(mr/def ::swap-field-ref.options
  [:map
   [:old-query ::lib.schema/query]
   [:stage-number :int]
   [:old-columns [:sequential ::lib.schema.metadata/column]]
   [:new-column-by-key [:map-of :string ::lib.schema.metadata/column]]])

(mu/defn- swap-field-ref :- :mbql.clause/field
  [field-ref :- :mbql.clause/field
   {:keys [old-query stage-number old-columns new-column-by-key]} :- ::swap-field-ref.options]
  (or (when-let [old-column (lib.equality/find-matching-column old-query stage-number field-ref old-columns)]
        (when-let [new-column (get new-column-by-key (column-match-key old-column))]
          (let [new-field-ref (lib.ref/ref new-column)]
            (when (or (not= (lib.ref/field-ref-id field-ref) (lib.ref/field-ref-id new-field-ref))
                      (not= (lib.ref/field-ref-name field-ref) (lib.ref/field-ref-name new-field-ref)))
              new-field-ref))))
      field-ref))

(mu/defn- swap-field-refs-in-clauses :- [:sequential :any]
  [clauses :- [:sequential :any]
   options :- ::swap-field-ref.options]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(swap-field-ref % options)))
             clauses))

(mu/defn- swap-field-refs-in-join :- ::lib.schema.join/join
  [join    :- ::lib.schema.join/join
   options :- ::swap-field-ref.options]
  (-> join
      (u/update-some :fields (fn [fields]
                               (if (keyword? fields)
                                 fields
                                 (swap-field-refs-in-clauses fields options))))
      (u/update-some :conditions #(swap-field-refs-in-clauses % options))))

(mu/defn- swap-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [joins   :- [:sequential ::lib.schema.join/join]
   options :- ::swap-field-ref.options]
  (perf/mapv #(swap-field-refs-in-join % options) joins))

(mu/defn- swap-field-refs-in-stage :- ::lib.schema/stage
  [old-query    :- ::lib.schema/query
   new-query    :- ::lib.schema/query
   stage-number :- :int]
  (let [old-columns        (maybe-visible-columns old-query stage-number)
        new-columns        (maybe-visible-columns new-query stage-number)
        new-columns-by-key (m/index-by column-match-key new-columns)
        options            {:old-query         old-query
                            :stage-number      stage-number
                            :old-columns       old-columns
                            :new-column-by-key new-columns-by-key}]
    (-> (lib.util/query-stage new-query stage-number)
        (u/update-some :fields      #(swap-field-refs-in-clauses % options))
        (u/update-some :joins       #(swap-field-refs-in-joins % options))
        (u/update-some :expressions #(swap-field-refs-in-clauses % options))
        (u/update-some :filters     #(swap-field-refs-in-clauses % options))
        (u/update-some :aggregation #(swap-field-refs-in-clauses % options))
        (u/update-some :breakout    #(swap-field-refs-in-clauses % options))
        (u/update-some :order-by    #(swap-field-refs-in-clauses % options)))))

(mu/defn- swap-field-refs-in-query :- ::lib.schema/query
  [old-query :- ::lib.schema/query
   new-query :- ::lib.schema/query]
  (u/update-some new-query :stages
                 (fn [stages]
                   (vec (map-indexed (fn [stage-number _]
                                       (swap-field-refs-in-stage old-query new-query stage-number))
                                     stages)))))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::swap-source.source
   new-source :- ::swap-source.source]
  (let [new-query (swap-source-table-or-card-in-query query old-source new-source)]
    (if (= query new-query)
      query
      (swap-field-refs-in-query query new-query))))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [_query :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  ;; TODO: implement parameter target field ref swapping
  target)
