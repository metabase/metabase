(ns metabase-enterprise.data-testing.test-util
  "Helpers shared by the data-testing tests."
  (:require
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

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
  "The `{:schema :name}` of the test-data table `table-key` of the current driver, as compiled SQL references it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn data-test-drivers
  "The test drivers that run data tests: every driver with `:transforms/testing` but H2, which data tests refuse until
  VER-182."
  []
  (disj (mt/normal-drivers-with-feature :transforms/testing) :h2))

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
  "A rows input standing in for Postgres's `public.people`, declaring `column-names` as text, with no rows."
  [& column-names]
  {:table   {:schema "public" :name "people"}
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
  "An MBQL transform selecting `id` from the test table `table` into Postgres's `public.<table>_summary`."
  [table]
  (let [mp (mt/metadata-provider)]
    {:source {:type  :query
              :query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                         (lib/with-fields [(lib.metadata/field mp (mt/id table :id))]))}
     :target {:type     "table"
              :schema   "public"
              :name     (str (name table) "_summary")
              :database (mt/id)}}))

(defn run-as-admin!
  "Runs `saved-test` of `subject`, a subject of `subject-type`, as an admin. A run checks whether the current user's
  connection is impersonated, so it needs a current user, as every API call has."
  [subject-type subject saved-test]
  (mt/with-test-user :crowberto
    (data-testing.runner/run-test! subject-type subject saved-test)))

(defn refusal-type
  "The `:error-type` of the typed refusal `thunk` throws, or nil when it does not throw. Rethrows any other exception."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (or (:error-type (ex-data e))
          (throw e)))))
