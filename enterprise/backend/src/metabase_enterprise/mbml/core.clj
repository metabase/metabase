(ns metabase-enterprise.mbml.core
  "mbml is a file format for creating human readable files that can be loaded into metabase
  allowing users to manage important metabase entities using version control independently
  from specific metabase instances.

  mbml is written either as a YAML file or as front-matter to Python or SQL files all of the
  following are equivalent ways to declare the same transform.

  ```yaml
  entity: model/Transform:v1
  name: My Coole Transform
  identifier: my-coole-transform
  description: Only making the most legit changes
  tags:
  - hourly
  database: db-name
  target: my_taget_table
  source: | #sql
    SELECT * FROM source_table_name WHERE type = 'gadget';
  ```

  ```sql
  -- METABSE_BEGIN
  -- entity: model/Transform:v1
  -- name: My Coole Transform
  -- identifier: my-coole-transform
  -- description: Only making the most legit changes
  -- tags:
  -- - hourly
  -- database: db-name
  -- target: my_taget_table
  -- METABASE_END

  SELECT * FROM source_table_name WHERE type = 'gadget';
  ```

  ```python
  # METABASE_BEGIN
  # entity: model/Transform:v1
  # name: My Coole Transform
  # identifier: my-coole-transform
  # description: Only making the most legit changes
  # tags:
  # - hourly
  # database: db-name
  # target: my_taget_table
  # METABASE_END
  import pandas as pd

  df = pd.read_csv(\"source.csv\")
  df[df[\"type\"] == 'gadget']
  ```
  "
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [metabase-enterprise.mbml.errors :as mbml.errors]
   [metabase-enterprise.mbml.parser :as mbml.parser]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

 ;;; ------------------------------------------ Main Parser API -----------------------------------------------

(mu/defn parse-mbml-string :- :map
  "Parse MBML content from a string with optional file type hint.

  Takes content string and optional file type hint, parses and validates the MBML.
  This is the main public API function for parsing MBML content directly from strings.

  Args:
    content: MBML content as string
    file-type-hint: Optional keyword file type (:yaml, :sql, :python) to override detection

  Returns:
    Validated MBML entity map or throws exception on error

  Example:
    (parse-mbml-string yaml-content :yaml)
    (parse-mbml-string sql-with-frontmatter :sql)"
  [content :- ms/NonBlankString
   file-type-hint :- [:maybe mbml.parser/FileType]]
  (let [file-type (or file-type-hint :yaml)
        {:keys [metadata body]} (mbml.parser/extract-content content file-type)]
    (if metadata
      (let [parsed-data (mbml.parser/parse-yaml metadata)]
        (mbml.parser/validate-mbml parsed-data body))
      (throw (ex-info "No MBML metadata found in content"
                      {:type :no-metadata-error
                       :content-preview (subs content 0 (min 200 (count content)))
                       :file-type file-type})))))

(mu/defn parse-mbml-file :- :map
  "Parse MBML file from disk, detecting type, parsing and validating.

  Reads file from disk, detects file type from extension, extracts and parses MBML content,
  and validates against schema. This is the main public API function for parsing MBML files.

  Args:
    file-path: Path to MBML file (string)

  Returns:
    Validated MBML entity map or throws exception on error

  Throws :
    Exception for file reading errors, parse errors, or validation errors

  Example:
    (parse-mbml-file \"/path/to/transform.yaml\")
    (parse-mbml-file \"/path/to/transform.sql\")"
  [file-path :- ms/NonBlankString]
  (try
    (when-not (fs/exists? file-path)
      (throw (mbml.errors/format-file-error :file-not-found file-path nil)))

    (let [content (slurp file-path)
          file-type (mbml.parser/detect-file-type file-path)]
      (when (= :unknown file-type)
        (throw (mbml.errors/format-unsupported-file-error file-path)))
      (when (str/blank? content)
        (throw (mbml.errors/format-file-error :empty-file-error file-path nil)))

      (binding [mbml.parser/*file* file-path]
        (parse-mbml-string content file-type)))

    (catch java.io.FileNotFoundException e
      (throw (mbml.errors/format-file-error :file-not-found file-path e)))
    (catch java.io.IOException e
      (throw (mbml.errors/format-file-error :file-io-oerror file-path e)))))

(def ^:private entity-type->model
  {"model/Transform:v1" :model/Transform})

(defmulti save-model!
  "Impl for multi-entity dispatch for mbml-file->model. Implement to support versioned
  deserialization of a model from an mbml-parsed entity map."
  {:arglists '([entity model existing-entity])}
  (fn [entity model _existing-entity] (keyword entity)))

(defmulti mbml-file->unsaved-model*
  "Transformer for mbml-files into content that can be saved as a metabase model

  Args:
    mbml-map: parsed and validated mbml map

  Returns:
    map of the model that can be inserted or updated into the appdb

  Raises:
    ex-info objects when given data that cannot be transformed."
  {:arglists '([mbml-map])}
  (fn [{:keys [entity]}] (keyword entity)))

(defmethod mbml-file->unsaved-model* :default
  [{:keys [identifier] :as mbml-map}]
  (-> mbml-map
      (assoc :library_identifer identifier)
      (dissoc :identifier :entity)))

(defmethod save-model! :default
  [entity model {existing-entity-id :id}]
  (let [model-kw (entity-type->model entity)]
    (if existing-entity-id
      (do (t2/update! model-kw :id existing-entity-id model)
          (t2/select-one model-kw))
      (t2/insert-returning-instance! model-kw model))))

(defn- update-source-query
  [{:keys [source body] :as model} database-id]
  (assoc model :source {:type "query"
                        :query (lib/native-query (lib.metadata.jvm/application-database-metadata-provider database-id) (or body source))}))

(defmethod mbml-file->unsaved-model* :model/Transform:v1
  [{:keys [tags database identifier] :as mbml-map}]
  (let [tag-ids (t2/select-pks-vec :model/TransformTag :name [:in tags])
        database-id (t2/select-one-pk :model/Database :name database)]
    (when-not (= (count tag-ids) (count (set tags)))
      (throw (mbml.errors/format-model-transformation-error :missing-tags :model/Transform mbml-map mbml.parser/*file*)))
    (when-not database-id
      (throw (mbml.errors/format-model-transformation-error :database-id :model/Transform mbml-map mbml.parser/*file*)))
    (-> mbml-map
        (assoc :library_identifier identifier)
        (update-source-query database-id)
        (dissoc :entity :tags :body :identifier :database)
        (assoc :tag_ids tag-ids))))

;; TODO(edpaget): Probably belongs in the transform module
(defmethod save-model! :model/Transform:v1
  [_ model {existing-entity-id :id}]
  (if existing-entity-id
    (transforms/update-transform! existing-entity-id model)
    (transforms/create-transform! model)))

(defn mbml-file->unsaved-model
  "Take an mbml file and create a model that could be saved to the database

  Implment the mbml-file->unsaved-model* multimethod to have it support a new entity-type.

  Args:
    file-path: Path to MBML file (string)

  Returns:
    tuple of entity, identifier, and map compatible with a saved toucan entity

  Raises:
    Exception for file reading errors, parse errors, or validation errors

  Example:
    (mbml-file->model \"/path/to/transform.yaml\")
    (mbml-file->model \"/path/to/transform.sql\")"
  [file-path]
  (binding [mbml.parser/*file* file-path]
    (let [{:keys [identifier entity] :as mbml-map} (parse-mbml-file file-path)]
      [entity identifier (mbml-file->unsaved-model* mbml-map)])))

(defn mbml-file->model
  "Take an mbml file and write it to the appdb.

  Implment the mbml-file->model* multimethod to have it support a new entity-type.

  Args:
    file-path: Path to MBML file (string)

  Returns:
    A toucan instance

  Throws :
    Exception for file reading errors, parse errors, or validation errors

  Example:
    (mbml-file->model \"/path/to/transform.yaml\")
    (mbml-file->model \"/path/to/transform.sql\")"
  [file-path]
  (binding [mbml.parser/*file* file-path]
    (let [[entity identifier model] (mbml-file->unsaved-model file-path)
          existing-entity (t2/select-one (entity-type->model entity) :library_identifier identifier)]
      (try
        (save-model! entity model existing-entity)
        (catch Exception e
          (throw (mbml.errors/format-model-transformation-error :default :model/Transform model mbml.parser/*file* e)))))))

(mu/defn mbml-files->models :- [:sequential :map]
  "Load multiple MBML files transactionally and clean up orphaned models.

  Processes all files within a single transaction, creating or updating models
  based on their library_identifier. After loading, removes any models with
  library_identifier values that don't match the loaded files.

  Args:
    file-paths: Collection of paths to MBML files

  Returns:
    Collection of created/updated model instances

  Raises:
    Exception if any file fails to load (entire transaction rolls back)

  Example:
    (mbml-files->models [\"transform1.yaml\" \"transform2.sql\"])"
  [file-paths :- [:sequential ms/NonBlankString]]
  (t2/with-transaction []
    (let [models (mapv mbml-file->model file-paths)
          loaded-identifiers (into #{}
                                   (keep :library_identifier)
                                   models)]

      (doseq [model-type (vals entity-type->model)]
        (when (seq loaded-identifiers)
          ;; Delete models with library_identifier not in loaded set
          ;; Models without library_identifier (nil) are preserved
          (t2/delete! model-type
                      {:where [:and
                               [:not-in :library_identifier loaded-identifiers]
                               [:not= :library_identifier nil]]})))

      ;; Return the loaded models
      models)))
