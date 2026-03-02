(ns metabase.transforms.ordering
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.namespaces :as shared.ns]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Re-export pure graph algorithms from transforms-base for backwards compatibility.
(shared.ns/import-fns
 [metabase.transforms-base.ordering
  find-cycle
  available-transforms])

(defn- database-routing-error-ex-data [^Throwable e]
  (when e
    (if (:database-routing-enabled (ex-data e))
      (ex-data e)
      (recur (.getCause e)))))

(defmethod transforms.i/table-dependencies :query
  [{:keys [source] :as transform}]
  (try
    (let [query (-> (:query source)
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
              (lib/all-source-table-ids query))))
    (catch clojure.lang.ExceptionInfo e
      (if-some [data (database-routing-error-ex-data e)]
        (let [message (i18n/trs "Failed to run transform because the database {0} has database routing turned on. Running transforms on databases with db routing enabled is not supported." (:database-name data))]
          (throw (ex-info message
                          {:metabase.transforms.jobs/transform-failure true
                           :metabase.transforms.jobs/failures [{:metabase.transforms.jobs/transform transform
                                                                :metabase.transforms.jobs/message message}]}
                          e)))
        (throw e)))))

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
  "Computes an 'ordering' of a given list of transforms.

  The result is a map of transform id -> #{transform ids the transform depends on}. Dependencies are limited to just
  the transforms in the original list -- if a transform depends on some transform not in the list, the 'extra'
  dependency is ignored. Both query and Python transforms can have dependencies on tables produced by other transforms."
  [transforms]
  (let [;; Group all transforms by their database, skipping transforms with no target db
        transforms-by-db (->> transforms
                              (keep (fn [transform]
                                      (when-let [db-id (transforms.i/target-db-id transform)]
                                        {db-id [transform]})))
                              (apply merge-with into))
        transform-ids    (into #{} (map :id) transforms)
        target-refs      (target-ref-map transforms)
        {:keys [output-tables
                dependencies]} (->> transforms-by-db
                                    (map (mu/fn [[db-id db-transforms] :- [:tuple
                                                                           [:maybe ::lib.schema.id/database]
                                                                           [:maybe [:sequential :any]]]]
                                           (let [mp (lib-be/application-database-metadata-provider db-id)]
                                             {:output-tables (output-table-map mp db-transforms)
                                              :dependencies  (dependency-map db-transforms)})))
                                    (apply merge-with merge))]
    ;; Transforms without a target database are invalid and shouldn't form part of the dependency graph.
    ;; Give them empty dependency sets so they don't interfere with ordering.
    (into (zipmap (map :id transforms) (repeat #{}))
          (update-vals dependencies
                       (fn [deps]
                         (into #{}
                               (keep (fn [dep]
                                       (resolve-dependency dep output-tables transform-ids target-refs)))
                               deps))))))

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
        target-refs      (target-ref-map transforms)
        node->children   #(->> % transforms-by-id transforms.i/table-dependencies
                               (keep (fn [dep] (resolve-dependency dep output-tables transform-ids target-refs))))
        id->name         (comp :name transforms-by-id)
        cycle            (transforms-base.ordering/find-cycle node->children [transform-id])]
    (when cycle
      {:cycle-str (str/join " -> " (map id->name cycle))
       :cycle     cycle})))
