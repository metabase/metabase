(ns metabase-enterprise.product-analytics.storage-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------- get-site ---------------------------------------------------

(deftest get-site-finds-non-archived-test
  (testing "get-site returns a site map for a non-archived site"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "My Site" :uuid (str (random-uuid))}]
      (let [result (storage/store-get-site (:uuid site))]
        (is (some? result))
        (is (= "My Site" (:name result)))
        (is (= (:id site) (:id result)))))))

(deftest get-site-returns-nil-for-unknown-uuid-test
  (testing "get-site returns nil for an unknown UUID"
    (is (nil? (storage/store-get-site (str (random-uuid)))))))

(deftest get-site-returns-nil-for-archived-test
  (testing "get-site returns nil for archived sites"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Archived Site"
                                                     :uuid (str (random-uuid))
                                                     :archived true}]
      (is (nil? (storage/store-get-site (:uuid site)))))))

;;; ----------------------------------------------- upsert-session! -----------------------------------------------

(deftest upsert-session-inserts-new-test
  (testing "upsert-session! inserts a new session and returns its PK"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Site" :uuid (str (random-uuid))}]
      (let [session-uuid (str (random-uuid))
            pk           (storage/store-upsert-session! {:session_uuid session-uuid
                                                         :site_id      (:id site)
                                                         :browser      "Firefox"
                                                         :os           "Linux"})]
        (try
          (is (pos-int? pk))
          (let [row (t2/select-one :model/ProductAnalyticsSession :id pk)]
            (is (= session-uuid (:session_uuid row)))
            (is (= "Firefox" (:browser row)))
            (is (= "Linux" (:os row))))
          (finally
            (t2/delete! :model/ProductAnalyticsSession :id pk)))))))

(deftest upsert-session-updates-existing-test
  (testing "upsert-session! updates an existing session without creating duplicates"
    (mt/with-temp [:model/ProductAnalyticsSite    site {:name "Site" :uuid (str (random-uuid))}
                   :model/ProductAnalyticsSession sess {:site_id      (:id site)
                                                        :session_uuid (str (random-uuid))
                                                        :browser      "Chrome"
                                                        :os           "macOS"}]
      (let [pk (storage/store-upsert-session! {:session_uuid (:session_uuid sess)
                                               :site_id      (:id site)
                                               :browser      "Safari"
                                               :os           "iOS"})]
        (is (= (:id sess) pk))
        (let [row (t2/select-one :model/ProductAnalyticsSession :id pk)]
          (is (= "Safari" (:browser row)))
          (is (= "iOS" (:os row))))
        (is (= 1 (t2/count :model/ProductAnalyticsSession
                           :session_uuid (:session_uuid sess)
                           :site_id (:id site))))))))

;;; ------------------------------------------------ save-event! --------------------------------------------------

(deftest save-event-with-properties-test
  (testing "save-event! writes event + properties atomically"
    (mt/with-temp [:model/ProductAnalyticsSite    site {:name "Site" :uuid (str (random-uuid))}
                   :model/ProductAnalyticsSession sess {:site_id      (:id site)
                                                        :session_uuid (str (random-uuid))}]
      (let [result (storage/store-save-event!
                    {:event      {:site_id    (:id site)
                                  :session_id (:id sess)
                                  :event_type 2
                                  :event_name "button_click"
                                  :url_path   "/dashboard/1"}
                     :properties [{:data_key     "button_id"
                                   :string_value "save-btn"
                                   :data_type    1}
                                  {:data_key     "page_section"
                                   :string_value "header"
                                   :data_type    1}]})]
        (try
          (is (some? result))
          (is (= "button_click" (:event_name result)))
          (is (= 2 (t2/count :model/ProductAnalyticsEventData :event_id (:id result))))
          (finally
            (t2/delete! :model/ProductAnalyticsEventData :event_id (:id result))
            (t2/delete! :model/ProductAnalyticsEvent :id (:id result))))))))

(deftest save-event-no-properties-test
  (testing "save-event! works with no properties (pageview)"
    (mt/with-temp [:model/ProductAnalyticsSite    site {:name "Site" :uuid (str (random-uuid))}
                   :model/ProductAnalyticsSession sess {:site_id      (:id site)
                                                        :session_uuid (str (random-uuid))}]
      (let [result (storage/store-save-event!
                    {:event      {:site_id    (:id site)
                                  :session_id (:id sess)
                                  :event_type 1
                                  :url_path   "/home"}
                     :properties []})]
        (try
          (is (some? result))
          (is (= 1 (:event_type result)))
          (is (= 0 (t2/count :model/ProductAnalyticsEventData :event_id (:id result))))
          (finally
            (t2/delete! :model/ProductAnalyticsEvent :id (:id result))))))))

;;; ------------------------------------------- Error handling -----------------------------------------------------

(deftest unknown-backend-throws-test
  (testing "Unknown backend throws a clear error"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"No product-analytics storage backend registered"
         (binding [storage/*storage-backend-override* :bogus/backend]
           (storage/store-get-site "abc"))))))

(deftest invalid-setting-value-rejected-test
  (testing "Invalid backend setting value is rejected"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid product-analytics storage backend"
         (storage/product-analytics-storage-backend! :not-a-real-backend)))))
