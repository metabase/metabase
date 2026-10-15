(ns metabase-enterprise.library-branching.typing
  "The typing of the queries of a snapshot against an environment (`format.manifest/env`): each field reference of a
  query has the type that the environment gives its field, and Lib's query schema checks each clause against the
  types of its arguments. It needs Lib, so it runs in the Metabase JAR, not in the lightweight checker."
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.library-branching.engine.semantic :as semantic]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.util.log :as log]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def query-attrs
  "`{kind attribute}`: the kinds whose items hold a query, and the attribute that holds it, an MBQL 5 query in its
  portable form."
  {:measure  :definition
   :metric   :query
   :model    :query
   :question :query
   :segment  :definition})

(defn- flatten-errors
  "`[{:at path :message m}]` of the humanized explanation `errors`, in the order of the paths."
  [errors]
  (letfn [(walk [path x]
            (cond
              (string? x)     [{:at path :message x}]
              (map? x)        (mapcat (fn [[k v]] (walk (conj path k) v)) (sort-by (comp str key) x))
              (sequential? x) (mapcat (fn [i v] (walk (conj path i) v)) (range) x)
              :else           []))]
    (vec (walk [] errors))))

;;; ------------------------------------------------------- Ids -------------------------------------------------------

(defn- ids
  "`{key id}`: a positive integer for each natural key of `env` and for each `[:item identity]` of an item of `s`, a
  different one for each, in a fixed order."
  [s env]
  (zipmap (concat (sort-by str (keys env))
                  (map (partial vector :item) (sort snapshot/compare-identities (keys s))))
          (iterate inc 1)))

(defn- unresolved!
  [k]
  (throw (ex-info (str "No id for " (pr-str k)) {::unresolved k})))

(defn- import-resolver
  "A serdes import resolver that gives the ids of `ids` ([[ids]]), and throws ::unresolved for a key that `ids` does
  not hold, a user, or a row by another key."
  [ids]
  (let [id-of (fn [k] (or (get ids k) (unresolved! k)))]
    (reify serdes.resolve/SerdesImportResolver
      (import-fk [_ eid _model] (id-of [:item eid]))
      (import-fk-keyed [_ portable model field] (unresolved! [model field portable]))
      (import-user [_ email] (unresolved! email))
      (import-database-fk [_ db-name] (some-> db-name vector id-of))
      (import-table-fk [_ table-key] (some-> table-key id-of))
      (import-field-fk [_ field-key] (some-> field-key id-of)))))

