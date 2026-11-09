(ns ^:mb/driver-tests metabase-enterprise.data-testing.card-runner-test
  "Runs of saved card tests."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.executor :as data-testing.executor]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- table-ref
  "The `{:schema :name}` of a test-data table, as compiled SQL references it."
  [table-key]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id table-key))]
    {:schema schema :name name}))

(defn- qualified
  "`schema.name` of the test-data table `table-key`, for native SQL."
  [table-key]
  (let [{:keys [schema name]} (table-ref table-key)]
    (str schema "." name)))

(defn- table-query
  "An MBQL query of the test-data table `table-key`."
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(defn- column
  "The column of `query` for the field `table-key`.`field-key`, through an implicit join when it is on another table."
  [query table-key field-key]
  (let [field-id (mt/id table-key field-key)]
    (m/find-first #(= field-id (:id %)) (lib/visible-columns query))))

(defn- native-card
  "The columns of a card running `sql`."
  [sql]
  {:dataset_query (lib/native-query (mt/metadata-provider) sql)})

(defn- people-card
  "A native card selecting `id` and `name` from the people table."
  []
  (native-card (str "SELECT id, name FROM " (qualified :people))))

(def ^:private one-person
  "SELECT 1 AS id, 'abc' AS name")

(defn- people-input
  "An input standing in for the people table with the rows of `sql`."
  [sql]
  {:table (table-ref :people) :format :sql :sql sql})

(defn- id+name
  "The `id` and `name` columns of the output, typed as the current driver spells those types."
  []
  (let [[int-type text-type] (data-testing.test-util/cast-types)]
    [{:name "id" :cast_type int-type}
     {:name "name" :cast_type text-type}]))

(defn- run-card-test!
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

(defn- refusal
  "The `:error-type` and message of the refusal `thunk` throws, or nil when it does not throw."
  [thunk]
  (try
    (thunk)
    nil
    (catch ExceptionInfo e
      {:error-type (:error-type (ex-data e))
       :message    (ex-message e)})))

(defn- outcome!
  "The `:status` of the run of `card`'s test, or the `:error-type` of its refusal."
  [card inputs expectations]
  (try
    (:status (run-card-test! card inputs expectations))
    (catch ExceptionInfo e
      (:error-type (ex-data e)))))

(defn- card-run-ids
  "The ids of every persisted run of a card test."
  []
  (t2/select-pks-set :model/DataTestRun :test_type "card"))

(deftest native-card-expectations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (testing "expectations of a native card read its result set as `{{output}}`"
      (let [result (run-card-test! (people-card)
                                   [(people-input one-person)]
                                   [{:type :equals :name "equals passes" :format :rows
                                     :columns (id+name) :rows [{"id" 1 "name" "abc"}]}
                                    {:type :equals :name "equals fails" :format :rows
                                     :columns (id+name) :rows [{"id" 1 "name" "xyz"}]}
                                    {:type :empty :name "empty passes" :sql "SELECT * FROM {{output}} WHERE id <> 1"}
                                    {:type :empty :name "empty fails" :sql "SELECT * FROM {{ output }} WHERE id = 1"}])]
        (is (= :failed (:status result)))
        (is (= {"equals passes" :passed "equals fails" :failed "empty passes" :passed "empty fails" :failed}
               (into {} (map (juxt :name :status)) (:expectations result))))))
    (testing "a run passes when every expectation passes"
      (is (= :passed
             (:status (run-card-test! (people-card)
                                      [(people-input one-person)]
                                      [{:type :empty :name "only the input row" :sql "SELECT * FROM {{output}} WHERE id <> 1"}])))))))

(deftest model-and-metric-cards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [[int-type]  (data-testing.test-util/cast-types)
          orders      (table-query :orders)
          two-orders  {:table (table-ref :orders) :format :sql
                       :sql   "SELECT 1 AS id, 7 AS user_id UNION ALL SELECT 2 AS id, 8 AS user_id"}
          model       {:type          :model
                       :dataset_query (lib/with-fields orders [(column orders :orders :id)
                                                               (column orders :orders :user_id)])}
          metric      {:type          :metric
                       :dataset_query (lib/aggregate orders (lib/count))}]
      (testing "a model is the subject: its result set is the rows of its query"
        (is (= :passed
               (:status (run-card-test! model
                                        [two-orders]
                                        [{:type :equals :name "the input rows" :format :rows
                                          :columns [{:name "id" :cast_type int-type} {:name "user_id" :cast_type int-type}]
                                          :rows    [{"id" 1 "user_id" 7} {"id" 2 "user_id" 8}]}])))))
      (testing "a metric is the subject: its result set is its aggregation"
        (is (= :passed
               (:status (run-card-test! metric
                                        [two-orders]
                                        [{:type :equals :name "two orders" :format :rows
                                          :columns [{:name "count" :cast_type int-type}]
                                          :rows    [{"count" 2}]}]))))))))

(deftest card-on-a-persisted-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models :transforms/testing)
    (mt/with-persistence-enabled! [persist-models!]
      (let [orders     (table-query :orders)
            two-orders {:table (table-ref :orders) :format :sql
                        :sql   "SELECT 1 AS id, 7 AS user_id UNION ALL SELECT 2 AS id, 8 AS user_id"}
            no-other   [{:type :empty :name "only the input rows" :sql "SELECT * FROM {{output}} WHERE id NOT IN (1, 2)"}]]
        (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                   :database_id   (mt/id)
                                                   :dataset_query (lib/with-fields orders [(column orders :orders :id)
                                                                                           (column orders :orders :user_id)])}]
          (let [card-on-model {:dataset_query (let [mp (mt/metadata-provider)]
                                                (lib/query mp (lib.metadata/card mp model-id)))}]
            (testing "control: a card on a model that is not persisted runs the model's query on the inputs"
              (is (= :passed (outcome! card-on-model [two-orders] no-other))))
            (persist-models!)
            (is (= "persisted" (t2/select-one-fn :state :model/PersistedInfo :card_id model-id)))
            (testing "a card on a persisted model runs the model's query on the inputs, not the model's cache table"
              (is (= :passed (outcome! card-on-model [two-orders] no-other))))))))))

