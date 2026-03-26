(ns metabase.transforms-import.dbt.core
  "Core migration engine: orchestrates parsing, rewriting, and API calls
  to migrate dbt models into Metabase transforms."
  (:refer-clojure :exclude [select-keys])
  (:require
    [clojure.string :as str]
    [medley.core :as m]
    [metabase.transforms.core :as transforms]
    [metabase.transforms-import.dbt.manifest :as manifest-parser]
    [metabase.transforms-import.dbt.dependency-resolver :as dependency-resolver]
    [metabase.transforms-import.dbt.transform-sql-adapter :as transform-sql-adapter]
    [metabase.util.log :as log]
    [metabase.util.performance :refer [select-keys]]
    [toucan2.core :as t2]))

;; Configuration structure would be defined elsewhere
;; For now, we'll use a simple map structure

(defn- build-schema-remap [config]
  "Build schema remapping from config."
  (let [explicit-remap (:schema-remap config)
        prefix (:transform-schema-prefix config)]
    (if (and (empty? explicit-remap) (seq (:schema-mappings config)))
      (reduce (fn [acc mapping]
                (assoc acc (:metabase-schema mapping) (str prefix (:metabase-schema mapping))))
              {}
              (:schema-mappings config))
      explicit-remap)))

(defn- build-schema-overrides [config]
  "Build schema overrides for folder-based resolution."
  (let [prefix (:transform-schema-prefix config)]
    (reduce (fn [acc mapping]
              (assoc acc (:dbt-folder-pattern mapping) (str prefix (:metabase-schema mapping))))
            {}
            (:schema-mappings config))))

(defn- resolve-schema [model schema-overrides config]
  "Resolve the target schema for a model."
  (let [prefix (:transform-schema-prefix config)
        folder (:folder model)]
    (or (some (fn [[pattern schema]]
                (when (or (str/includes? folder pattern)
                          (= folder pattern)
                          (and (str/ends-with? pattern "/*")
                               (= folder (subs pattern 0 (dec (count pattern))))))
                  schema))
              schema-overrides)
        (when (and (:schema-name model)
                   (not= (:schema-name model) (:target-schema (:project config))))
          (str prefix (:schema-name model)))
        (str prefix (:default-schema (:metabase config))))))

(defn- resolve-folder [model config]
  "Resolve the folder path for a model."
  (if (:preserve-folder-structure config)
    (or (:folder model) "")
    (or (:folder-prefix config) "")))

(defn- resolve-tags [model config]
  "Resolve tags for a model."
  (let [tag-map (into {} (for [mapping (:tag-mappings config)]
                           [(:dbt-tag mapping) (:metabase-tag mapping)]))
        model-tags (set (map (fn [dbt-tag]
                              (if (contains? tag-map dbt-tag)
                                (get tag-map dbt-tag)
                                dbt-tag))
                             (:tags model)))
        default-tags (set (:default-tags config))]
    (if (empty? model-tags)
      default-tags
      model-tags)))

(defn- build-description [model]
  "Build description for a transform."
  (str/join "\n" (cond-> []
                         (:description model)
                         (conj (:description model))
                         :always
                         (conj (str "Migrated from dbt model: " (:id model)))
                         :always
                         (conj (str "Source: " (:path model)))
                         (not= "table" (:materialization model))
                         (conj (str "Original materialization: " (:materialization model)))
                         (seq (:depends-on-models model))
                         (conj (str "Dependencies: " (str/join ", " (:depends-on-models model)))))))

