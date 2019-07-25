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
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.transforms
             [materialize :as materialize :refer [infer-cols]]
             [specs :refer [transform-specs]]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- ->mbql
  [field-or-mbql]
  (if (mbql.u/mbql-clause? field-or-mbql)
    field-or-mbql
    (let [{:keys [source-alias id name base_type]} field-or-mbql]
      (cond
        source-alias [:joined-field source-alias (->mbql (dissoc field-or-mbql :source-alias))]
        id           [:field-id id]
        :else        [:field-literal name base_type]))))

(s/defn ^:private get-dimension-binding :- (s/cond-pre (type Field) (s/pred mbql.u/mbql-clause?))
  [bindings source identifier]
  (let [[table-or-dimension maybe-dimension] (str/split identifier #"\.")]
    (if maybe-dimension
      (cond-> (get-in bindings [table-or-dimension :dimensions maybe-dimension])
        (not= source table-or-dimension) (assoc :source-alias table-or-dimension))
      (get-in bindings [source :dimensions table-or-dimension]))))

(defn- resolve-dimension-clauses
  [bindings source mbql-form]
  (mbql.u/replace mbql-form
    [:dimension dimension] (->> dimension
                                (get-dimension-binding bindings source)
                                ->mbql
                                (resolve-dimension-clauses bindings source))))

(defn- add-bindings
  [bindings source new-bindings]
  (reduce-kv (fn [bindings name definition]
               (->> definition
                    (resolve-dimension-clauses bindings source)
                    (assoc-in bindings [source :dimensions name])))
             bindings
             new-bindings))

(defn- infer-resulting-dimensions
  [bindings {:keys [joins name]} query]
  (let [flattened-bindings (merge (apply merge (map (comp :dimensions bindings :source) joins))
                                  (get-in bindings [name :dimensions]))
        mask               (juxt :name :special_type)]
    (into {} (for [col (infer-cols query)]
               [(if (flattened-bindings (:name col))
                  (:name col)
                  ;; If the col is not one of our own we have to reconstruct to what it refers in
                  ;; our parlance
                  (some->> flattened-bindings
                           (m/find-first (comp #{(mask col)} mask val))
                           key))
                (-> col
                    (dissoc :id)
                    field/map->FieldInstance)]))))

(defn- maybe-add-fields
  [bindings {:keys [aggregation name source]} query]
  (if-not aggregation
    (assoc query :fields (map (comp ->mbql (get-in bindings [name :dimensions]) key)
                              (get-in bindings [source :dimensions])))
    query))

(defn- maybe-add-expressions
  [bindings {:keys [expressions name]} query]
  (if expressions
    (-> query
        (assoc :expressions (->> expressions
                                 keys
                                 (select-keys (get-in bindings [name :dimensions]))
                                 (m/map-keys keyword)))
        (update :fields concat (for [expression (keys expressions)]
                                 [:expression expression])))
    query))

(defn- maybe-add-aggregation
  [bindings {:keys [name aggregation]} query]
  (m/assoc-some query :aggregation (not-empty
                                    (for [agg (keys aggregation)]
                                      [:named (get-in bindings [name :dimensions agg]) agg]))))

(defn- maybe-add-breakout
  [bindings {:keys [name breakout]} query]
  (m/assoc-some query :breakout (not-empty
                                 (for [breakout breakout]
                                   (resolve-dimension-clauses bindings name breakout)))))

(defn- ->source-table-reference
  "Serialize `entity` into a form suitable as `:source-table` value."
  [entity]
  (if (instance? (type Table) entity)
    (u/get-id entity)
    (str "card__" (u/get-id entity))))

(defn- maybe-add-joins
  [bindings {context-source :source joins :joins} query]
  (m/assoc-some query :joins
    (not-empty
     (for [{:keys [source condition strategy]} joins]
       {:condition    (resolve-dimension-clauses bindings context-source condition)
        :source-table (-> source bindings :entity ->source-table-reference)
        :alias        source
        :strategy     strategy
        :fields       :all}))))

(defn- maybe-add-filter
  [bindings {:keys [name filter]} query]
  (m/assoc-some query :filter (resolve-dimension-clauses bindings name filter)))

(defn- maybe-add-limit
  [bindings {:keys [limit]} query]
  (m/assoc-some query :limit limit))

(defn- transform-step!
  [spec bindings {:keys [name source description aggregation expressions] :as step}]
  (let [source-entity  (get-in bindings [source :entity])
        local-bindings (-> bindings
                           (add-bindings name (get-in bindings [source :dimensions]))
                           (add-bindings name expressions)
                           (add-bindings name aggregation))
        query          {:type     :query
                        :query    (->> {:source-table (->source-table-reference source-entity)}
                                       (maybe-add-fields local-bindings step)
                                       (maybe-add-expressions local-bindings step)
                                       (maybe-add-aggregation local-bindings step)
                                       (maybe-add-breakout local-bindings step)
                                       (maybe-add-joins local-bindings step)
                                       (maybe-add-filter local-bindings step)
                                       (maybe-add-limit local-bindings step))
                        :database ((some-fn :db_id :database_id) source-entity)}]
    (assoc bindings name {:entity     (materialize/make-card! name (:name spec) query description)
                          :dimensions (infer-resulting-dimensions local-bindings step query)})))

(defn- table-dimensions
  [table]
  ;; For now we assume that relevant fields have distinct types
  (into {} (for [field (db/select 'Field :table_id (u/get-id table))]
             [(some-> field :special_type name) field])))

(defn- satisfies-requierment?
  [{requirement-dimensions :dimensions} table]
  (let [table-dimensions (map (comp :special_type val) (table-dimensions table))]
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
  (qp.store/fetch-and-store-fields!
   (db/select-ids 'Field :table_id [:in (map (comp u/get-id :entity val) requirements)])))

(defn apply-transform!
  "Apply transform defined by transform spec `spec` to schema `schema` in database `db-id`."
  [db-id schema {:keys [steps provides] :as spec}]
  (materialize/fresh-collection-for-transform! spec)
  (driver/with-driver (-> db-id Database :engine)
    (qp.store/with-store
      (let [initial-bindings (satisfy-requirements db-id schema spec)]
        (store-requirements! db-id initial-bindings)
        (let [bindings (reduce (partial transform-step! spec) initial-bindings (vals steps))]
          (for [[result-step {required-dimensions :dimensions}] provides]
            (do
              (when (not-every? (get-in bindings [result-step :dimensions]) required-dimensions)
                (throw (Exception. (str (tru "Resulting transform {0} do not conform to expectations.\nExpected: {1}\nGot: {2}"
                                             result-step
                                             required-dimensions
                                             (->> result-step bindings :dimensions keys))))))
              (-> result-step bindings :entity u/get-id))))))))

;; TODO: should this work for cards as well?
(defn candidates
  "Return a list of candidate transforms for a given table."
  [table]
  (filter (comp (partial some (comp #{table} :entity val))
                (partial satisfy-requirements (:db_id table) (:schema table)))
          @transform-specs))
