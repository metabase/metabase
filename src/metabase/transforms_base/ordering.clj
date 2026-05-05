(ns metabase.transforms-base.ordering
  "Transform dependency ordering and cycle detection.

   Pure functions for computing execution order based on table dependencies."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :refer [ordered-set]]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Query Dependencies -------------------------------------------------

(defn query-table-dependencies
  "Compute table dependencies for a query transform.
  This is the base implementation - callers may wrap with additional error handling."
  [{:keys [source]}]
  (let [query (-> (:query source)
                  transforms-base.u/massage-sql-query
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

(defn- database-routing-error-ex-data [^Throwable e]
  (when e
    (if (:database-routing-enabled (ex-data e))
      (ex-data e)
      (recur (.getCause e)))))

(defmethod transforms-base.i/table-dependencies :query
  [transform]
  (try
    (query-table-dependencies transform)
    (catch ExceptionInfo e
      (if-some [data (database-routing-error-ex-data e)]
        (let [message (i18n/trs "Failed to run transform because the database {0} has database routing turned on. Running transforms on databases with db routing enabled is not supported." (:database-name data))]
          (throw (ex-info message
                          {:metabase.transforms.jobs/transform-failure true
                           :metabase.transforms.jobs/failures [{:metabase.transforms.jobs/transform transform
                                                                :metabase.transforms.jobs/message message}]}
                          e)))
        (throw e)))))

;;; ------------------------------------------------- Ordering Logic -------------------------------------------------

(defn safe-table-dependencies
  "Like `table-dependencies`, but returns `#{}` if the computation throws. Used by cycle
  detection where a single broken transform must not block the whole check. Callers that need
  to know *which* transforms failed should walk the graph themselves and capture the failure
  ids — see `transform-ordering`."
  [transform]
  (try
    (transforms-base.i/table-dependencies transform)
    (catch Throwable _ #{})))

(defn- output-table-map
  "Build a map of output-table-id -> transform-id. Transforms with a pre-resolved
  `:target_table_id` use that value directly. Remaining transforms are grouped by target
  database and resolved via each database's metadata provider by matching `:target :schema`
  + `:target :name` against synced tables."
  [transforms]
  (let [direct            (into {}
                                (keep (fn [{:keys [target_table_id id]}]
                                        (when target_table_id
                                          [target_table_id id])))
                                transforms)
        transforms-by-db  (->> transforms
                               (remove :target_table_id)
                               (keep (fn [transform]
                                       (when-let [db-id (transforms-base.i/target-db-id transform)]
                                         {db-id [transform]})))
                               (apply merge-with into))]
    (reduce-kv
     (fn [acc db-id db-transforms]
       (let [mp        (lib-be/application-database-metadata-provider db-id)
             table-map (into {}
                             (map (fn [{:keys [schema name id]}]
                                    [[schema name] id]))
                             (lib.metadata/tables mp))]
         (into acc
               (keep (fn [transform]
                       (when-let [output-table (table-map [(get-in transform [:target :schema])
                                                           (get-in transform [:target :name])])]
                         [output-table (:id transform)])))
               db-transforms)))
     direct
     transforms-by-db)))

(defn- target-ref-map
  "Build a map from [database_id schema table_name] -> transform_id for all transforms."
  [transforms]
  (into {}
        (map (fn [{:keys [id target]}]
               [[(:database target) (:schema target) (:name target)] id]))
        transforms))

(defn- resolve-dependency
  "Resolve a single dependency to a transform id, or nil if not resolvable.
  Used to map table/transform/table-ref dependencies to actual transform ids."
  [{:keys [table transform table-ref]} output-tables transform-ids target-refs]
  (or (output-tables table)
      (transform-ids transform)
      (when table-ref
        (let [{:keys [database_id schema table]} table-ref]
          (target-refs [database_id schema table])))))

(defn transform-ordering
  "Compute the execution ordering for the dependency closure of `start-ids`.

  Walks the dependency graph starting from `start-ids`, calling `table-dependencies` only on
  transforms it actually visits. `all-transforms` provides the resolution context: when a
  transform in the closure references a table produced by another transform, that producer is
  discovered by looking it up in lookup tables built from `all-transforms`. This is what makes
  cross-DB dependencies (e.g. Python transforms pulling from a database different from their
  target) resolve correctly.

  Per-transform `table-dependencies` failures are caught and treated as no dependencies, with
  the failing id captured in `:failed`. The ordering is a best-effort scheduling hint —
  execution-time checks (e.g. `throw-if-db-routing-enabled!`) are the source of truth for
  whether a transform can actually run. This means a single broken transform anywhere in the
  system can never poison the scheduler: it will simply be treated as a leaf in the closure
  (or skipped entirely if no caller depends on it), and any actual problem with running it
  will surface at execution time and be attributed to the transform that tried to run it.

  Returns a map:

      {:dependencies {transform-id -> #{transform-ids it depends on}}
       :not-found    #{ids in start-ids that don't refer to any transform in all-transforms}
       :failed       #{ids whose table-dependencies threw}}

  `:dependencies` is restricted to the transitive closure reachable from `start-ids`.
  Diagnostics in `:not-found` and `:failed` let the caller decide how to surface them
  (logging, metrics, error responses)."
  [start-ids all-transforms]
  (let [id->xf        (u/index-by :id all-transforms)
        output-tables (output-table-map all-transforms)
        target-refs   (target-ref-map all-transforms)
        all-ids       (into #{} (map :id) all-transforms)]
    (loop [visited   {}
           not-found #{}
           failed    #{}
           queue     (vec start-ids)]
      (if-let [id (first queue)]
        (cond
          (contains? visited id)
          (recur visited not-found failed (rest queue))

          (not (id->xf id))
          (recur visited (conj not-found id) failed (rest queue))

          :else
          (let [transform        (id->xf id)
                [raw-deps fail?] (try
                                   [(transforms-base.i/table-dependencies transform) false]
                                   (catch Throwable _ [#{} true]))
                resolved-ids     (into #{}
                                       (keep (fn [dep]
                                               (resolve-dependency dep output-tables all-ids target-refs)))
                                       raw-deps)]
            (recur (assoc visited id resolved-ids)
                   not-found
                   (cond-> failed fail? (conj id))
                   (into (rest queue) resolved-ids))))
        {:dependencies visited
         :not-found    not-found
         :failed       failed}))))

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
        db-transforms    (filter #(= (get-in % [:source :query :database]) db-id) transforms)
        output-tables    (output-table-map db-transforms)
        transform-ids    (into #{} (map :id) db-transforms)
        target-refs      (target-ref-map transforms)
        node->children   #(->> % transforms-by-id safe-table-dependencies
                               (keep (fn [dep] (resolve-dependency dep output-tables transform-ids target-refs))))
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
