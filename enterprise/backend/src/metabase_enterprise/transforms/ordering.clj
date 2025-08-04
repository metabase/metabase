(ns metabase-enterprise.transforms.ordering
  (:require
   [clojure.core.match]
   [clojure.set :as set]
   [flatland.ordered.set :refer [ordered-set]]
   [metabase.lib.util :as lib.util]
   [toucan2.core :as t2]))

(defn- get-output-table [transform]
  (t2/select-one-fn :id
                    :model/Table
                    :schema (get-in transform [:target :schema])
                    :name (get-in transform [:target :name])
                    :db_id (get-in transform [:source :query :database])))

(defn- query-deps [query]
  (->> (tree-seq coll? seq query)
       (map #(clojure.core.match/match %
               [:source-table source] (if-let [card-id (lib.util/legacy-string-table-id->card-id source)]
                                        {:cards #{card-id}}
                                        {:tables #{source}})
               _ {}))
       (apply merge-with set/union)))

(defn- get-cards [cards seen]
  (let [filtered (filter #(not (seen %)) cards)]
    (when (seq filtered)
      (t2/select-fn-vec :dataset_query :model/Card :id
                        [:in filtered]))))

(defn- transform-deps [transform]
  (loop [[t & transforms] [(get-in transform [:source :query])]
         results {}
         seen #{}]
    (if t
      (let [{:keys [tables cards]} (query-deps t)]
        (recur (apply conj
                      transforms
                      (get-cards cards seen))
               tables
               (apply conj seen cards)))
      results)))

(defn transform-ordering
  "Computes an 'ordering' of a given list of transforms.

  The result is a map of transform id -> #{transform ids the transform depends on}. Dependencies are limited to just
  the transforms in the original list -- if a transform depends on some transform not in the list, the 'extra'
  dependency is ignored."
  [transforms]
  (let [output-tables (into {}
                            (map (fn [transform]
                                   [(get-output-table transform) (:id transform)]))
                            transforms)]
    (into {}
          (map (fn [transform]
                 [(:id transform) (into #{}
                                        (keep output-tables)
                                        (transform-deps transform))]))
          transforms)))

(defn cycle
  "Finds a path containing a cycle in the directed graph `node->children`."
  ([node->children]
   (some #(cycle node->children %) (keys node->children)))
  ([node->children start]
   (loop [stack [[start (ordered-set)]]
          visited #{}]
     (when-let [[node path] (peek stack)]
       (cond
         (contains? path node)
         (into [] (drop-while (complement #{node})) (conj path node))

         (contains? visited node)
         (recur (pop stack) visited)

         :else
         (let [new-path (conj path node)
               new-stack (into (pop stack)
                               (map #(vector % new-path))
                               (node->children node))]
           (recur new-stack (conj visited node))))))))

(defn available-transforms
  "Given an ordering (see transform-ordering), a set of running transform ids, and a set of completed transform ids,
  computes which transforms are currently able to be run."
  [ordering running complete]
  (for [[transform-id deps] ordering
        :when (and (not (or (running transform-id)
                            (complete transform-id)))
                   (empty? (set/difference deps complete)))]
    transform-id))
