(ns ^:mb/driver-tests metabase-enterprise.data-testing.now-test
  "Runs of tests that set `now`, the moment that stands for the current time while the subject compiles."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
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

(def ^:private now
  "The `now` of every test here: years before the day the tests run, so a row the real clock selects is a row the
  pinned clock does not."
  "2020-06-17T12:00:00Z")

(defn- pinned+
  "The pinned moment shifted by `amount` of `unit` (`:days` or `:hours`)."
  [amount unit]
  (t/plus (t/offset-date-time now) (t/duration amount unit)))

(defn- real+
  "The real current moment, rounded down to the hour, shifted by `amount` of `unit`."
  [amount unit]
  (t/plus (t/truncate-to (t/offset-date-time) :hours) (t/duration amount unit)))

(defn- orders-query
  "An MBQL query of the orders table that returns its `id` and `created_at`."
  []
  (let [mp     (mt/metadata-provider)
        orders (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
    (lib/with-fields orders [(lib.metadata/field mp (mt/id :orders :id))
                             (lib.metadata/field mp (mt/id :orders :created_at))])))

(defn- created-at
  "The `created_at` column of the orders table."
  []
  (lib.metadata/field (mt/metadata-provider) (mt/id :orders :created_at)))

(defn- orders-input
  "An input standing in for the orders table with one row per id of `id->created-at`, a map of order id to the moment
  the order was created."
  [id->created-at]
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :orders))
        field-name            #(:name (lib.metadata/field (mt/metadata-provider) (mt/id :orders %)))
        row                   (fn [[id moment]]
                                (str "SELECT " id " AS " (field-name :id) ", "
                                     (sql.qp/inline-value driver/*driver* moment) " AS " (field-name :created_at)))]
    {:table  {:schema schema :name name}
     :format :sql
     :sql    (str/join " UNION ALL " (map row (sort-by key id->created-at)))}))

(defn- selects
  "An expectation that the output holds exactly the orders with `ids`."
  [ids]
  (let [[int-type] (data-testing.test-util/cast-types)]
    {:type    :equals
     :name    "selects"
     :format  :rows
     :columns [{:name "id" :cast_type int-type}]
     :rows    (mapv (fn [id] {"id" id}) (sort ids))}))

(defn- run-card-test!
  "Save a card with the query `query` and a test of it with `inputs`, `expectations` and the further `test-fields`,
  then run the test. Returns the run's status, or the error type of its refusal."
  [query test-fields inputs expectations]
  (mt/with-temp [:model/Card     {card-id :id} {:dataset_query query}
                 :model/CardTest {test-id :id} (merge {:card_id      card-id
                                                       :inputs       inputs
                                                       :expectations expectations}
                                                      test-fields)]
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (try
        (:status (data-testing.runner/run-test! :card
                                                (t2/select-one :model/Card :id card-id)
                                                (t2/select-one :model/CardTest :id test-id)))
        (catch ExceptionInfo e
          (:error-type (ex-data e)))))))

(defn- pinned-and-unpinned
  "The status of a test of a card with `query`, given the rows of `id->created-at`, that expects exactly the orders with
  `ids`: with `now` set, and, as a control, without it."
  [query id->created-at ids]
  (let [run! #(run-card-test! query % [(orders-input id->created-at)] [(selects ids)])]
    {:pinned (run! {:now now}) :unpinned (run! {})}))

(deftest relative-filters-read-the-pinned-clock-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [orders (orders-query)]
      (testing "a filter in days: Redshift computes it from the JVM clock, the other drivers from the database's"
        (is (= {:pinned :passed :unpinned :failed}
               (pinned-and-unpinned (lib/filter orders (lib/time-interval (created-at) -30 :day))
                                    {1 (pinned+ -10 :days) 2 (pinned+ -60 :days) 3 (real+ -10 :days)}
                                    [1]))))
      (testing "a filter in hours: every driver writes the database's current-time function"
        (is (= {:pinned :passed :unpinned :failed}
               (pinned-and-unpinned (lib/filter orders (lib/time-interval (created-at) -3 :hour))
                                    {1 (pinned+ -1 :hours) 2 (pinned+ -5 :hours) 3 (real+ -1 :hours)}
                                    [1]))))
      (testing "the current week"
        (is (= {:pinned :passed :unpinned :failed}
               (pinned-and-unpinned (lib/filter orders (lib/time-interval (created-at) :current :week))
                                    {1 (pinned+ 0 :days) 2 (pinned+ -8 :days) 3 (real+ 0 :hours)}
                                    [1]))))
      (testing "the `now` expression"
        (is (= {:pinned :passed :unpinned :failed}
               (pinned-and-unpinned (lib/filter orders (lib/< (created-at) (lib/now)))
                                    {1 (pinned+ -1 :days) 2 (pinned+ 30 :days) 3 (real+ 30 :days)}
                                    [1])))))))

(deftest card-on-a-segment-reads-the-pinned-clock-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :orders)
                                                      :name       "Last 30 days"
                                                      :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                                      (lib/filter (lib/time-interval (created-at) -30 :day)))}]
        (testing "a card that filters by a segment of the last 30 days selects the rows of the pinned month"
          (is (= {:pinned :passed :unpinned :failed}
                 (pinned-and-unpinned (lib/filter (orders-query)
                                                  (lib.metadata/segment (mt/metadata-provider) segment-id))
                                      {1 (pinned+ -10 :days) 2 (pinned+ -60 :days) 3 (real+ -10 :days)}
                                      [1]))))))))

(defn- run-transform-test!
  "Save a transform of `source-query` into a new table and a test of it with `inputs`, the further `test-fields`, and
  one expectation that the target table holds exactly the orders with `ids`, then run the test. Returns the run's
  status, or the error type of its refusal."
  [source-query test-fields inputs ids]
  (let [{:keys [schema]} (lib.metadata/table (mt/metadata-provider) (mt/id :orders))]
    (mt/with-temp [:model/Transform     transform {:source {:type :query :query source-query}
                                                   :target {:type     "table"
                                                            :schema   schema
                                                            :name     (str "orders_now_" (rand-int 1000000))
                                                            :database (mt/id)}}
                   :model/TransformTest {test-id :id} (merge {:transform_id (:id transform)
                                                              :inputs       inputs
                                                              :expectations [(selects ids)]}
                                                             test-fields)]
      (binding [api/*current-user-id* (mt/user->id :crowberto)]
        (try
          (:status (data-testing.runner/run-test! :transform transform
                                                  (t2/select-one :model/TransformTest :id test-id)))
          (catch ExceptionInfo e
            (:error-type (ex-data e))))))))

(deftest transform-reads-the-pinned-clock-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [query  (lib/filter (orders-query) (lib/time-interval (created-at) -30 :day))
          inputs [(orders-input {1 (pinned+ -10 :days) 2 (pinned+ -60 :days) 3 (real+ -10 :days)})]
          run!   #(run-transform-test! query % inputs [1])]
      (testing "a transform test with `now` selects the rows of the pinned month"
        (is (= {:pinned :passed :unpinned :failed}
               {:pinned (run! {:now now}) :unpinned (run! {})}))))))

(deftest native-subject-with-now-is-refused-test
  (mt/test-drivers #{:h2 :postgres}
    (let [mp      (mt/metadata-provider)
          {:keys [schema name]} (lib.metadata/table mp (mt/id :orders))
          native  (lib/native-query mp (str "SELECT id, created_at FROM " schema "." name
                                            " WHERE created_at < CURRENT_TIMESTAMP"))
          inputs  [(orders-input {1 (pinned+ -1 :days)})]
          refused ::data-testing.errors/now-on-native-sql]
      (testing "a native card"
        (is (= {:pinned refused :unpinned :passed}
               {:pinned   (run-card-test! native {:now now} inputs [(selects [1])])
                :unpinned (run-card-test! native {} inputs [(selects [1])])})))
      (testing "an MBQL card on a native card, whose SQL the compile copies in"
        (mt/with-temp [:model/Card {native-card-id :id} {:dataset_query native}]
          (let [on-native (lib/query mp (lib.metadata/card mp native-card-id))]
            (is (= {:pinned refused :unpinned :passed}
                   {:pinned   (run-card-test! on-native {:now now} inputs [(selects [1])])
                    :unpinned (run-card-test! on-native {} inputs [(selects [1])])})))))
      (testing "a native transform"
        (is (= {:pinned refused :unpinned :passed}
               {:pinned   (run-transform-test! native {:now now} inputs [1])
                :unpinned (run-transform-test! native {} inputs [1])}))))))

(deftest validate-test-refuses-now-on-native-sql-test
  (mt/test-drivers #{:h2}
    (let [mp     (mt/metadata-provider)
          {:keys [schema name]} (lib.metadata/table mp (mt/id :orders))
          native (lib/native-query mp (str "SELECT id FROM " schema "." name))
          definition {:inputs       [(orders-input {1 (pinned+ -1 :days)})]
                      :expectations [(selects [1])]}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query native}]
        (let [card     (t2/select-one :model/Card :id card-id)
              refusal  (fn [definition]
                         (try (data-testing.runner/validate-test :card card definition)
                              nil
                              (catch ExceptionInfo e (:error-type (ex-data e)))))]
          (testing "a test is refused as it is saved, not only when it runs"
            (is (= ::data-testing.errors/now-on-native-sql (refusal (assoc definition :now (t/offset-date-time now))))))
          (testing "control: without `now` the same test is accepted"
            (is (nil? (refusal definition)))))))))
