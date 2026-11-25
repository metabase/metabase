(ns metabase-enterprise.data-testing.test-util
  "Helpers shared by the data-testing tests."
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
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
  "The `{:schema :name}` of the test-data table `table-key` of the current driver, as compiled SQL references it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn qualified
  "`schema.name` of the test-data table `table-key`, for SQL, or `name` when the table has no schema."
  [table-key]
  (let [{:keys [schema name]} (table-ref table-key)]
    (if schema (str schema "." name) name)))

(defn table-query
  "An MBQL query of the test-data table `table-key`."
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(defn column
  "The column of `query` for the field `table-key`.`field-key`, through an implicit join when it is on another table."
  [query table-key field-key]
  (let [field-id (mt/id table-key field-key)]
    (m/find-first #(= field-id (:id %)) (lib/visible-columns query))))

(defn id+name
  "An `id` and a `name` column, typed as the current driver spells an integer and a text type."
  []
  (let [[int-type text-type] (cast-types)]
    [{:name "id" :cast_type int-type}
     {:name "name" :cast_type text-type}]))

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

(defn run-as-admin!
  "Runs `saved-test` of `subject`, a subject of `subject-type`, as an admin. A run checks whether the current user's
  connection is impersonated, so it needs a current user, as every API call has."
  [subject-type subject saved-test]
  (mt/with-test-user :crowberto
    (data-testing.runner/run-test! subject-type subject saved-test)))

(defn run-card-test!
  "Save `card`, a map of Card columns, and a CardTest of it with `inputs` and `expectations`, and run the test, started
  by crowberto."
  [card inputs expectations]
  (mt/with-temp [:model/Card     {card-id :id} card
                 :model/CardTest {test-id :id} {:card_id      card-id
                                                :inputs       inputs
                                                :expectations expectations}]
    (run-as-admin! :card
                   (t2/select-one :model/Card :id card-id)
                   (t2/select-one :model/CardTest :id test-id))))

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

(def google-segment-inputs
  "Test inputs for a segment test of [[from-google-segment]]: a people table of one person from Google and one from
  Twitter."
  [{:table   {:schema "public" :name "people"}
    :format  "rows"
    :columns [{:name "id" :cast_type "INTEGER"} {:name "source" :cast_type "VARCHAR"}]
    :rows    [{"id" 1 "source" "Google"} {"id" 2 "source" "Twitter"}]}])

(def google-segment-expectations
  "Expectations for a segment test of [[from-google-segment]], which pass when the segment keeps no person whose source
  is not Google."
  [{:type "empty" :name "only people from Google" :sql "SELECT * FROM {{output}} WHERE source <> 'Google'"}])

(defn segment-on
  "Segment attributes for a segment named `segment-name` on the table `table-id`, selecting every row."
  [table-id segment-name]
  (let [mp (mt/metadata-provider)]
    {:name       segment-name
     :definition (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                             (lib/= 1 1))}))

(defn empty-segment-definition!
  "Stores an empty definition on the segment `segment-id`, which the model refuses to save but older segments still
  have."
  [segment-id]
  (t2/query-one {:update :segment :set {:definition "{}"} :where [:= :id segment-id]}))

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
