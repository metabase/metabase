(ns metabase-enterprise.data-testing.test-util
  "Helpers shared by the data-testing tests."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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

(defn refusal
  "The `:error-type` and message of the refusal that `thunk` throws, with the entries of its ex-data under
  `data-keys`, or nil when `thunk` does not throw."
  [thunk & data-keys]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (merge {:error-type (:error-type (ex-data e))
              :message    (ex-message e)}
             (select-keys (ex-data e) data-keys)))))

(defn people-rows-input
  "A rows input standing in for `PUBLIC.PEOPLE`, declaring `column-names` as text, with no rows."
  [& column-names]
  {:table   {:schema "PUBLIC" :name "PEOPLE"}
   :format  :rows
   :columns (mapv (fn [column-name] {:name column-name :cast_type "VARCHAR"}) column-names)
   :rows    []})

(defn from-google-segment
  "Segment attributes for a segment on the people table: the people whose source is Google."
  []
  (let [mp (mt/metadata-provider)]
    {:name       "From Google"
     :table_id   (mt/id :people)
     :definition (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :people)))
                             (lib/= (lib.metadata/field mp (mt/id :people :source)) "Google"))}))

(def google-segment-inputs
  "Test inputs for a segment test of [[from-google-segment]]: a people table of one person from Google and one from
  Twitter."
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"} {:name "SOURCE" :cast_type "VARCHAR"}]
    :rows    [{"ID" 1 "SOURCE" "Google"} {"ID" 2 "SOURCE" "Twitter"}]}])

(def google-segment-expectations
  "Expectations for a segment test of [[from-google-segment]], which pass when the segment keeps only the person from
  Google."
  [{:type "empty" :name "only people from Google" :sql "SELECT * FROM {{output}} WHERE SOURCE <> 'Google'"}])

(defn segment-on
  "Segment attributes for a segment named `segment-name` on the table `table-id`, selecting every row."
  [table-id segment-name]
  (let [mp (mt/metadata-provider)]
    {:name       segment-name
     :definition (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                             (lib/= 1 1))}))

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

(defn add-members!
  "Insert `refs`, `[test-type entity-id]` pairs, as members of the suite `suite-id` at positions 0, 1, ..."
  [suite-id refs]
  (t2/insert! :model/TestSuiteMember (map-indexed (fn [i [test-type eid]]
                                                    {:suite_id suite-id :test_type test-type :test_entity_id eid :position i})
                                                  refs)))

(defn member-refs
  "The members of the suite `suite-id`, in order, as `[test-type test-entity-id]`."
  [suite-id]
  (into [] (t2/select-fn-vec (juxt :test_type :test_entity_id) :model/TestSuiteMember
                             {:where [:= :suite_id suite-id] :order-by [[:position :asc]]})))

(defn refusal-type
  "The `:error-type` of the typed refusal `thunk` throws, or nil when it does not throw. Rethrows any other exception."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (or (:error-type (ex-data e))
          (throw e)))))
