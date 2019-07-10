(ns metabase.transforms.core
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [metric :as metric :refer [Metric]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.transforms
             [materialize :as materialize :refer [infer-cols]]
             [specs :refer [transform-specs]]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan.db :as db]))

(defmulti ^:private ->mbql
  type)

(defmethod ->mbql (type Field)
  [{:keys [source-alias id name] :as field}]
  (cond
    source-alias [:joined-field source-alias (->mbql (dissoc field :source-alias))]
    id           [:field-id id]
    :else        [:field-literal (:name field) (:base_type field)]))

(defmethod ->mbql (type Metric)
  [{:keys [definition]}]
  (-> definition :aggregation first))

(defrecord ^:private Expression [identifier definition])

(defmethod ->mbql Expression
  [{:keys [definition]}]
  definition)

(s/defn ^:private get-dimension-binding :- (s/cond-pre (type Field) (type Metric) Expression)
  [bindings source identifier]
  (let [[table-or-dimension dimension] (str/split identifier #"\.")]
    (if dimension
      (cond-> (get-in bindings [table-or-dimension :dimensions dimension])
        (not= source table-or-dimension) (assoc :source-alias table-or-dimension))
      (get-in bindings [source :dimensions table-or-dimension]))))

(defn- resolve-dimension-bindings
  [bindings source mbql-form]
  (mbql.u/replace mbql-form
    [:dimension dimension] (->> dimension
                                (get-dimension-binding bindings source)
                                ->mbql
                                (resolve-dimension-bindings bindings source))))

(defn- add-bindings
  [bindings source constructor-fn binding-forms]
  (reduce-kv (fn [bindings name definition]
               (->> definition
                    (resolve-dimension-bindings bindings source)
                    (constructor-fn name)
                    (assoc-in bindings [source :dimensions name])))
             bindings
             binding-forms))

(defn- dimension-part
  [identifier]
  (-> identifier (str/split #"\.") last))

(defn- add-breakout-bindings
  [bindings source breakout]
  (update-in bindings [source :dimensions]
             into (for [name breakout]
                    [(dimension-part name) (get-dimension-binding bindings source name)])))

(defn- ->source-table-reference
  "Serialize `entity` into a form suitable as `:source-table` value."
  [entity]
  (if (instance? (type Table) entity)
    (u/get-id entity)
    (str "card__" (u/get-id entity))))

(defn- build-join
  [bindings context-source join]
  (for [{:keys [source condition strategy]} join]
    {:condition    (resolve-dimension-bindings bindings context-source condition)
     :source-table (-> source bindings :entity ->source-table-reference)
     :alias        source
     :strategy     strategy
     :fields       :all}))

(defn- ->Metric
  [metric-name definition]
  (metric/map->MetricInstance {:name       metric-name
                               :definition {:aggregation [definition]}}))

(defn- transform-step!
  [bindings spec {:keys [name source expressions aggregation breakout join description limit filter]}]
  (let [local-bindings (-> bindings
                           (assoc name {:dimensions (-> source bindings :dimensions)})
                           (add-bindings name ->Expression expressions)
                           (add-bindings name ->Metric aggregation)
                           (add-breakout-bindings name breakout)
                           (get-in [name :dimensions]))
        source-table   (->> source bindings :entity)
        mbql-snippets  (m/map-vals ->mbql local-bindings)
        query          (cond-> {:source-table (->source-table-reference source-table)}
                         (nil? aggregation)
                         (assoc :fields (map mbql-snippets (-> source bindings :dimensions keys)))

                         ;; Expressions used in metrics will just get inlined
                         (and expressions
                              (nil? aggregation))
                         (->
                          (assoc :expressions (->> expressions
                                                   keys
                                                   (select-keys mbql-snippets)
                                                   (m/map-keys keyword)))
                           (update :fields concat (for [expression (keys expressions)]
                                                    [:expression expression])))

                         aggregation
                         (assoc :aggregation (for [agg (keys aggregation)]
                                               [:named (mbql-snippets agg) agg]))

                         breakout
                         (assoc :breakout (map (comp mbql-snippets dimension-part) breakout))

                         join
                         (assoc :joins (build-join bindings source join))

                         filter
                         (assoc :filter (resolve-dimension-bindings source bindings filter))

                         limit
                         (assoc :limit limit))]
    (assoc bindings
      name {:dimensions (into {} (for [col (infer-cols query)]
                                   [(if (local-bindings (:name col))
                                      (:name col)
                                      (let [mask (juxt :name :base_type)]
                                        (some->> local-bindings
                                                 (m/find-first (comp #{(mask col)} mask val))
                                                 key)))
                                    (-> col
                                        (dissoc :id)
                                        field/map->FieldInstance)]))
            :entity     (materialize/make-card! name
                                                (:name spec)
                                                {:type     :query
                                                 :query    query
                                                 :database ((some-fn :db_id :database_id) source-table)}
                                                description)})))

(defn- table-dimensions
  [table]
  ;; For now we assume that relevant fields have distinct types
  (into {} (for [field (db/select 'Field :table_id (u/get-id table))]
             [(some-> field :special_type name) field])))

(defn- satisfies-requierment?
  [{requirement-dimensions :dimensions} table]
  (let [table-dimensions  (map (comp :special_type val) (table-dimensions table))]
    (every? (fn [dimension]
              (some #(isa? % dimension) table-dimensions))
            requirement-dimensions)))

(defn- satisfy-requirements
  [db-id schema {:keys [requires]}]
  (let [tables   (db/select 'Table :db_id db-id :schema schema)
        bindings (for [[identifier requirement] requires]
                   [identifier (filter (partial satisfies-requierment? requirement) tables)])]
    ;; If multiple tables match punt for now
    (when (every? (comp #{1} count second) bindings)
      (into {} (for [[identifier [table]] bindings]
                 [identifier {:entity     table
                              :dimensions (table-dimensions table)}])))))

(defn- store-requirements!
  [db-id requirements]
  (qp.store/fetch-and-store-database! db-id)
  (->> requirements
       vals
       (mapcat (comp vals :dimensions))
       (map u/get-id)
       qp.store/fetch-and-store-fields!))

(defn apply-transform!
  "Apply transform defined by transform spec `spec` to schema `schema` in database `db-id`."
  [db-id schema {:keys [steps provides] :as spec}]
  (driver/with-driver (-> db-id Database :engine)
    (qp.store/with-store
      (let [requirements (satisfy-requirements db-id schema spec)]
        (store-requirements! db-id requirements)
        (materialize/fresh-collection-for-transform! spec)
        (let [bindings (reduce-kv (fn [bindings name step]
                                    (transform-step! bindings spec (assoc step :name name)))
                                  requirements
                                  steps)]
          (for [[result-step {required-dimensions :dimensions}] provides]
            (do
              (when (not-every? (-> result-step bindings :dimensions) required-dimensions)
                (throw (Exception. (str (tru "Resulting transform {0} do not conform to expectations.\nExpected: {1}\nGot: {2}"
                                             result-step
                                             required-dimensions
                                             (->> result-step bindings :dimensions keys))))))
              (-> result-step bindings :entity u/get-id))))))))

;; TODO: should this work for cards as well?
(defn candidates
  "Return a list of candidate transforms for a given table."
  [table]
  (->> @transform-specs
       (keep (partial satisfy-requirements (:db_id table) (:schema table)))
       (filter (comp (partial some #{table}) vals))))