(defn- import-query
  "The MBQL 5 query, with the ids of `ids`, of portable query `query`; nil when it names an item or an environment
  object that `ids` does not hold, or when Lib's query schema refuses its shape, with the type checks off."
  [ids query]
  (try
    (binding [serdes.resolve/*import-resolver* (import-resolver ids)]
      (serdes/import-mbql query))
    (catch clojure.lang.ExceptionInfo e
      (let [data (ex-data e)]
        (if (or (contains? data ::unresolved) (contains? data :schema-errors))
          nil
          (throw e))))))

;;; ------------------------------------------------- Metadata provider -----------------------------------------------

(defn- field-type
  [object]
  (let [base (keyword (or (:base-type object) "type/*"))]
    {:base-type      base
     :effective-type (or (some-> (:effective-type object) keyword) base)}))

(defn- metadata
  "The Lib metadata of database `db` (a name) of `env`, with the ids of `ids`: the database, its tables and their
  fields, and the cards, segments and measures of `queries` (`{identity imported-query}` of the items of `s`) on it."
  [s env ids queries db]
  (let [db-id (get ids [db])
        in-db (fn [k] (= db (first k)))]
    {:database {:lib/type :metadata/database :id db-id :name db
                :engine   (keyword (or (:engine (get env [db])) "h2")) :features #{}}
     :tables   (vec (for [[k {:keys [object]}] env
                          :when (and (= :table object) (in-db k))
                          :let  [[_ schema table] k]]
                      {:lib/type :metadata/table :id (get ids k) :db-id db-id :schema schema :name table
                       :display-name table :active true}))
     :fields   (vec (for [[k {:keys [object] :as o}] env
                          :when (and (= :field object) (in-db k))]
                      (merge {:lib/type :metadata/column :id (get ids k) :table-id (get ids (subvec k 0 3))
                              :name (peek k) :display-name (peek k) :active true :visibility-type :normal}
                             (field-type o)
                             (when (< 4 (count k)) {:parent-id (get ids (pop k))}))))
     :cards    (vec (for [[id q] queries
                          :let  [{:keys [kind name]} (get s id)]
                          :when (and (#{:metric :model :question} kind) (= db-id (:database q)))]
                      {:lib/type :metadata/card :id (get ids [:item id]) :name name :type kind :database-id db-id
                       :dataset-query q}))
     :segments (vec (for [[id q] queries
                          :let  [{:keys [kind name place]} (get s id)]
                          :when (and (= :segment kind) (= db-id (:database q)))]
                      {:lib/type :metadata/segment :id (get ids [:item id]) :name name :table-id (get ids place)
                       :definition q}))
     :measures (vec (for [[id q] queries
                          :let  [{:keys [kind name place]} (get s id)]
                          :when (and (= :measure kind) (= db-id (:database q)))]
                      {:lib/type :metadata/measure :id (get ids [:item id]) :name name :table-id (get ids place)
                       :definition q}))}))

(deftype ^:private ManifestMetadataProvider [m]
  lib.metadata.protocols/MetadataProvider
  (database [_] (:database m))
  (metadatas [_ {metadata-type :lib/type :as spec}]
    (into []
          (lib.metadata.protocols/default-spec-filter-xform spec)
          (get m (case metadata-type
                   :metadata/table   :tables
                   :metadata/column  :fields
                   (:metadata/card :metadata/metric) :cards
                   :metadata/segment :segments
                   :metadata/measure :measures
                   nil))))
  (setting [_ _] nil))

;;; ------------------------------------------------------ Typing -----------------------------------------------------

(defn- field-ref?
  [x]
  (and (vector? x) (= :field (first x)) (map? (second x)) (= 3 (count x))))

(defn- with-type
  [ref t]
  (update ref 1 merge t))

(defn- typed-stage
  "Stage `stage-number` of `query` with the type of each field reference from the environment: a reference by id has
  the type of its field; a reference by name, with no join alias, in a stage after the first has the type of the
  column of that name that the stage before returns, when it returns one."
  [query stage-number id->type]
  (let [columns (when (pos? stage-number)
                  (try
                    (into {} (map (juxt :name field-type)) (lib/returned-columns query (dec stage-number)))
                    (catch Exception e
                      (log/debugf e "Library branching cannot compute the columns of stage %d" (dec stage-number))
                      {})))]
    (update-in query [:stages stage-number]
               (fn [stage]
                 (walk/postwalk
                  (fn [x]
                    (if-not (field-ref? x)
                      x
                      (let [[_ {:keys [join-alias]} id-or-name] x]
                        (cond
                          (int? id-or-name)                   (if-let [t (get id->type id-or-name)] (with-type x t) x)
                          (and (string? id-or-name) (nil? join-alias)
                               (contains? columns id-or-name)) (with-type x (get columns id-or-name))
                          :else                               x))))
                  stage)))))

(defn typed-query
  "MBQL 5 query `query` with the ids of the environment, after [[typed-stage]] of each stage in order. `mp` is the
  metadata provider of its database; `id->type` gives the type of each field id."
  [mp id->type query]
  (reduce (fn [q n] (typed-stage q n id->type))
          (lib/query mp query)
          (range (count (:stages query)))))

(defn- query-errors
  "The errors of Lib's query schema for `query`, with the type check of each clause on."
  [query]
  (binding [lib.schema.expression/*suppress-expression-type-check?* false]
    ;; A fresh value: a memoized validator keeps an earlier result of an identical value, which a check with the
    ;; type checks off may have made.
    (some-> (mr/explain ::lib.schema/query (walk/prewalk identity (dissoc query :lib/metadata)))
            mu.humanize/humanize
            flatten-errors
            not-empty)))

(defn validate
  "The typing findings of snapshot `s` against environment `env`, `{natural-key object}` (`format.manifest/env`): for
  each item of a kind of [[query-attrs]], in the order of the identities, a finding
  `{:rule :query-typed :id i :attr k :errors [{:at path :message m}]}` when Lib's query schema refuses the query of
  attribute `k` with the types of the environment, and not without them. `path` is a path in the query. A query that
  names an item that `s` does not have, or an environment object that `env` does not have, has no typing finding: the
  structural check and `semantic/validate` report the reference. Nor has a query whose shape Lib's query schema
  refuses, with no regard to types: the write of an instance refuses it."
  [s env]
  (let [ids      (ids s env)
        id->type (into {} (for [[k o] env :when (= :field (:object o))] [(get ids k) (field-type o)]))
        imported (into (sorted-map-by snapshot/compare-identities)
                       (for [[id {:keys [kind attrs]}] s
                             :let  [query (get attrs (get query-attrs kind))]
                             :when (map? query)
                             :let  [q (import-query ids query)]
                             :when q]
                         [id q]))
        mps      (memoize (fn [db] (->ManifestMetadataProvider (metadata s env ids imported db))))]
    (vec (for [[id q] imported
               :let  [db     (:database (get-in s [id :attrs (get query-attrs (get-in s [id :kind]))]))
                      errors (try
                               (query-errors (typed-query (mps db) id->type q))
                               (catch Exception e
                                 (log/warnf e "Library branching cannot type the query of %s" id)
                                 nil))]
               :when errors]
           {:rule :query-typed :id id :attr (get query-attrs (get-in s [id :kind])) :errors errors}))))

(defn semantic
  "The findings of the semantic level of snapshot `s` against environment `env`: those of `semantic/validate`, then
  those of [[validate]]."
  [s env]
  (into (semantic/validate s env) (validate s env)))
