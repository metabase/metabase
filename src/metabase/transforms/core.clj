(ns metabase.transforms.core
  (:require [clojure.java.io :as io]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [flatland.ordered.map :refer [ordered-map]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [schema :as mbql.schema]
             [util :as mbql.u]]
            [metabase.models
             [card :as card :refer [Card]]
             [collection :as collection]
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [metric :as metric :refer [Metric]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware
             [annotate :as qp.annotate]
             [add-implicit-clauses :as qp.imlicit-clauses]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [schema
             [coerce :as sc]
             [core :as s]]
            [toucan.db :as db]
            [weavejester.dependency :as dep]
            [yaml.core :as yaml])
  (:import [java.nio.file Files FileSystem FileSystems Path]))

(def ^:private MBQL [s/Any])

(def ^:private Source s/Str)

(def ^:private Dimension s/Str)

(def ^:private Breakout [Dimension])

(def ^:private Aggregation {Dimension MBQL})

(def ^:private Expressions {Dimension MBQL})

(def ^:private Description s/Str)

(def ^:private Join [{(s/required-key :source)    Source
                      (s/required-key :condition) MBQL
                      (s/optional-key :strategy)  mbql.schema/JoinStrategy}])

(def ^:private Steps {Source {(s/required-key :source)      Source
                              (s/optional-key :aggregation) Aggregation
                              (s/optional-key :breakout)    Breakout
                              (s/optional-key :expressions) Expressions
                              (s/optional-key :join)        Join
                              (s/optional-key :description) Description}})

(defn- field-type?
  [t]
  (isa? t :type/*))

(def ^:private FieldType (s/constrained s/Keyword field-type?))

(def ^:private Requires {Source {(s/optional-key :dimensions) [FieldType]}})

(def ^:private Provides {Source {(s/required-key :dimensions) [Dimension]}})

(def ^:private Name s/Str)

(def ^:private TransformTemplate {(s/required-key :name)        Name
                                  (s/required-key :requires)    Requires
                                  (s/required-key :provides)    Provides
                                  (s/required-key :steps)       Steps
                                  (s/optional-key :description) Description})

(defn- dependencies-sort
  [dependencies-fn g]
  (transduce (map (juxt key (comp dependencies-fn val)))
             (fn
               ([] (dep/graph))
               ([acc [el dependencies]]
                (reduce (fn [acc dependency]
                          (dep/depend acc el dependency))
                        acc
                        dependencies))
               ([acc]
                (let [sorted      (filter g (dep/topo-sort acc))
                      independent (set/difference (set (keys g)) (set sorted))]
                  (not-empty
                   (into (ordered-map)
                         (map (fn [el]
                                [el (g el)]))
                         (concat independent sorted))))))
             g))

(defn- extract-dimensions
  [mbql]
  (mbql.u/match (mbql.normalize/normalize mbql) [:dimension dimension] dimension))

(defn ensure-seq
  "Wrap `x` into a vector if it is not already a sequence."
  [x]
  (if (or (sequential? x) (nil? x))
    x
    [x]))

(def ^:private ^{:arglists '([m])} stringify-keys
  (partial m/map-keys name))

(def ^:private transforms-validator
  (sc/coercer!
   TransformTemplate
   {MBQL                     mbql.normalize/normalize
    Steps                    (comp (partial dependencies-sort (fn [{:keys [source join]}]
                                                                (conj (map :source join) source)))
                                   stringify-keys)
    Breakout                 ensure-seq
    FieldType                (partial keyword "type")
    mbql.schema/JoinStrategy keyword
    ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
    {Dimension MBQL}         (comp (partial dependencies-sort extract-dimensions)
                                   stringify-keys)
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    s/Str                    name}))

(def ^:private transforms-dir "etl/")

(defn- load-transform
  [^Path f]
  (try
    (->> f
         .toUri
         slurp
         yaml/parse-string
         transforms-validator)
    (catch Exception e
      (log/error (trs "Error parsing {0}:\n{1}"
                      (.getFileName f)
                      (or (some-> e
                                  ex-data
                                  (select-keys [:error :value])
                                  u/pprint-to-str)
                          e)))
      (throw e))))

(defn- load-transforms-dir
  [dir]
  (with-open [ds (Files/newDirectoryStream dir)]
    (->> ds
         (filter (comp #(str/ends-with? % ".yaml") str/lower-case (memfn ^Path getFileName)))
         (mapv load-transform))))

(defmacro ^:private with-resource
  [[identifier path] & body]
  `(let [[jar# path#] (-> ~path .toString (str/split #"!" 2))]
     (if path#
       (with-open [^FileSystem fs# (-> jar#
                                       java.net.URI/create
                                       (FileSystems/newFileSystem (java.util.HashMap.)))]
         (let [~identifier (.getPath fs# path# (into-array String []))]
           ~@body))
       (let [~identifier (.getPath (FileSystems/getDefault) (.getPath ~path) (into-array String []))]
         ~@body))))

(def ^:private transforms (delay
                           (with-resource [path (-> transforms-dir io/resource .toURI)]
                             (load-transforms-dir path))))

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

(defrecord ^:private Expression [name definition])

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

(defn- add-breakout-bindings
  [bindings source breakout]
  (update-in bindings [source :dimensions]
             into (for [name breakout]
                    [name (get-dimension-binding bindings source name)])))

(defn- infer-cols
  [query]
  (-> {:query query
       :type  :query}
      qp.imlicit-clauses/add-implicit-mbql-clauses
      (#'qp.annotate/add-column-info* nil)
      :cols))

(defn- ->source-table
  [entity]
  (if (instance? (type Table) entity)
    (u/get-id entity)
    (str "card__" (u/get-id entity))))

(defn- make-card!
  [name collection query description]
  (->> {:creator_id             api/*current-user-id*
        :dataset_query          {:query    (update query :source-table ->source-table)
                                 :type     :query
                                 :database ((some-fn :db_id :database_id) (:source-table query))}
        :description            description
        :name                   name
        :collection_id          collection
        :result_metadata        (infer-cols query)
        :visualization_settings {}
        :display                :table}
       card/populate-query-fields
       (db/insert! 'Card)))

(defn- get-or-create-collection!
  [name color description parent-collection-id]
  (let [location (if parent-collection-id
                   (collection/children-location (db/select-one ['Collection :location :id]
                                                   :id parent-collection-id))
                   "/")]
    (or (db/select-one 'Collection
          :name     name
          :location location)
        (db/insert! 'Collection
          {:name        name
           :color       color
           :description description
           :location    location}))))

(defn- get-or-create-root-container-collection!
  "Get or create container collection for transforms in the root collection."
  []
  (u/get-id (get-or-create-collection! "Automatically Generated Transforms" "#509EE3" nil nil)))

(defn- collection-for-transform
  [{:keys [name description]}]
  (get-or-create-collection! name "#509EE3" description (get-or-create-root-container-collection!)))

(defn- build-join
  [bindings context-source join]
  (for [{:keys [source condition strategy]} join]
    {:condition    (resolve-dimension-bindings bindings context-source condition)
     :source-table (-> source bindings :entity ->source-table)
     :alias        source
     :strategy     strategy
     :fields       :all}))

(defn- ->Metric
  [name definition]
  (metric/map->MetricInstance {:name       name
                               :definition {:aggregation [definition]}}))

(defn- transform-step!
  [bindings transform {:keys [name source expressions aggregation breakout join description]}]
  (let [local-bindings (-> bindings
                           (assoc name {:dimensions (-> source bindings :dimensions)})
                           (add-bindings name ->Expression expressions)
                           (add-bindings name ->Metric aggregation)
                           (add-breakout-bindings name breakout)
                           (get-in [name :dimensions]))
        mbql-snippets  (m/map-vals ->mbql local-bindings)
        query          (cond-> {:source-table (->> source bindings :entity)}
                         ;; Expressions used in metrics will just get inlined
                         (and expressions
                              (nil? aggregation))
                         (->
                           (assoc :expressions (select-keys mbql-snippets (keys expressions)))
                           (update :fields concat (for [expression (keys expressions)]
                                                    [:expression expression])))

                         aggregation
                         (assoc :aggregation (for [agg (keys aggregation)]
                                               [:named (mbql-snippets agg) agg]))

                         breakout
                         (assoc :breakout (map mbql-snippets breakout))

                         join
                         (assoc :join (build-join bindings source join)))]
    (assoc bindings name {:dimensions (into {}
                                            (for [col (infer-cols query)]
                                              [(if (local-bindings (:name col))
                                                 (:name col)
                                                 (let [mask (juxt :name :base_type)]
                                                   (some->> local-bindings
                                                            (m/find-first (comp #{(mask col)} mask val))
                                                            key)))
                                               (-> col
                                                   (dissoc :id)
                                                   field/map->FieldInstance)]))
                          :entity     (make-card! name (collection-for-transform transform) query description)})))

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

(defn run-transform!
  [db-id schema {:keys [steps provides] :as transform}]
  (driver/with-driver (-> db-id Database :engine)
    (qp.store/with-store
      (qp.store/fetch-and-store-database! db-id)
      (let [requirements (satisfy-requirements db-id schema transform)]
        (->> requirements
             vals
             (mapcat (comp vals :dimensions))
             (map u/get-id)
             qp.store/fetch-and-store-fields!)
        (let [bindings (reduce-kv (fn [bindings name step]
                                    (transform-step! bindings transform (assoc step :name name)))
                                  requirements
                                  steps)]
          (for [[result-step {required-dimensions :dimensions}] provides]
            (assert (every? (-> result-step bindings :dimensions) required-dimensions))
            (-> result-step bindings :entity u/get-id)))))))

;; TODO: should this work for cards as well?
(defn candidates
  [table]
  (->> @transforms
       (keep (partial satisfy-requirements (:db_id table) (:schema table)))
       (filter (comp (partial some #{table}) vals))))
