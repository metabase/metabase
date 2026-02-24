(ns metabase.lib_be.swap-source
  (:require
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv]]))

(mr/def ::source-type [:enum :table :card])

(mr/def ::swap-source-options
  [:map
   [:source-type ::source-type]
   [:source-id [:or ::id/table ::id/card]]
   [:target-type ::source-type]
   [:target-id [:or ::id/table ::id/card]]])

(defn- walk-clause-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(mu/defn- update-field-ref :- :mbql.clause/field
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field
   columns       :- [:sequential ::lib.schema.metadata/column]
   column-fn     :- fn?]
  (or (some-> (lib.equality/find-matching-column query stage-number field-ref columns)
              column-fn
              lib.ref/ref)
      field-ref))

(mu/defn- update-field-refs-in-clauses :- [:sequential :any]
  [query        :- ::lib.schema/query
   stage-number :- :int
   clauses      :- [:sequential :any]
   columns      :- [:sequential ::lib.schema.metadata/column]
   column-fn    :- fn?]
  (mapv (fn [clause]
          (walk-clause-field-refs clause #(update-field-ref query stage-number % columns column-fn)))
        clauses))

(mu/defn- update-field-refs-in-join :- ::lib.schema.join/join
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join
   columns      :- [:sequential ::lib.schema.metadata/column]
   column-fn    :- fn?]
  (-> join
      (u/update-some :fields #(if (keyword? %) % (update-field-refs-in-clauses query stage-number % columns column-fn)))
      (u/update-some :conditions #(update-field-refs-in-clauses query stage-number % columns column-fn))))

(mu/defn- update-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- [:sequential ::lib.schema.join/join]
   columns      :- [:sequential ::lib.schema.metadata/column]
   column-fn    :- fn?]
  (mapv #(update-field-refs-in-join query stage-number % columns column-fn) joins))

(mu/defn- update-field-refs-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-fn    :- fn?]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (when ((some-fn :fields :filters :expressions :aggregation :breakout :order-by :joins) stage)
                          (lib.metadata.calculation/visible-columns query stage-number))
        orderable-columns (if ((some-fn :aggregation :breakout) stage)
                            (lib.order-by/orderable-columns query stage-number)
                            visible-columns)]
    (-> stage
        (u/update-some :fields      #(update-field-refs-in-clauses query stage-number % visible-columns column-fn))
        (u/update-some :joins       #(update-field-refs-in-joins query stage-number % visible-columns column-fn))
        (u/update-some :expressions #(update-field-refs-in-clauses query stage-number % visible-columns column-fn))
        (u/update-some :filters     #(update-field-refs-in-clauses query stage-number % visible-columns column-fn))
        (u/update-some :aggregation #(update-field-refs-in-clauses query stage-number % visible-columns column-fn))
        (u/update-some :breakout    #(update-field-refs-in-clauses query stage-number % visible-columns column-fn))
        (u/update-some :order-by    #(update-field-refs-in-clauses query stage-number % orderable-columns column-fn)))))

(mu/defn- update-field-refs-in-query :- ::lib.schema/query
  [query     :- ::lib.schema/query
   column-fn :- fn?]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (update-field-refs-in-stage query stage-number column-fn))
                                           %))))

(mu/defn- source-key :- [:enum :source-table :source-card]
  [type :- ::source-type]
  (case type
    :table :source-table
    :card :source-card))

(mu/defn- update-source-in-clause :- [:or ::lib.schema/stage ::lib.schema.join/join]
  [clause  :- [:or ::lib.schema/stage ::lib.schema.join/join]
   options :- ::swap-source-options]
  (let [source-key (source-key (:source-type options))
        target-key (source-key (:target-type options))]
    (if (= (:source-id options) (get clause source-key))
      (-> clause
          (dissoc source-key)
          (assoc target-key (:target-id options)))
      clause)))

(mu/defn- update-source-in-stage :- ::lib.schema/stage
  [stage   :- ::lib.schema/stage
   options :- ::swap-source-options]
  (-> stage
      (update-source-in-clause options)
      (u/update-some :joins #(mapv #(update-source-in-clause % options) %))))

(mu/defn- update-source-in-query :- ::lib.schema/query
  [query   :- ::lib.schema/query
   options :- ::swap-source-options]
  (update query :stages (fn [stages] (mapv #(update-source-in-stage % options) stages))))

(mu/defn swap-source-in-query :- ::lib.schema/query
  [query   :- ::lib.schema/query
   options :- ::swap-source-options]
  (-> query
      (update-field-refs-in-query #(dissoc % :id))
      (update-source-in-query options)
      (update-field-refs-in-query identity)))
