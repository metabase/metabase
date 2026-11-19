(ns metabase-enterprise.data-testing.test-util
  "Helpers shared by the data-testing tests."
  (:require
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase.api.common :as api]
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

(defn table-ref
  "The `{:schema :name}` of the test-data table `table-key`, as compiled SQL names it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn qualified
  "`schema.name` of the test-data table `table-key`, for SQL."
  [table-key]
  (let [{:keys [schema name]} (table-ref table-key)]
    (str schema "." name)))

(defn id+name
  "An `id` and a `name` column, typed as the current driver spells an integer and a text type."
  []
  (let [[int-type text-type] (cast-types)]
    [{:name "id" :cast_type int-type}
     {:name "name" :cast_type text-type}]))

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

(defn run-card-test!
  "Save `card`, a map of Card columns, and a CardTest of it with `inputs` and `expectations`, and run the test, started
  by crowberto."
  [card inputs expectations]
  (mt/with-temp [:model/Card     {card-id :id} card
                 :model/CardTest {test-id :id} {:card_id      card-id
                                                :inputs       inputs
                                                :expectations expectations}]
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (data-testing.runner/run-test! :card
                                     (t2/select-one :model/Card :id card-id)
                                     (t2/select-one :model/CardTest :id test-id)))))

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
