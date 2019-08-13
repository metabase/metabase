(ns metabase.transforms.core
  (:require [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [util :as u]]
            [metabase.domain-entities
             [core :as de :refer [Bindings DimensionBindings SourceEntity SourceName]]
             [specs :refer [domain-entity-specs DomainEntitySpec]]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.transforms
             [materialize :as materialize]
             [specs :refer [Step transform-specs TransformSpec]]]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private add-bindings :- Bindings
  [bindings :- Bindings, source :- SourceName, new-bindings :- (s/maybe DimensionBindings)]
  (reduce-kv (fn [bindings name definition]
               (->> definition
                    (de/resolve-dimension-clauses bindings source)
                    (assoc-in bindings [source :dimensions name])))
             bindings
             new-bindings))

(defn- mbql-reference->col-name
  [mbql-reference]
  (mbql.u/match-one mbql-reference
    [:field-literal name _] name
    [:field-id id]          (-> id Field :name)))

(s/defn ^:private infer-resulting-dimensions :- DimensionBindings
  [bindings :- Bindings, {:keys [joins name]} :- Step, query :- mbql.s/Query]
  (let [flattened-bindings (merge (apply merge (map (comp :dimensions bindings :source) joins))
                                  (get-in bindings [name :dimensions]))]
    (into {} (for [{:keys [name] :as col} (qp/query->expected-cols query)]
               [(if (flattened-bindings name)
                  name
                  ;; If the col is not one of our own we have to reconstruct to what it refers in
                  ;; our parlance
                  (or (some->> flattened-bindings
                               (m/find-first (comp #{name} mbql-reference->col-name))
                               key)
                      ;; If that doesn't work either, it's a duplicated col from a join
                      name))
                (de/mbql-reference col)]))))

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
                                   (de/resolve-dimension-clauses bindings name breakout)))))

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
       (-> {:condition    (de/resolve-dimension-clauses bindings context-source condition)
            :source-table (-> source bindings :entity ->source-table-reference)
            :alias        source
            :fields       :all}
           (m/assoc-some :strategy strategy))))))

(defn- maybe-add-filter
  [bindings {:keys [name filter]} query]
  (m/assoc-some query :filter (de/resolve-dimension-clauses bindings name filter)))

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

(def ^:private Tableset [(type Table)])

(s/defn ^:private find-tables-with-domain-entity :- Tableset
  [tableset :- Tableset, domain-entity-spec :- DomainEntitySpec]
  (filter #(-> % :domain_entity :type (isa? (:type domain-entity-spec))) tableset))

(s/defn ^:private tableset->bindings :- Bindings
  [tableset :- Tableset]
  (into {} (for [{{domain-entity-name :name dimensions :dimensions} :domain_entity :as table} tableset]
             [domain-entity-name
              {:dimensions (m/map-vals de/mbql-reference dimensions)
               :entity     table}])))

(s/defn ^:private apply-transform-to-tableset! :- Bindings
  [tableset :- Tableset, {:keys [steps provides]} :- TransformSpec]
  (driver/with-driver (-> tableset first table/database :engine)
    (reduce transform-step! (tableset->bindings tableset) (vals steps))))

(s/defn ^:private resulting-entities :- [SourceEntity]
  [bindings :- Bindings, {:keys [provides]} :- TransformSpec]
  (map (comp :entity val) (select-keys bindings provides)))

(s/defn ^:private validate-results :- Bindings
  [bindings :- Bindings, {:keys [provides]} :- TransformSpec]
  (doseq [domain-entity-name provides]
    (assert (de/satisfies-requierments? (get-in bindings [domain-entity-name :entity])
                                        (@domain-entity-specs domain-entity-name))
      (str (tru "Resulting transforms do not conform to expectations.\nExpected: {0}"
                domain-entity-name))))
  bindings)

(s/defn ^:private tables-matching-requirements :- (s/maybe Tableset)
  [tableset :- Tableset, {:keys [requires]} :- TransformSpec]
  (let [matches (map (comp (partial find-tables-with-domain-entity tableset)
                           @domain-entity-specs)
                     requires)]
    (when (every? (comp #{1} count) matches)
      (map first matches))))

(s/defn ^:private tableset :- Tableset
  [db-id :- su/IntGreaterThanZero, schema :- (s/maybe s/Str)]
  (table/with-fields
    (de/with-domain-entity
      (db/select 'Table :db_id db-id :schema schema))))

(s/defn apply-transform!
  "Apply transform defined by transform spec `spec` to schema `schema` in database `db-id`.

  The algorithm is as follows:
  1) Try to find a set of tables in the given schema that have required domain entities.
  2) If found, use these tables and their fields as the initial bindings.
  3) Go through the transform steps, materialize them as cards, and accure these and their result
     cols to the bindings.
  4) Check that all output cards have the expected result shape.
  5) Return the output cards."
  [db-id :- su/IntGreaterThanZero, schema :- (s/maybe s/Str), spec :- TransformSpec]
  (materialize/fresh-collection-for-transform! spec)
  (some-> (tableset db-id schema)
          (tables-matching-requirements spec)
          (apply-transform-to-tableset! spec)
          (validate-results spec)
          (resulting-entities spec)))

(defn candidates
  "Return a list of candidate transforms for a given table."
  [table]
  (filter (comp (partial some (comp #{(u/get-id table)} u/get-id))
                (partial tables-matching-requirements (tableset (:db_id table) (:schema table))))
          @transform-specs))
