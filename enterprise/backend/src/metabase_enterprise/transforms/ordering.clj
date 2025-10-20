(ns metabase-enterprise.transforms.ordering
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :refer [ordered-set]]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmethod transforms.i/table-dependencies :query
  [transform]
  (let [query (-> (get-in transform [:source :query])
                  transforms.util/massage-sql-query
                  qp.preprocess/preprocess)
          driver (-> query
                     lib.metadata/database
                     :engine)]
      (if (lib/native-only-query? query)
        (driver/native-query-deps driver query)
        (into #{}
              (map (fn [table-id]
                     {:table table-id}))
              (lib/all-source-table-ids query)))))

(defn- dependency-map [transforms]
  (into {}
        (map (juxt :id transforms.i/table-dependencies))
        transforms))

(mu/defn- output-table-map
  [mp :- ::lib.schema.metadata/metadata-provider transforms]
  (let [table-map (into {}
                        (map (fn [{:keys [schema name id]}]
                               [[schema name] id]))
                        (lib.metadata/tables mp))]
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
                                     (let [db-id (transforms.i/target-db-id transform)]
                                       {db-id [transform]})))
                              (apply merge-with into))
        transform-ids (into #{} (map :id) transforms)
        {:keys [output-tables dependencies]} (->> transforms-by-db
                                                  (map (mu/fn [[db-id db-transforms] :- [:tuple
                                                                                         [:maybe ::lib.schema.id/database]
                                                                                         [:maybe [:sequential :any]]]]
                                                         (let [mp (lib-be/application-database-metadata-provider db-id)]
                                                           {:output-tables (output-table-map mp db-transforms)
                                                            :dependencies  (dependency-map db-transforms)})))
                                                  (apply merge-with merge))]
    (update-vals dependencies #(into #{}
                                     (keep (fn [{:keys [table transform]}]
                                             (or (output-tables table)
                                                 (transform-ids transform))))
                                     %))))

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
  (let [transforms       (map (fn [{:keys [id] :as transform}]
                                (if (= id transform-id)
                                  to-check
                                  transform))
                              (t2/select :model/Transform))
        transforms-by-id (into {}
                               (map (juxt :id identity))
                               transforms)
        db-id            (get-in to-check [:source :query :database])
        mp               (lib-be/application-database-metadata-provider db-id)
        db-transforms    (filter #(= (get-in % [:source :query :database]) db-id) transforms)
        output-tables    (output-table-map mp db-transforms)
        transform-ids    (into #{} (map :id) db-transforms)
        node->children   #(->> % transforms-by-id transforms.i/table-dependencies (keep (fn [{:keys [table transform]}]
                                                                                         (or (output-tables table)
                                                                                             (transform-ids transform)))))
        id->name         (comp :name transforms-by-id)
        cycle            (find-cycle node->children [transform-id])]
    (when cycle
      {:cycle-str (str/join " -> " (map id->name cycle))
       :cycle     cycle})))

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
