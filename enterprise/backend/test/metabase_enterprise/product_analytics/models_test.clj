(ns metabase-enterprise.product-analytics.models-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.models.event]
   [metabase-enterprise.product-analytics.models.event-data]
   [metabase-enterprise.product-analytics.models.session]
   [metabase-enterprise.product-analytics.models.site]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest site-model-test
  (testing "ProductAnalyticsSite can be inserted, selected, and has timestamps"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site"
                                                     :uuid (str (random-uuid))}]
      (let [fetched (t2/select-one :model/ProductAnalyticsSite :id (:id site))]
        (is (= "Test Site" (:name fetched)))
        (is (some? (:created_at fetched)))
        (is (some? (:updated_at fetched)))
        (is (false? (:archived fetched)))))))

(deftest session-model-test
  (testing "ProductAnalyticsSession can be inserted with FK to site"
    (mt/with-temp [:model/ProductAnalyticsSite    site    {:name "Site" :uuid (str (random-uuid))}
                   :model/ProductAnalyticsSession session {:site_id      (:id site)
                                                          :session_uuid (str (random-uuid))
                                                          :browser      "Chrome"
                                                          :os           "macOS"}]
      (let [fetched (t2/select-one :model/ProductAnalyticsSession :id (:id session))]
        (is (= (:id site) (:site_id fetched)))
        (is (= "Chrome" (:browser fetched)))
        (is (some? (:created_at fetched)))
        (is (some? (:updated_at fetched)))))))

(deftest event-model-test
  (testing "ProductAnalyticsEvent can be inserted with FKs and has created_at"
    (mt/with-temp [:model/ProductAnalyticsSite    site    {:name "Site" :uuid (str (random-uuid))}
                   :model/ProductAnalyticsSession session {:site_id      (:id site)
                                                          :session_uuid (str (random-uuid))}
                   :model/ProductAnalyticsEvent   event   {:site_id    (:id site)
                                                          :session_id (:id session)
                                                          :event_type 1
                                                          :url_path   "/home"}]
      (let [fetched (t2/select-one :model/ProductAnalyticsEvent :id (:id event))]
        (is (= (:id site) (:site_id fetched)))
        (is (= (:id session) (:session_id fetched)))
        (is (= 1 (:event_type fetched)))
        (is (= "/home" (:url_path fetched)))
        (is (some? (:created_at fetched)))))))

(deftest event-data-model-test
  (testing "ProductAnalyticsEventData can be inserted with FK to event"
    (mt/with-temp [:model/ProductAnalyticsSite      site  {:name "Site" :uuid (str (random-uuid))}
                   :model/ProductAnalyticsSession    sess  {:site_id      (:id site)
                                                           :session_uuid (str (random-uuid))}
                   :model/ProductAnalyticsEvent      event {:site_id    (:id site)
                                                           :session_id (:id sess)
                                                           :event_type 2
                                                           :event_name "click"}
                   :model/ProductAnalyticsEventData  data  {:event_id     (:id event)
                                                           :data_key     "button_id"
                                                           :string_value "submit-btn"
                                                           :data_type    1}]
      (let [fetched (t2/select-one :model/ProductAnalyticsEventData :id (:id data))]
        (is (= (:id event) (:event_id fetched)))
        (is (= "button_id" (:data_key fetched)))
        (is (= "submit-btn" (:string_value fetched)))
        (is (= 1 (:data_type fetched)))
        (is (some? (:created_at fetched)))))))
