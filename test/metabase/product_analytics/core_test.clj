(ns metabase.product-analytics.core-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.product-analytics.compile :as product-analytics.compile]
   [metabase.product-analytics.core :as product-analytics]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(def ^:private event-settings
  {"columns.timestamp" "CREATED_AT"
   "columns.person"    "USER_ID"
   "columns.session"   "PRODUCT_ID"})

(defmacro ^:private with-event-table
  [& body]
  `(mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:event_settings event-settings}
     ~@body))

(defn- input
  [settings]
  {:table_id (mt/id :orders), :kind "habit", :settings settings})

(def ^:private all-of-it
  {:type "absolute", :start "2000-01-01", :end "2030-01-01"})

(defn- run
  [settings]
  (mt/with-test-user :crowberto
    (mt/rows (qp/process-query (product-analytics/build-analysis (input settings))))))

(defn- run-sql
  [sql]
  (mt/rows (qp/process-query (mt/native-query {:query sql}))))

(defn- rounded
  [rows]
  (mt/format-rows-by [int int 4.0 4.0] rows))

(deftest full-settings-test
  (testing "every setting is stored as a value, with the columns the table suggests"
    (with-event-table
      (mt/with-test-user :crowberto
        (is (= {:version          1
                :compiler_version product-analytics.compile/compiler-version
                :kind             "habit"
                :columns          {:timestamp "CREATED_AT", :person "USER_ID", :session "PRODUCT_ID"}
                :settings         {:date_range {:type "relative", :value -30, :unit "day"}
                                   :grain      "person"
                                   :sub_period "day"
                                   :active     nil
                                   :filters    []}}
               (:analysis (product-analytics/build-analysis
                           (input {:date_range {:type "relative", :value -30, :unit "day"}})))))))))

(deftest habit-test
  (with-event-table
    (testing "active days per person"
      (is (= (rounded
              (run-sql "SELECT periods, count(*), sum(events) * 1.0 / sum(periods), sum(sessions) * 1.0 / sum(periods)
                        FROM (SELECT user_id, count(DISTINCT cast(created_at AS date)) AS periods, count(*) AS events,
                                     count(DISTINCT product_id) AS sessions
                              FROM orders GROUP BY user_id) AS actors
                        GROUP BY periods ORDER BY periods"))
             (rounded (run {:date_range all-of-it})))))
    (testing "active weeks"
      (let [metadata-provider (mt/metadata-provider)
            field             #(lib.metadata/field metadata-provider (mt/id :orders %))
            query             (-> (lib/query metadata-provider (lib.metadata/table metadata-provider (mt/id :orders)))
                                  (lib/breakout (field :user_id))
                                  (lib/aggregate (lib/distinct (lib/with-temporal-bucket (field :created_at) :week)))
                                  lib/append-stage)
            active-weeks      (m/find-first #(= "count" (:lib/source-column-alias %)) (lib/breakoutable-columns query))]
        (is (= (mt/rows (qp/process-query (-> query
                                              (lib/breakout active-weeks)
                                              (lib/aggregate (lib/count)))))
               (mapv #(subvec (vec %) 0 2) (run {:date_range all-of-it, :sub_period "week"}))))))
    (testing "the conditions narrow the events"
      (is (= (first (run-sql "SELECT count(DISTINCT user_id) FROM orders WHERE quantity > 5"))
             [(reduce + (map second (run {:date_range all-of-it
                                          :active     {:name    "Big orders"
                                                       :filters [[:> {:lib/uuid (str (random-uuid))}
                                                                  [:field {:lib/uuid (str (random-uuid))} (mt/id :orders :quantity)]
                                                                  5]]}})))])))))

(deftest no-session-column-test
  (testing "without a session column there's no sessions column"
    (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:event_settings (dissoc event-settings "columns.session")}
      (mt/with-test-user :crowberto
        (let [query (product-analytics/build-analysis (input {:date_range all-of-it}))]
          (is (nil? (get-in query [:analysis :columns :session])))
          (is (= ["periods" "actors" "avg_events"]
                 (map :name (mt/cols (qp/process-query query))))))))))

(deftest query-says-what-it-reads-test
  (testing "the query names its table and nothing is left to expand from a reference"
    (with-event-table
      (mt/with-test-user :crowberto
        (let [query (product-analytics/build-analysis (input {:date_range all-of-it}))]
          (is (= #{(mt/id :orders)} (lib/all-source-table-ids query)))
          (is (empty? (lib/all-source-card-ids query)))
          (is (empty? (lib/all-segment-ids query))))))))

(deftest missing-columns-test
  (testing "an event table needs a person and a time"
    (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:event_settings {"columns.timestamp" "CREATED_AT"}}
      (mt/with-test-user :crowberto
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"needs an event time column and a person column"
                              (product-analytics/build-analysis (input {}))))))))

(deftest detected-settings-test
  (testing "the columns sync detected apply until a person overrides them"
    (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:detected_event_settings {"schema"   "snowplow"
                                                                                     "settings" event-settings}
                                                           :event_settings          {"columns.person" "PRODUCT_ID"}}
      (mt/with-test-user :crowberto
        (is (= {:timestamp "CREATED_AT", :person "PRODUCT_ID", :session "PRODUCT_ID"}
               (get-in (product-analytics/build-analysis (input {})) [:analysis :columns])))))))

(deftest timestamp-must-be-temporal-test
  (testing "a column that isn't a date can't be the event time"
    (with-event-table
      (mt/with-test-user :crowberto
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has to be a date or a time"
                              (product-analytics/build-analysis
                               (assoc (input {}) :columns {:timestamp "QUANTITY", :person "USER_ID", :session nil}))))))))

(deftest own-columns-test
  (testing "columns the analysis already has win over what the table suggests"
    (with-event-table
      (mt/with-test-user :crowberto
        (let [columns {:timestamp "CREATED_AT", :person "PRODUCT_ID", :session nil}]
          (is (= columns
                 (get-in (product-analytics/build-analysis (assoc (input {}) :columns columns))
                         [:analysis :columns]))))))))

(deftest clause-uuids-test
  (testing "a filter in the form and its copy in the stages have their own uuids, as a query requires"
    (with-event-table
      (mt/with-test-user :crowberto
        (let [clause (lib/normalize ::lib.schema.expression/boolean
                                    [:> {:lib/uuid (str (random-uuid))}
                                     [:field {:lib/uuid (str (random-uuid))} (mt/id :orders :quantity)]
                                     5])]
          (is (=? {:status :completed}
                  (qp/process-query (product-analytics/build-analysis (input {:filters [clause]}))))))))))

(deftest without-outdated-analysis-test
  (with-event-table
    (mt/with-test-user :crowberto
      (let [query (lib/query (mt/metadata-provider) (product-analytics/build-analysis (input {})))]
        (testing "a query as its analysis built it keeps the analysis"
          (is (contains? (product-analytics/without-outdated-analysis query) :analysis)))
        (testing "the same query with new uuids is the same query"
          (is (contains? (product-analytics/without-outdated-analysis (lib.util/fresh-uuids query)) :analysis)))
        (testing "a query whose stages were edited loses it"
          (is (not (contains? (product-analytics/without-outdated-analysis (lib/limit query 5)) :analysis)))
          (is (not (contains? (product-analytics/without-outdated-analysis (lib/append-stage query)) :analysis))))
        (testing "a query from an earlier compiler can't be checked, so it keeps it"
          (with-redefs [product-analytics.compile/compiler-version 2]
            (is (contains? (product-analytics/without-outdated-analysis (lib/limit query 5)) :analysis))))))))

(deftest query-processor-ignores-analysis-test
  (testing "the form changes neither the results nor the cache key"
    (with-event-table
      (mt/with-test-user :crowberto
        (let [query (product-analytics/build-analysis (input {:date_range all-of-it}))]
          (is (= (mt/rows (qp/process-query (dissoc query :analysis)))
                 (mt/rows (qp/process-query query))))
          (is (= (seq (lib-be/query-hash (dissoc query :analysis)))
                 (seq (lib-be/query-hash query))))
          (is (not (contains? (lib/->legacy-MBQL (lib/query (mt/metadata-provider) query)) :analysis))))))))