(defn- build-migration-plan [project execution-order config]
  "Build the migration plan from project and config."
  (let [name->model              (m/index-by :name (vals (:id->model project)))
        schema-remap             (build-schema-remap config)
        schema-overrides         (build-schema-overrides config)
        transform-default-schema (str (:transform-schema-prefix config)
                                      (:default-schema (:metabase config)))
        transforms               (reduce (fn [acc model-name]
                                           (let [model (get name->model model-name)]
                                             (cond
                                               (get-in model [:config :is_seed])
                                               (do
                                                 (log/infof "Seed '%s' already exists as a database table, skipping" (:name model))
                                                 (update acc :skipped-models conj [(:name model) "Seed -- already exists as a database table"]))

                                               (get-in model [:config :is_snapshot])
                                               (do
                                                 (log/infof "Snapshot '%s' managed by dbt, not migrated" (:name model))
                                                 (update acc :skipped-models conj [(:name model) "Snapshot (SCD2) -- managed by dbt, not migrated"]))

                                               :else
                                               (let [[adapted-sql warnings] (transform-sql-adapter/adapt
                                                                              model
                                                                              schema-remap
                                                                              transform-default-schema
                                                                              (:transform-schema-prefix config))
                                                     schema (resolve-schema model schema-overrides config)
                                                     folder (resolve-folder model config)
                                                     tags   (resolve-tags model config)]
                                                 (-> acc
                                                     (update :transforms conj {:name                (:name model)
                                                                               :query               adapted-sql
                                                                               :database-id         (:database_id (:metabase config))
                                                                               :schema-name         schema
                                                                               :table-name          (or (:alias model) (:name model))
                                                                               :description         (build-description model)
                                                                               :folder              folder
                                                                               :tags                (vec tags)
                                                                               :incremental?        (= "incremental" (:materialization model))
                                                                               :checkpoint-column   (get-in config [:checkpoint-columns (:name model)])
                                                                               :transform-id        nil
                                                                               :dbt-model-unique-id (:id model)})
                                                     (update :warnings into (map (fn [w] (str "[" (:name model) "] " w))
                                                                                 warnings))
                                                     (update :tags into tags))))))
                                         {}
                                         execution-order)]
    {:transforms      (vec (:transforms transforms))
     :tags            (vec (sort (:tags transforms)))
     :jobs            (vec (map #(select-keys % [:name :schedule :tags]) (:jobs config)))
     :execution-order execution-order
     :skipped-models  (vec (:skipped-models transforms))
     :warnings        (vec (:warnings transforms))}))

(defn- log-migration-plan-summary [plan]
  "Log summary of the migration plan."
  (log/infof "-" (apply str (repeat 40 "-")))
  (log/infof "MIGRATION PLAN SUMMARY")
  (log/infof "-" (apply str (repeat 40 "-")))
  (log/infof "Transforms to create: %d" (count (:transforms plan)))
  (log/infof "Tags to create: %d" (count (:tags plan)))
  (log/infof "Jobs to create: %d" (count (:jobs plan)))
  (log/infof "Skipped models: %d" (count (:skipped-models plan))))

(defn- create-folder
  [folder]
  (let [collections (t2/select :model/Collection
                               :namespace "transforms")]
    (reduce (fn [parent-id part]
              (if-let [{:keys [id]} (m/find-first (every-pred (comp #{part} :name)
                                                              #(= parent-id (:parent-id %)))
                                                  collections)]
                id
                (t2/insert-returning-pk!
                  :model/Collection
                  {:name      part
                   :namespace "transforms"
                   :parent-id parent-id})))
            nil
            (str/split folder #"/"))))

(defn- create-transform!
  [transform]
  (let [collection-id (when-let [folder (not-empty (:folder transform))]
                        (create-folder folder))]
    (transforms/create-transform! {:name          (:name transform)
                                   :database_id   (:database-id transform)
                                   :collection_id collection-id
                                   :description   (:description transform)
                                   :source        {:type  "query"
                                                   :query {:database (:database-id transform)
                                                           :type     "native"
                                                           :native   {:query (:query transform)}}}
                                   :target        {:type   "table"
                                                   :schema (:schema-name transform)
                                                   :name   (:table-name transform)}})))

(defn- execute-plan
  [plan]
  (let [name->existing-transform (into {} (map (juxt :name identity) (transforms/get-transforms)))]
    (doseq [transform (:transforms plan)]
      (when-let [existing (name->existing-transform (:name transform))]
        (log/warnf "DELETING EXISTING")
        ;; config.on_conflict = "replace"
        (transforms/delete-transform! existing))))
  (update plan :transforms (fn [transforms]
                             (doall (for [transform transforms]
                                      (assoc transform :transform-id (:id (create-transform! transform))))))))

(defn migrate [config manifest]
  "Main migration function."
  (log/infof "=" (apply str (repeat 60 "=")))
  (log/infof "dbt -> Metabase Transforms Migration")
  (log/infof "=" (apply str (repeat 60 "=")))
  (try
    (log/infof "Step 1/6: Parsing dbt manifest...")
    (let [project (manifest-parser/parse-manifest manifest)
          _ (log/infof "Step 2/6: Resolving model dependencies...")
          graph (dependency-resolver/build-graph project)
          ;; Trust dbt that the model graph of `project` is acyclic:
          layers (dependency-resolver/topological-sort graph)
          execution-order (flatten layers)
          _ (log/infof "Execution plan: %d models in %d layers" (count execution-order) (count layers))
          _ (log/infof "Step 3/6: Building migration plan...")
          plan (build-migration-plan project execution-order config)
          _ (log-migration-plan-summary plan)]
      (if (:dry-run config)
        (do
          (log/infof "DRY RUN -- skipping execution. Plan saved.")
          plan)
        (do
          (log/infof "Step 4/6: Executing migration plan...")
          (let [plan-with-transform-ids (execute-plan plan)]
            (log/infof "Step 5/6: Running transforms in dependency order..."))
            ;; TODO: Implement transform execution
          (log/infof "Step 6/6: Migration complete!")
          plan)))))