(defn- category-count-card
  "An MBQL card counting orders by the category of their product, through an implicit join to products."
  []
  (let [orders (table-query :orders)]
    {:dataset_query (-> orders
                        (lib/aggregate (lib/count))
                        (lib/breakout (column orders :products :category)))}))

(def ^:private two-orders-of-product-1
  {:format :sql :sql "SELECT 1 AS id, 1 AS product_id UNION ALL SELECT 2 AS id, 1 AS product_id"})

(def ^:private every-product-column
  ;; An implicit join selects every column of the joined table.
  (str "SELECT 1 AS id, 'e' AS ean, 't' AS title, 'Widget' AS category, 'v' AS vendor, 1.5 AS price,"
       " 4.5 AS rating, '2024-01-02' AS created_at"))

(deftest implicit-join-card-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [[int-type text-type] (data-testing.test-util/cast-types)
          orders-input         (assoc two-orders-of-product-1 :table (table-ref :orders))
          by-category          {:type :equals :name "two widgets" :format :rows
                                :columns [{:name "PRODUCTS__via__PRODUCT_ID__CATEGORY" :cast_type text-type}
                                          {:name "count" :cast_type int-type}]
                                :rows    [{"PRODUCTS__via__PRODUCT_ID__CATEGORY" "Widget" "count" 2}]}]
      (testing "passes with every column of the joined table in its input"
        (is (= :passed
               (:status (run-card-test! (category-count-card)
                                        [orders-input {:table (table-ref :products) :format :sql :sql every-product-column}]
                                        [by-category])))))
      (testing "an input with only the columns the card names cannot stand in for the joined table"
        (let [{:keys [error-type message]}
              (refusal #(run-card-test! (category-count-card)
                                        [orders-input {:table  (table-ref :products) :format :sql
                                                       :sql    "SELECT 1 AS id, 'Widget' AS category"}]
                                        [by-category]))]
          (is (= ::data-testing.errors/query-failed error-type))
          (testing "and the message names a column the input lacks"
            (is (re-find #"(?i)ean|title|vendor|price|rating|created_at" message)))))
      (testing "an expectation naming a column the output lacks lists the compiled column names"
        (let [[expectation] (:expectations
                             (run-card-test! (category-count-card)
                                             [orders-input {:table (table-ref :products) :format :sql :sql every-product-column}]
                                             [{:type :equals :name "by display name" :format :rows
                                               :columns [{:name "Category" :cast_type text-type}
                                                         {:name "count" :cast_type int-type}]
                                               :rows    [{"Category" "Widget" "count" 2}]}]))]
          (is (= :error (:status expectation)))
          (is (= ::data-testing.errors/unknown-column (get-in expectation [:error :type])))
          (is (re-find #"(?i)PRODUCTS__via__PRODUCT_ID__CATEGORY" (get-in expectation [:error :message])))
          (is (re-find #"(?i)\bcount\b" (get-in expectation [:error :message]))))))))

(deftest card-guards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (testing "Guard A: a card reading a table with no input is refused, naming that table, and no run is recorded"
      (let [runs-before                  (card-run-ids)
            {:keys [error-type message]} (refusal #(run-card-test! (category-count-card)
                                                                   [(assoc two-orders-of-product-1 :table (table-ref :orders))]
                                                                   [{:type :empty :name "e" :sql "SELECT * FROM {{output}}"}]))]
        (is (= ::data-testing.errors/missing-inputs error-type))
        (is (re-find (re-pattern (str "(?i)" (:name (table-ref :products)))) message))
        (is (= runs-before (card-run-ids)))))
    (testing "Guard B: an expectation reading a real table is refused"
      (is (= ::data-testing.errors/unremapped-reference
             (:error-type (refusal #(run-card-test! (people-card)
                                                    [(people-input one-person)]
                                                    [{:type :empty :name "reads orders"
                                                      :sql  (str "SELECT * FROM {{output}} o JOIN " (qualified :orders)
                                                                 " r ON o.id = r.id")}]))))))))

(deftest date-column-under-a-report-timezone-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (mt/with-report-timezone-id! "Asia/Tokyo"
      (let [orders    (table-query :orders)
            card      {:dataset_query (lib/with-fields orders [(column orders :orders :id)
                                                               (column orders :orders :created_at)])}
            timestamp (sql.qp/inline-value driver/*driver* (t/local-date-time 2024 1 2 23 30))
            result    (run-card-test! card
                                      [{:table  (table-ref :orders) :format :sql
                                        :sql    (str "SELECT 1 AS id, " timestamp " AS created_at")}]
                                      [{:type :empty :name "the input timestamp is unchanged"
                                        :sql  (str "SELECT * FROM {{output}} WHERE created_at <> " timestamp)}
                                       {:type :empty :name "control: the row is there"
                                        :sql  "SELECT * FROM {{output}} WHERE id = 1"}])]
        (testing "a timestamp in a card's output is the one in its input, whatever the report timezone"
          (is (= {"the input timestamp is unchanged" :passed "control: the row is there" :failed}
                 (into {} (map (juxt :name :status)) (:expectations result)))))))))

(defn- new-card-run
  "The one card-test run recorded since `runs-before`."
  [runs-before]
  (let [[run-id & more] (seq (set/difference (card-run-ids) runs-before))]
    (is (nil? more))
    (t2/select-one :model/DataTestRun :id run-id)))

(deftest card-run-is-persisted-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (mt/with-temp [:model/Card {card-id :id} (people-card)]
      (let [card (t2/select-one :model/Card :id card-id)
            run-saved (fn [inputs expectations]
                        (mt/with-temp [:model/CardTest {test-id :id} {:card_id      card-id
                                                                      :inputs       inputs
                                                                      :expectations expectations}]
                          (let [runs-before (card-run-ids)
                                result      (try
                                              (binding [api/*current-user-id* (mt/user->id :crowberto)]
                                                (data-testing.runner/run-test! :card card (t2/select-one :model/CardTest :id test-id)))
                                              (catch ExceptionInfo e
                                                (:error-type (ex-data e))))]
                            [test-id result (new-card-run runs-before)])))]
        (doseq [[outcome where expected] [["a pass" "id <> 1" :passed]
                                          ["a failure" "id = 1" :failed]]]
          (testing (str "the run of " outcome " is recorded under its test")
            (let [[test-id result run] (run-saved [(people-input one-person)]
                                                  [{:type :empty :name "check" :sql (str "SELECT * FROM {{output}} WHERE " where)}])]
              (is (= expected (:status result)))
              (is (=? {:test_type    :card
                       :test_id      test-id
                       :status       expected
                       :initiated_by (mt/user->id :crowberto)
                       :start_time   some?
                       :end_time     some?}
                      run)))))
        (testing "a refusal after the checks is recorded as an error"
          (let [[test-id error-type run] (run-saved [(people-input "SELECT * FROM card_test_input_that_does_not_exist")]
                                                    [{:type :empty :name "never reached" :sql "SELECT * FROM {{output}}"}])]
            (is (= ::data-testing.errors/setup-failed error-type))
            (is (=? {:test_type :card :test_id test-id :status :error :end_time some?}
                    run))))))))

(deftest temp-tables-are-dropped-after-the-card-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [created (atom #{})
          dropped (atom #{})
          create! (mt/original-fn #'data-testing.executor/create-temp-table!)
          drop!   (mt/original-fn #'data-testing.executor/drop-temp-table!)]
      (mt/with-dynamic-fn-redefs [data-testing.executor/create-temp-table! (fn [driver conn table query]
                                                                             (swap! created conj table)
                                                                             (create! driver conn table query))
                                  data-testing.executor/drop-temp-table!   (fn [driver conn table]
                                                                             (swap! dropped conj table)
                                                                             (drop! driver conn table))]
        (testing "a card whose SQL fails on the warehouse is refused as `query-failed`"
          (is (= ::data-testing.errors/query-failed
                 (:error-type (refusal #(run-card-test! (native-card (str "SELECT id, name, no_such_column FROM "
                                                                          (qualified :people)))
                                                        [(people-input one-person)]
                                                        [{:type :empty :name "never reached" :sql "SELECT * FROM {{output}}"}]))))))
        (testing "every temp table the run created is dropped"
          (is (seq @created))
          (is (set/subset? @created @dropped)))))))
