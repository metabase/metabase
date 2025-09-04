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
    SELECT * FROM source_table_name WHERE type = 'gadget'; S
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
   [metabase-enterprise.mbml.parser :as parser]
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
   file-type-hint :- [:maybe parser/FileType]]
  (let [file-type (or file-type-hint :yaml)
        {:keys [metadata source]} (parser/extract-content content file-type)]
    (if metadata
      (let [parsed-data (parser/parse-yaml metadata)]
        (parser/validate-mbml parsed-data source))
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
          file-type (parser/detect-file-type file-path)]
      (when (= :unknown file-type)
        (throw (mbml.errors/format-unsupported-file-error file-path)))
      (when (str/blank? content)
        (throw (mbml.errors/format-file-error :empty-file-error file-path nil)))

      (parse-mbml-string content file-type))

    (catch java.io.FileNotFoundException e
      (throw (mbml.errors/format-file-error :file-not-found file-path e)))
    (catch java.io.IOException e
      (throw (mbml.errors/format-file-error :file-io-oerror file-path e)))))

(def ^:private entity-type->model
  {"model/Transform:v1" :model/Transform})

(defn mbml-file->model
  "Take an mbml file and write it to the appdb

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
  (let [{:keys [entity] :as loaded} (parse-mbml-file file-path)]
    ;; TODO(edpaget): for more complex models this will need to apply some kind of transformation
    ;; before writing to the database
    (t2/insert-returning-instance! (entity-type->model entity)
                                   (select-keys loaded [:name :description :source :target]))))
