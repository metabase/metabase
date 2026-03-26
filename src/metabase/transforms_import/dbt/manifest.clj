(ns metabase.transforms-import.dbt.manifest
  "Parse a compiled dbt manifest.json into DbtProject models."
  (:require
    [clojure.pprint :as pprint]
    [clojure.string :as str]
    [metabase.util.log :as log]))

(defn- extract-project [manifest]
  "Extract project metadata from manifest."
  (let [metadata      (:metadata manifest {})
        project-name  (or (:project_name metadata)
                          (:project_id metadata)
                          "unknown")
        target-schema (loop [nodes  (vals (:nodes manifest {}))
                             result "public"]
                        (if-let [node (first nodes)]
                          (if (= (:resource_type node) "model")
                            (recur (rest nodes) (or (:schema node) "public"))
                            (recur (rest nodes) result))
                          result))]
    {:project-name  project-name
     :version       (:dbt_version metadata "0.0.0")
     :model-path    ["models"]
     :target-schema target-schema
     :id->model     {}
     :sources       {}
     :vers          {}}))

(defn- node->model
  [node]
  #_(clojure.pprint/pprint {"NODE" node})
  (let [compiled-sql       (or (:compiled_code node)
                               (:compiled_sql node)
                               "")
        raw-sql            (or (:raw_code node)
                               (:raw_sql node)
                               "")
        materialization    (:materialized (:config node) "table")
        columns            (vec (map (fn [[col-name col-data]]
                                       (let [tests (vec (map (fn [test]
                                                               (if (string? test)
                                                                 test
                                                                 (first (keys test))))
                                                             (:tests col-data [])))]
                                         {:name        col-name
                                          :description (:description col-data "")
                                          :tests       tests}))
                                     (:columns node {})))
        depends-on-models  (vec (map (fn [dep-id]
                                       (let [parts (str/split dep-id #"\.")]
                                         (when (and (>= (count parts) 3)
                                                    (#{"model" "seed" "snapshot"} (first parts)))
                                           (last parts))))
                                     (filter some? (:nodes (:depends_on node) []))))
        depends-on-sources (vec (map (fn [dep-id]
                                       (let [parts (str/split dep-id #"\.")]
                                         (when (and (>= (count parts) 3)
                                                    (= "source" (first parts)))
                                           [(if (> (count parts) 2) (nth parts 2) (nth parts 1))
                                            (:name node "")])))
                                     (filter some? (:nodes (:depends_on node) []))))
        folder             (let [file-path (or (:original_file_path node)
                                               (:path node)
                                               "")]
                             (str/join "/" (drop-while #{"models" "model"} (str/split file-path #"/"))))]
    {:id                 (:unique_id node)
     :name               (:name node)
     :path               (or (:original_file_path node) (:path node) "")
     :raw-sql            raw-sql
     :compiled-sql       compiled-sql
     :materialization    materialization
     :schema-name        (:schema node)
     :database           (:database node)
     :alias              (:alias node)
     :tags               (vec (:tags node []))
     :description        (:description node "")
     :columns            columns
     :depends-on-models  depends-on-models
     :depends-on-sources depends-on-sources
     :config             (:config node {})
     :folder             folder}))

(defn- extract-models [manifest project]
  "Extract model definitions from manifest."
  (let [nodes (:nodes manifest {})]
    #_(println "MANIFEST" manifest (:nodes manifest) nodes))
  (assoc project :id->model (into {} (for [node (filter (comp #{"model"} :resource_type)
                                                        (vals (:nodes manifest)))]
                                       [(:unique_id node) (node->model node)]))))

(defn- extract-sources [manifest project]
  "Extract source definitions from manifest."
  (let [sources (:sources manifest {})]
    (reduce (fn [project [source-id source-node]]
              (let [source-name  (:source_name source-node "")
                    existing     (:sources project {})
                    data (get existing source-name
                             {:name source-name
                              :schema (:schema source-node source-name)
                              :database (:database source-node)
                              :tables []})
                    updated-data (update data :tables conj
                                         {:name       (:name source-node "")
                                          :identifier (:identifier source-node)})]
                (assoc project :sources (assoc existing source-name updated-data))))
            project
            sources)))

(defn- finalize-sources [project]
  "Convert source data to DbtSource maps."
  (let [sources-data (:sources project {})]
    (reduce (fn [project [name data]]
              (assoc-in project [:sources name]
                        {:name        name
                         :schema-name (:schema data)
                         :database    (:database data)
                         :tables      (vec (:tables data))}))
            project
            sources-data)))

(defn- extract-seeds [manifest project]
  "Extract seed definitions from manifest."
  (let [nodes           (:nodes manifest {})
        existing-models (:id->model project)]
    (reduce (fn [project [node-id node]]
              (if (= (:resource_type node) "seed")
                (let [model-name     (:name node)
                      name-conflict? (some (fn [[_ model]] (= (:name model) model-name)) existing-models)]
                  (if name-conflict?
                    (do
                      (log/debugf "Seed '%s' shadowed by existing model, skipping" model-name)
                      project)
                    (let [seed-schema (:schema node "seeds")]
                      (assoc-in project [:id->model (:unique_id node)]
                                {:id                 (:unique_id node)
                                 :name               model-name
                                 :path               (or (:original_file_path node) (:path node) "")
                                 :raw-sql            ""
                                 :compiled-sql       ""
                                 :materialization    "table"
                                 :schema-name        seed-schema
                                 :database           (:database node)
                                 :alias              (:alias node)
                                 :tags               (vec (:tags node []))
                                 :description        (str "dbt seed: " model-name)
                                 :columns            {:is_seed true}
                                 :depends-on-models  []
                                 :depends-on-sources []
                                 :config             {}
                                 :folder             ""}))))
                project))
            project
            nodes)))

(defn- extract-snapshots [manifest project]
  "Extract snapshot definitions from manifest."
  (let [nodes (:nodes manifest {})
        existing-models (:id->model project)]
    (reduce (fn [project [node-id node]]
              (if (= (:resource_type node) "snapshot")
                (let [model-name (:name node)
                      name-conflict? (some (fn [[_ model]] (= (:name model) model-name)) existing-models)]
                  (if name-conflict?
                    (do
                      (log/debugf "Snapshot '%s' shadowed by existing model, skipping" model-name)
                      project)
                    (let [snapshot-schema (:schema node "snapshots")]
                      (assoc-in project [:id->model (:unique_id node)]
                                {:id                 (:unique_id node)
                                 :name               model-name
                                 :path               (or (:original_file_path node) (:path node) "")
                                 :raw-sql            (or (:raw_sql node) (:raw_code node) "")
                                 :compiled-sql       ""
                                 :materialization    "table"
                                 :schema-name        snapshot-schema
                                 :database           (:database node)
                                 :alias              (:alias node)
                                 :tags               (vec (:tags node []))
                                 :description        (str "dbt snapshot: " model-name)
                                 :columns            {"is_snapshot" true}
                                 :depends-on-models  []
                                 :depends-on-sources []
                                 :config             {}
                                 :folder             ""}))))
                project))
            project
            nodes)))

(defn- resolve-dependencies [project]
  "Validate that all model dependencies exist."
  (let [model-names (set (map :name (vals (:id->model project))))]
    (doseq [model (vals (:id->model project))]
      (doseq [dep (:depends-on-models model)]
        (when (not (contains? model-names dep))
          (log/warnf "Model '%s' references '%s' which was not found in the project"
                    (:name model) dep))))
    project))

(defn parse-manifest [manifest]
  "Parse a dbt manifest.json file into a DbtProject."
  (pprint/pprint manifest)
  (let [project        (->> (extract-project manifest)
                            (extract-models manifest)
                            (extract-sources manifest)
                            (finalize-sources)
                            (extract-seeds manifest)
                            (extract-snapshots manifest)
                            (resolve-dependencies))
        seed-count     (count (filter (fn [[_ model]] (:is_seed (:config model))) (:id->model project)))
        snapshot-count (count (filter (fn [[_ model]] (:is_snapshot (:config model))) (:id->model project)))
        model-count    (- (count (:id->model project)) seed-count snapshot-count)]
    (log/infof "Parsed %d models, %d seeds, %d snapshots, and %d sources from manifest (project '%s')"
              model-count seed-count snapshot-count (count (:sources project)) (:name project))
    project))
