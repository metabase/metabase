(ns metabase.transforms.core
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.transforms
             [materialize :as materialize :refer [infer-cols]]
             [specs :refer [MBQL Step transform-specs TransformSpec]]]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private SourceName s/Str)

(def ^:private DimensionReference s/Str)

(def ^:private DimensionBindings {DimensionReference MBQL})

(def ^:private SourceEntity (s/cond-pre (type Table) (type Card)))

(def ^:private Bindings {SourceName {(s/optional-key :entity)     SourceEntity
                                     (s/required-key :dimensions) DimensionBindings}})

(s/defn ^:private get-dimension-binding :- MBQL
  [bindings :- Bindings, source :- SourceName, dimension-reference :- DimensionReference]
  (let [[table-or-dimension maybe-dimension] (str/split dimension-reference #"\.")]
    (if maybe-dimension
      (cond->> (get-in bindings [table-or-dimension :dimensions maybe-dimension])
        (not= source table-or-dimension) (vector :joined-field table-or-dimension))
      (get-in bindings [source :dimensions table-or-dimension]))))

(s/defn ^:private resolve-dimension-clauses :- (s/maybe MBQL)
  [bindings :- Bindings, source :- SourceName, field-or-mbql :- (s/maybe MBQL)]
  (mbql.u/replace field-or-mbql
    [:dimension dimension] (->> dimension
                                (get-dimension-binding bindings source)
                                (resolve-dimension-clauses bindings source))))

(s/defn ^:private add-bindings :- Bindings
  [bindings :- Bindings, source :- SourceName, new-bindings :- (s/maybe DimensionBindings)]
  (reduce-kv (fn [bindings name definition]
               (->> definition
                    (resolve-dimension-clauses bindings source)
                    (assoc-in bindings [source :dimensions name])))
             bindings
             new-bindings))

(s/defn ^:private mbql-reference :- MBQL
  [{:keys [id name base_type]}]
  (if id
    [:field-id id]
    [:field-literal name base_type]))

(defn- mbql-reference->col-name
  [mbql-reference]
  (mbql.u/match-one mbql-reference
    [:field-literal name _] name
    [:field-id id]          (-> id Field :name)))

(s/defn ^:private infer-resulting-dimensions :- DimensionBindings
  [bindings :- Bindings, {:keys [joins name]} :- Step, query :- mbql.s/Query]
  (let [flattened-bindings (merge (apply merge (map (comp :dimensions bindings :source) joins))
                                  (get-in bindings [name :dimensions]))]
    (into {} (for [{:keys [name] :as col} (infer-cols query)]
               [(if (flattened-bindings name)
                  name
                  ;; If the col is not one of our own we have to reconstruct to what it refers in
                  ;; our parlance
                  (or (some->> flattened-bindings
                               (m/find-first (comp #{name} mbql-reference->col-name val))
                               key)
                      ;; If that doesn't work either, it's a duplicated col from a join
                      name))
                (mbql-reference col)]))))

(defn- maybe-add-fields
  [bindings {:keys [aggregation source]} query]
  (if-not aggregation
    (assoc query :fields (vals (get-in bindings [source :dimensions])))
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
  (->> (for [agg (keys aggregation)]
         [:aggregation-options (get-in bindings [name :dimensions agg]) {:name agg}])
       not-empty
       (m/assoc-some query :aggregation)))

(defn- maybe-add-breakout
  [bindings {:keys [name breakout]} query]
  (m/assoc-some query :breakout (not-empty
                                 (for [breakout breakout]
                                   (resolve-dimension-clauses bindings name breakout)))))

(s/defn ^:private ->source-table-reference
  "Serialize `entity` into a form suitable as `:source-table` value."
  [entity :- SourceEntity]
  (if (instance? (type Table) entity)
    (u/get-id entity)
    (str "card__" (u/get-id entity))))

(defn- maybe-add-joins
  [bindings {context-source :source joins :joins} query]
  (m/assoc-some query :joins
    (not-empty
     (for [{:keys [source condition strategy]} joins]
       (-> {:condition    (resolve-dimension-clauses bindings context-source condition)
            :source-table (-> source bindings :entity ->source-table-reference)
            :alias        source
            :fields       :all}
           (m/assoc-some :strategy strategy))))))

(defn- maybe-add-filter
  [bindings {:keys [name filter]} query]
  (m/assoc-some query :filter (resolve-dimension-clauses bindings name filter)))

(defn- maybe-add-limit
  [bindings {:keys [limit]} query]
  (m/assoc-some query :limit limit))

(s/defn ^:private transform-step! :- Bindings
  [bindings :- Bindings, {:keys [name source aggregation expressions] :as step} :- Step]
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
    (assoc bindings name {:entity     (materialize/make-card-for-step! step query)
                          :dimensions (infer-resulting-dimensions local-bindings step query)})))

(def ^:private ^{:arglists '([field])} field-type
  (some-fn :special_type :base_type))

(defn- satisfies-requierment?
  [{requirement-dimensions :dimensions} table]
  (let [table-dimensions (map field-type (:fields table))]
    (every? (fn [dimension]
              (some #(isa? % dimension) table-dimensions))
            requirement-dimensions)))

(defn- satisfy-requirements
  [db-id schema {:keys [requires]}]
  (let [tables   (table/with-fields
                   (db/select 'Table :db_id db-id :schema schema))
        bindings (m/map-vals (fn [requirement]
                               (filter (partial satisfies-requierment? requirement) tables))
                             requires)]
    ;; If multiple tables match punt for now
    (when (every? (comp #{1} count second) bindings)
      (m/map-vals (fn [[table]]
                    {:entity     table
                     :dimensions (into {} (for [field (:fields table)]
                                            [(-> field field-type name) (mbql-reference field)]))})
                  bindings))))

(defn- store-requirements!
  [db-id requirements]
  (qp.store/fetch-and-store-database! db-id)
  (qp.store/fetch-and-store-fields!
   (mapcat (comp (partial map u/get-id) :fields :entity val) requirements)))

(s/defn apply-transform!
  "Apply transform defined by transform spec `spec` to schema `schema` in database `db-id`."
  [db-id :- su/IntGreaterThanZero, schema :- (s/maybe s/Str), {:keys [steps provides] :as spec} :- TransformSpec]
  (materialize/fresh-collection-for-transform! spec)
  (let [initial-bindings (satisfy-requirements db-id schema spec)]
    (driver/with-driver (-> db-id Database :engine)
      (qp.store/with-store
        (store-requirements! db-id initial-bindings)
        (let [bindings (reduce transform-step! initial-bindings (vals steps))]
          (for [[result-step {required-dimensions :dimensions}] provides]
            (do
              (when (not-every? (get-in bindings [result-step :dimensions]) required-dimensions)
                (throw (Exception. (str (tru "Resulting transform {0} does not conform to expectations.\nExpected: {1}\nGot: {2}"
                                             result-step
                                             required-dimensions
                                             (->> result-step bindings :dimensions keys))))))
              (-> result-step bindings :entity u/get-id))))))))

(defn candidates
  "Return a list of candidate transforms for a given table."
  [table]
  (filter (comp (partial some (comp #{(u/get-id table)} u/get-id :entity val))
                (partial satisfy-requirements (:db_id table) (:schema table)))
          @transform-specs))
