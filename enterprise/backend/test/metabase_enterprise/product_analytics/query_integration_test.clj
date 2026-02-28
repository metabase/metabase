(ns metabase-enterprise.product-analytics.query-integration-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.setup :as pa.setup]
   [metabase-enterprise.product-analytics.test-util :as pa.tu]
   [metabase.product-analytics.core :as pa]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; ---- Helpers for case-insensitive PA table/field lookup ----

(defn- pa-table
  "Look up a PA table by name, case-insensitively."
  [table-name]
  (t2/select-one :model/Table
                 :db_id        pa/product-analytics-db-id
                 :%lower.name  (u/lower-case-en table-name)))

(defn- pa-field
  "Look up a field on a PA table by name, case-insensitively."
  [table-id field-name]
  (t2/select-one :model/Field
                 :table_id     table-id
                 :%lower.name  (u/lower-case-en field-name)))

(def ^:private expected-pa-tables
  "Expected visible PA table names (lowercase for case-insensitive comparison)."
  #{"product_analytics_event" "product_analytics_session" "product_analytics_site"
    "product_analytics_event_data" "product_analytics_session_data"})

;;; ------------------------------------------------- Sync Tests -------------------------------------------------

(deftest pa-db-sync-populates-tables-test
  (testing "After install, sync discovers the underlying PA tables"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [table-names (->> (t2/select-fn-set :name :model/Table :db_id pa/product-analytics-db-id)
                               (into #{} (map u/lower-case-en)))]
          (is (pos? (count table-names))
              "PA DB should have at least one table after sync")
          (is (every? table-names expected-pa-tables)
              "All 5 PA tables should be present"))))))

(deftest pa-db-sync-populates-fields-test
  (testing "After install, sync discovers fields on PA tables"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [events-table (pa-table "product_analytics_event")]
          (is (some? events-table) "product_analytics_event table should exist")
          (is (some? (pa-field (:id events-table) "created_at")))
          (is (some? (pa-field (:id events-table) "url_path")))
          (is (some? (pa-field (:id events-table) "event_name"))))
        (let [sessions-table (pa-table "product_analytics_session")]
          (is (some? sessions-table) "product_analytics_session table should exist")
          (is (some? (pa-field (:id sessions-table) "created_at")))
          (is (some? (pa-field (:id sessions-table) "browser")))
          (is (some? (pa-field (:id sessions-table) "country"))))))))

(deftest pa-table-entity-types-enriched-test
  (testing "Post-sync enhancement sets correct entity types on PA tables"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (is (= :entity/EventTable
               (:entity_type (pa-table "product_analytics_event")))
            "product_analytics_event should be classified as EventTable")
        (is (= :entity/GenericTable
               (:entity_type (pa-table "product_analytics_session")))
            "product_analytics_session should be classified as GenericTable")))))

(deftest pa-field-semantic-types-enriched-test
  (testing "Post-sync enhancement sets correct semantic types on key fields"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [events-table   (pa-table "product_analytics_event")
              sessions-table (pa-table "product_analytics_session")]
          (testing "events fields"
            (is (= :type/CreationTimestamp
                   (:semantic_type (pa-field (:id events-table) "created_at"))))
            (is (= :type/URL
                   (:semantic_type (pa-field (:id events-table) "url_path"))))
            (is (= :type/Category
                   (:semantic_type (pa-field (:id events-table) "event_name"))))
            (is (= :type/Category
                   (:semantic_type (pa-field (:id events-table) "utm_source")))))
          (testing "sessions fields"
            (is (= :type/CreationTimestamp
                   (:semantic_type (pa-field (:id sessions-table) "created_at"))))
            (is (= :type/Country
                   (:semantic_type (pa-field (:id sessions-table) "country"))))
            (is (= :type/Category
                   (:semantic_type (pa-field (:id sessions-table) "browser"))))))))))

;;; ------------------------------------------------- Query Tests -------------------------------------------------

(deftest can-query-pa-events-test
  (testing "Can execute MBQL count query against product_analytics_event"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [events-table (pa-table "product_analytics_event")]
          (mt/with-test-user :crowberto
            (let [result (qp/process-query
                          {:database pa/product-analytics-db-id
                           :type     :query
                           :query    {:source-table (:id events-table)
                                      :aggregation  [[:count]]}})]
              (is (some? result) "Query should return a result")
              (is (not (contains? result :error)) "Query should not error"))))))))

(deftest can-query-pa-sessions-test
  (testing "Can execute MBQL count query against product_analytics_session"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [sessions-table (pa-table "product_analytics_session")]
          (mt/with-test-user :crowberto
            (let [result (qp/process-query
                          {:database pa/product-analytics-db-id
                           :type     :query
                           :query    {:source-table (:id sessions-table)
                                      :aggregation  [[:count]]}})]
              (is (some? result) "Query should return a result")
              (is (not (contains? result :error)) "Query should not error"))))))))

(deftest native-queries-blocked-test
  (testing "Native queries against PA DB are rejected"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Native queries are not allowed on the product analytics database"
               (qp/process-query
                {:database pa/product-analytics-db-id
                 :type     :native
                 :native   {:query "SELECT * FROM product_analytics_event"}}))))))))

;;; ------------------------------------------------- X-ray Tests -------------------------------------------------

(deftest can-generate-xray-for-pa-events-test
  (testing "automagic-analysis generates a dashboard for the events table"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [events-table (pa-table "product_analytics_event")
                dashboard    (magic/automagic-analysis events-table {})]
            (is (some? dashboard) "X-ray should return a dashboard")
            (is (some? (:name dashboard)) "Dashboard should have a name")
            (is (pos? (count (:dashcards dashboard))) "Dashboard should have cards")))))))

(deftest xray-includes-expected-cards-test
  (testing "X-ray for events table includes event and category cards"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [events-table (pa-table "product_analytics_event")
                dashboard    (magic/automagic-analysis events-table {:show :all})
                card-names   (set (keep (comp :name :card) (:dashcards dashboard)))]
            (is (seq card-names) "Dashboard should have named cards")
            (testing "EventTable template is used (has 'Events over time' card)"
              (is (some #(re-find #"(?i)events over time" %) card-names)))
            (testing "Category dimension cards are generated (entity_type enables GenericTable.Category matching)"
              (is (some #(re-find #"(?i)per" %) card-names)
                  "Dashboard should have at least one 'per category' card"))))))))

(deftest xray-sessions-visitors-template-test
  (testing "X-ray for sessions table includes VisitorsAndLocations as an in-depth related template"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [sessions-table (pa-table "product_analytics_session")
                dashboard      (magic/automagic-analysis sessions-table {:show :all})
                related        (:related dashboard)
                zoom-in-urls   (set (keep :url (:zoom-in related)))]
            (testing "VisitorsAndLocations template is available in zoom-in related section"
              (is (some #(re-find #"VisitorsAndLocations" %) zoom-in-urls)
                  "Related zoom-in should include the VisitorsAndLocations sub-template"))
            (testing "Base dashboard includes geographic cards from GenericTable template"
              (let [card-names (set (keep (comp :name :card) (:dashcards dashboard)))]
                (is (some #(re-find #"(?i)country" %) card-names)
                    "Dashboard should have a country-based card")))))))))
