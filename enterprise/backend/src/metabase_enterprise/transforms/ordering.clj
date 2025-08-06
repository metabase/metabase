(ns metabase-enterprise.transforms.ordering
  (:require
   [clojure.core.match]
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :refer [ordered-set]]
   [macaw.core :as macaw]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(defn- clean-name [str]
  (-> str
      (str/replace #"['\"`]" "")
      str/lower-case))

(defn- get-table [{:keys [table schema]}]
  (->> (qp.store/metadata-provider)
       lib.metadata/tables
       (some (fn [{cur-table :name cur-schema :schema id :id}]
               (and (= (clean-name cur-table) (clean-name table))
                    (or (nil? schema)
                        (= (clean-name cur-schema) (clean-name schema)))
                    id)))))

(defn- transform-deps [transform]
  (let [query (-> (get-in transform [:source :query])
                  transforms.util/massage-sql-query
                  qp.preprocess/preprocess)]
    (case (:type query)
      :native (->> (get-in query [:native :query])
                   macaw/parsed-query
                   macaw/query->components
                   :tables
                   (into #{} (keep (comp get-table :component))))
      :query (into #{}
                   (keep #(clojure.core.match/match %
                            [:source-table source] (when (int? source)
                                                     source)
                            _ nil))
                   (tree-seq coll? seq query)))))

(defn- transform-deps-for-db [db-id transforms]
  (qp.store/with-metadata-provider db-id
    (into {}
          (map (juxt :id transform-deps))
          transforms)))

(defn- dependency-map [transforms]
  (into {}
        (map (juxt :id transform-deps))
        transforms))

(defn- output-table-map [transforms]
  (let [table-map (into {}
                        (map (fn [{:keys [schema name id]}]
                               [[schema name] id]))
                        (lib.metadata/tables (qp.store/metadata-provider)))]
    (into {}
          (keep (fn [transform]
                  (when-let [output-table (table-map [(get-in transform [:target :schema])
                                                      (get-in transform [:target :name])])]
                    [output-table (:id transform)])))
          transforms)))

(defn transform-ordering
  "Computes an 'ordering' of a given list of transforms.

  The result is a map of transform id -> #{transform ids the transform depends on}. Dependencies are limited to just
  the transforms in the original list -- if a transform depends on some transform not in the list, the 'extra'
  dependency is ignored."
  [transforms]
  (let [transforms-by-db (->> transforms
                              (map (fn [transform]
                                     {(get-in transform [:source :query :database]) [transform]}))
                              (apply merge-with into))

        {:keys [output-tables dependencies]} (->> transforms-by-db
                                                  (map (fn [[db-id db-transforms]]
                                                         (qp.store/with-metadata-provider db-id
                                                           {:output-tables (output-table-map db-transforms)
                                                            :dependencies (dependency-map db-transforms)})))
                                                  (apply merge-with merge))]
    (update-vals dependencies #(into #{} (keep output-tables) %))))

(defn find-cycle
  "Finds a path containing a cycle in the directed graph `node->children`."
  [node->children]
  (loop [stack (into [] (map #(vector % (ordered-set))) (keys node->children))
         visited #{}]
    (when-let [[node path] (peek stack)]
      (cond
        (contains? path node)
        (into [] (drop-while (complement #{node})) (conj path node))

        (contains? visited node)
        (recur (pop stack) visited)

        :else
        (let [path' (conj path node)
              stack' (into (pop stack)
                           (map #(vector % path'))
                           (node->children node))]
          (recur stack' (conj visited node)))))))

(defn available-transforms
  "Given an ordering (see transform-ordering), a set of running transform ids, and a set of completed transform ids,
  computes which transforms are currently able to be run."
  [ordering running complete]
  (for [[transform-id deps] ordering
        :when (and (not (or (running transform-id)
                            (complete transform-id)))
                   (empty? (set/difference deps complete)))]
    transform-id))
