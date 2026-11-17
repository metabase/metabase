(ns metabase-enterprise.data-testing.test-util
  "Helpers shared by the data-testing tests."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn cast-types
  "An integer and a text `cast_type` the current driver accepts as a `CAST` target.

  A test's declared types are raw SQL, so a fixture has to spell them the way the warehouse under test does."
  []
  (case driver/*driver*
    :mysql              ["SIGNED" "CHAR(50)"]
    :sqlserver          ["int" "nvarchar(50)"]
    ;; ClickHouse casts NULL only to a nullable type
    :clickhouse         ["Nullable(Int32)" "Nullable(String)"]
    :bigquery-cloud-sdk ["INT64" "STRING"]
    ["INTEGER" "VARCHAR(50)"]))

(def data-analyst-features
  "The premium features with which a data analyst can open transform tests."
  ;; advanced-permissions: the Data Analyst role only opens Data Studio while the plan includes it
  #{:advanced-permissions :transforms-basic :transforms-testing})

(defmacro with-transforms-enabled
  "Body with `features` licensed and the transforms setting on."
  [features & body]
  `(mt/with-premium-features ~features
     (mt/with-temporary-raw-setting-values [~'transforms-enabled "true"]
       ~@body)))

(defn id-transform
  "An MBQL transform selecting `ID` from the test table `table` into `PUBLIC.<TABLE>_SUMMARY`."
  [table]
  (let [mp (mt/metadata-provider)]
    {:source {:type  :query
              :query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                         (lib/with-fields [(lib.metadata/field mp (mt/id table :id))]))}
     :target {:type     "table"
              :schema   "PUBLIC"
              :name     (str (u/upper-case-en (name table)) "_SUMMARY")
              :database (mt/id)}}))

(defn categories-query
  "An MBQL query of the test-data `categories` table, for a model to hold actions on it."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :categories)))))

(defn renamed-categories
  "The rows of the real `categories` table named `category-name`. An action test that wrote the real table leaves one."
  [category-name]
  (mt/rows (mt/process-query (mt/native-query {:query  "SELECT id FROM categories WHERE name = ?"
                                               :params [category-name]}))))

(defn categories-table
  "The `{:schema :name}` of the test-data `categories` table."
  []
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :categories))]
    {:schema schema :name name}))

(defn categories-input
  "An input standing in for the `categories` table with categories 1 `Toy` and 2 `Food`."
  []
  (let [[int-type text-type] (cast-types)]
    {:table   (categories-table)
     :format  "rows"
     :columns [{:name "id" :cast_type int-type} {:name "name" :cast_type text-type}]
     :rows    [{"id" 1 "name" "Toy"} {"id" 2 "name" "Food"}]}))

(defn categories-named
  "An `empty` expectation that categories 1 and 2 are named `name-1` and `name-2`, and that there are no others."
  [name-1 name-2]
  {:type "empty"
   :name (str "1 is " name-1 " and 2 is " name-2)
   :sql  (let [{:keys [schema name]} (categories-table)]
           (format (str "SELECT * FROM %s.%s WHERE (id = 1 AND name <> '%s') OR (id = 2 AND name <> '%s')"
                        " OR id NOT IN (1, 2)")
                   schema name name-1 name-2))})
