(ns metabase-enterprise.product-analytics.query-integration-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.setup :as pa.setup]
   [metabase-enterprise.product-analytics.test-util :as pa.tu]
   [metabase.product-analytics.core :as pa]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------- Sync Tests -------------------------------------------------

(def ^:private expected-pa-tables
  #{"V_PA_EVENTS" "V_PA_SESSIONS" "V_PA_SITES" "V_PA_EVENT_DATA" "V_PA_SESSION_DATA"})

(deftest pa-db-sync-populates-tables-test
  (testing "After install, sync discovers the V_PA_* tables"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [table-names (t2/select-fn-set :name :model/Table :db_id pa/product-analytics-db-id)]
          (is (pos? (count table-names))
              "PA DB should have at least one table after sync")
          (is (every? table-names expected-pa-tables)
              "All 5 PA views should be present"))))))

(deftest pa-db-sync-populates-fields-test
  (testing "After install, sync discovers fields on PA tables"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [events-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")]
          (is (some? events-table) "V_PA_EVENTS table should exist")
          (let [field-names (t2/select-fn-set :name :model/Field :table_id (:id events-table))]
            (is (contains? field-names "CREATED_AT"))
            (is (contains? field-names "URL_PATH"))
            (is (contains? field-names "EVENT_NAME"))))
        (let [sessions-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_SESSIONS")]
          (is (some? sessions-table) "V_PA_SESSIONS table should exist")
          (let [field-names (t2/select-fn-set :name :model/Field :table_id (:id sessions-table))]
            (is (contains? field-names "CREATED_AT"))
            (is (contains? field-names "BROWSER"))
            (is (contains? field-names "COUNTRY"))))))))

(deftest pa-table-entity-types-enriched-test
  (testing "Post-sync enhancement sets correct entity types on PA tables"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (is (= :entity/EventTable
               (:entity_type (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")))
            "V_PA_EVENTS should be classified as EventTable")
        (is (= :entity/GenericTable
               (:entity_type (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_SESSIONS")))
            "V_PA_SESSIONS should be classified as GenericTable")))))

(deftest pa-field-semantic-types-enriched-test
  (testing "Post-sync enhancement sets correct semantic types on key fields"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [events-table   (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")
              sessions-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_SESSIONS")]
          (testing "V_PA_EVENTS fields"
            (is (= :type/CreationTimestamp
                   (:semantic_type (t2/select-one :model/Field :table_id (:id events-table) :name "CREATED_AT"))))
            (is (= :type/URL
                   (:semantic_type (t2/select-one :model/Field :table_id (:id events-table) :name "URL_PATH"))))
            (is (= :type/Category
                   (:semantic_type (t2/select-one :model/Field :table_id (:id events-table) :name "EVENT_NAME"))))
            (is (= :type/Category
                   (:semantic_type (t2/select-one :model/Field :table_id (:id events-table) :name "UTM_SOURCE")))))
          (testing "V_PA_SESSIONS fields"
            (is (= :type/CreationTimestamp
                   (:semantic_type (t2/select-one :model/Field :table_id (:id sessions-table) :name "CREATED_AT"))))
            (is (= :type/Country
                   (:semantic_type (t2/select-one :model/Field :table_id (:id sessions-table) :name "COUNTRY"))))
            (is (= :type/Category
                   (:semantic_type (t2/select-one :model/Field :table_id (:id sessions-table) :name "BROWSER"))))))))))

;;; ------------------------------------------------- Query Tests -------------------------------------------------

(deftest can-query-pa-events-test
  (testing "Can execute MBQL count query against V_PA_EVENTS"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [events-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")]
          (mt/with-test-user :crowberto
            (let [result (qp/process-query
                          {:database pa/product-analytics-db-id
                           :type     :query
                           :query    {:source-table (:id events-table)
                                      :aggregation  [[:count]]}})]
              (is (some? result) "Query should return a result")
              (is (not (contains? result :error)) "Query should not error"))))))))

(deftest can-query-pa-sessions-test
  (testing "Can execute MBQL count query against V_PA_SESSIONS"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (let [sessions-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_SESSIONS")]
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
                 :native   {:query "SELECT * FROM V_PA_EVENTS"}}))))))))

;;; ------------------------------------------------- X-ray Tests -------------------------------------------------

(deftest can-generate-xray-for-pa-events-test
  (testing "automagic-analysis generates a dashboard for V_PA_EVENTS"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [events-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")
                dashboard    (magic/automagic-analysis events-table {})]
            (is (some? dashboard) "X-ray should return a dashboard")
            (is (some? (:name dashboard)) "Dashboard should have a name")
            (is (pos? (count (:dashcards dashboard))) "Dashboard should have cards")))))))

(deftest xray-includes-expected-cards-test
  (testing "X-ray for V_PA_EVENTS includes event and category cards"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [events-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")
                dashboard    (magic/automagic-analysis events-table {:show :all})
                card-names   (set (keep (comp :name :card) (:dashcards dashboard)))]
            (is (seq card-names) "Dashboard should have named cards")
            (testing "EventTable template is used (has 'Events over time' card)"
              (is (some #(re-find #"(?i)events over time" %) card-names)))
            (testing "Category dimension cards are generated (entity_type enables GenericTable.Category matching)"
              (is (some #(re-find #"(?i)per" %) card-names)
                  "Dashboard should have at least one 'per category' card"))))))))

(deftest xray-events-funnel-template-test
  (testing "X-ray for V_PA_EVENTS includes funnel flow cards from FunnelFlows template"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [events-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_EVENTS")
                dashboard    (magic/automagic-analysis events-table {:show :all})
                card-names   (set (keep (comp :name :card) (:dashcards dashboard)))]
            (is (seq card-names) "Dashboard should have named cards")
            (testing "Funnel cards are present"
              (is (some #(re-find #"(?i)funnel|flow" %) card-names)
                  "Dashboard should have at least one funnel/flow card"))))))))

(deftest xray-sessions-visitors-template-test
  (testing "X-ray for V_PA_SESSIONS includes visitor and geographic cards from VisitorsAndLocations template"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.setup/ensure-product-analytics-db-installed!)
        (mt/with-test-user :crowberto
          (let [sessions-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_SESSIONS")
                dashboard      (magic/automagic-analysis sessions-table {:show :all})
                card-names     (set (keep (comp :name :card) (:dashcards dashboard)))]
            (is (seq card-names) "Dashboard should have named cards")
            (testing "Country map card is present"
              (is (some #(re-find #"(?i)country" %) card-names)
                  "Dashboard should have a country-based card"))
            (testing "Session count cards are present"
              (is (some #(re-find #"(?i)session" %) card-names)
                  "Dashboard should have session-related cards"))))))))
