(ns metabase-enterprise.semantic-layer-import.test-util.regenerate
  "What the fixture generators of every source share (see
  [[metabase-enterprise.semantic-layer-import.dbt.test-util.fixture]],
  [[metabase-enterprise.semantic-layer-import.dbt.test-util.marts]] and
  [[metabase-enterprise.semantic-layer-import.ossie.test-util.tpch]]): the check that a REPL runs from the repo root,
  which their relative paths assume, and the writer of a test dataset definition as EDN, in the format of
  `test/metabase/test/data/dataset_definitions/*.edn`, laid out one field definition and one row per line so that a
  regeneration's diff is only what changed."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def resources-dir
  "Where the import's test resources live, relative to the repo root."
  "enterprise/backend/test_resources/semantic_layer_import")

(mu/defn check-repo-root :- :nil
  "Throw unless the working directory is the repo root, which the generators' relative paths assume; a REPL started
  elsewhere would otherwise fail halfway, or write somewhere else."
  []
  (when-not (.isDirectory (io/file resources-dir))
    (throw (ex-info (format "%s is not under the working directory %s: run from the repo root"
                            resources-dir (System/getProperty "user.dir"))
                    {:user-dir (System/getProperty "user.dir")}))))

(mr/def ::field-definition
  "A column of a table in the dataset definition format: its name, base type, and whether it is the primary key or a
  foreign key to another table."
  [:map {:closed true}
   [:field-name :string]
   [:base-type  :keyword]
   [:pk?        {:optional true} :boolean]
   [:fk         {:optional true} :keyword]])

(mr/def ::row
  "One row of a table, its values in column order, each something `pr-str` writes as the EDN the dataset loader
  reads: a string, a number, a boolean, a `LocalDate` (printed as a `#t` literal) or nil."
  [:sequential [:any {::mr/deliberately-open true, :description "a cell value"}]])

(mr/def ::table-definition
  "A table in the dataset definition format: name, field definitions, rows."
  [:tuple :string [:sequential ::field-definition] [:sequential ::row]])

(mu/defn- edn-field-definition :- :string
  "One field definition of the dataset EDN, as one line."
  [{:keys [field-name base-type pk? fk]} :- ::field-definition]
  (str "{:field-name " (pr-str field-name) ", :base-type " base-type
       (when pk? ", :pk? true")
       (when fk (str ", :fk " fk))
       "}"))

(mu/defn- edn-table-definition :- :string
  "One table of the dataset EDN: one field definition and one row per line."
  [[table-name fields table-rows] :- ::table-definition]
  (str "[" (pr-str table-name) "\n"
       "  [" (str/join "\n   " (map edn-field-definition fields)) "]\n"
       "  [" (str/join "\n   " (map (fn [row] (str "[" (str/join ", " (map pr-str row)) "]")) table-rows)) "]]"))

(mu/defn edn-dataset :- :string
  "The dataset EDN for `table-definitions`, in the format of `test/metabase/test/data/dataset_definitions/*.edn`."
  [table-definitions :- [:sequential ::table-definition]]
  (str "[" (str/join "\n " (map edn-table-definition table-definitions)) "]\n"))

(mu/defn summary :- :string
  "A one-line summary of a written dataset for the REPL: the file and each table's row count."
  [out               :- :string
   table-definitions :- [:sequential ::table-definition]]
  (format "wrote %s: %s" out (str/join ", " (for [[table-name _ table-rows] table-definitions]
                                              (format "%s (%d rows)" table-name (count table-rows))))))
