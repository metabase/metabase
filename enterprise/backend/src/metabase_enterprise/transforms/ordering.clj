(ns metabase-enterprise.transforms.ordering
  (:require
   [clojure.core.match]
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :refer [ordered-set]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- transform-deps [transform]
  (if (transforms.util/python-transform? transform)
    ;; Python transforms have dependencies via source-tables mapping
    (into #{}
          (map #(hash-map :table %))
          (vals (get-in transform [:source :source-tables])))
    ;; Query transforms have dependencies via SQL query analysis
    (let [query (-> (get-in transform [:source :query])
                    transforms.util/massage-sql-query
                    qp.preprocess/preprocess
                    ;; legacy usage -- don't do things like this going forward
                    #_{:clj-kondo/ignore [:discouraged-var]}
                    lib/->legacy-MBQL)]
      (case (:type query)
        :native (driver/native-query-deps (-> (qp.store/metadata-provider)
                                              lib.metadata/database
                                              :engine)
                                          (get-in query [:native :query]))
        :query (into #{}
                     (keep #(clojure.core.match/match %
                              [:source-table source] (when (int? source)
                                                       {:table source})
                              _ nil))
                     (tree-seq coll? seq query))))))

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
  dependency is ignored. Both query and Python transforms can have dependencies on tables produced by other transforms."
  [transforms]
  (let [;; Group all transforms by their database
        transforms-by-db (->> transforms
                              (map (fn [transform]
                                     (let [db-id (if (transforms.util/python-transform? transform)
                                                   (get-in transform [:target :database])
                                                   (get-in transform [:source :query :database]))]
                                       {db-id [transform]})))
                              (apply merge-with into))

        transform-ids (into #{} (map :id) transforms)
        {:keys [output-tables dependencies]} (->> transforms-by-db
                                                  (map (fn [[db-id db-transforms]]
                                                         (qp.store/with-metadata-provider db-id
                                                           {:output-tables (output-table-map db-transforms)
                                                            :dependencies (dependency-map db-transforms)})))
                                                  (apply merge-with merge))

        all-deps (update-vals dependencies #(into #{}
                                                  (keep (fn [{:keys [table transform]}]
                                                          (or (output-tables table)
                                                              (transform-ids transform))))
                                                  %))]
    all-deps))

(defn find-cycle
  "Finds a path containing a cycle in the directed graph `node->children`.

  Optionally takes a set of starting nodes.  If starting nodes are specified, `node->children` can be any
  function-equivalent.  Without starting nodes, `node->children` must specifically be a map."
  ([node->children]
   (find-cycle node->children (keys node->children)))
  ([node->children starting-nodes]
   (loop [stack (into [] (map #(vector % (ordered-set))) starting-nodes)
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
           (recur stack' (conj visited node))))))))

(defn get-transform-cycle
  "Get a cycle if it exists (otherwise `nil`). Cycle consists of:

  ```
  {:cycle-str \"transform-1 => tranform-2\"
   :cycle [1 2]}
  ```
"
  [{transform-id :id :as to-check}]
  (let [transforms (map (fn [{:keys [id] :as transform}]
                          (if (= id transform-id)
                            to-check
                            transform))
                        (t2/select :model/Transform))
        transforms-by-id (into {}
                               (map (juxt :id identity))
                               transforms)
        db-id (get-in to-check [:source :query :database])]
    (qp.store/with-metadata-provider db-id
      (let [db-transforms (filter #(= (get-in % [:source :query :database]) db-id) transforms)
            output-tables (output-table-map db-transforms)
            transform-ids (into #{} (map :id) db-transforms)
            node->children #(->> % transforms-by-id transform-deps (keep (fn [{:keys [table transform]}]
                                                                           (or (output-tables table)
                                                                               (transform-ids transform)))))
            id->name (comp :name transforms-by-id)
            cycle (find-cycle node->children [transform-id])]
        (when cycle
          {:cycle-str (str/join " -> " (map id->name cycle))
           :cycle cycle})))))

(defn available-transforms
  "Given an ordering (see transform-ordering), a set of running transform ids, and a set of completed transform ids,
  computes which transforms are currently able to be run.  Returns transform ids in the order that they appear in the
  ordering map.  If you want them returned in a specific order, use a map with ordered keys, e.g., a sorted-map."
  [ordering running complete]
  (for [[transform-id deps] ordering
        :when (and (not (or (running transform-id)
                            (complete transform-id)))
                   (empty? (set/difference deps complete)))]
    transform-id))
