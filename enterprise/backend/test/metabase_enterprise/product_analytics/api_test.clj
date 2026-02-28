(ns metabase-enterprise.product-analytics.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------- Premium Feature Gating -------------------------------------------

(deftest premium-feature-gating-test
  (testing "endpoints require :product-analytics feature"
    (mt/with-premium-features #{}
      (testing "GET /sites"
        (mt/user-http-request :crowberto :get 402 "ee/product-analytics/sites"))
      (testing "POST /sites"
        (mt/user-http-request :crowberto :post 402 "ee/product-analytics/sites"
                              {:name "test"})))))

;;; --------------------------------------------- Admin-Only Access ----------------------------------------------

(deftest admin-only-access-test
  (mt/with-premium-features #{:product-analytics}
    (testing "non-admin users get 403"
      (testing "GET /sites"
        (mt/user-http-request :rasta :get 403 "ee/product-analytics/sites"))
      (testing "POST /sites"
        (mt/user-http-request :rasta :post 403 "ee/product-analytics/sites"
                              {:name "test"})))))

;;; ------------------------------------------------ CRUD Tests --------------------------------------------------

(deftest create-site-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsSite]
      (testing "POST /sites with valid body returns site with UUID and tracking snippet"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/product-analytics/sites"
                                             {:name "My Site" :allowed_domains "example.com"})]
          (is (string? (:uuid response)))
          (is (= "My Site" (:name response)))
          (is (= "example.com" (:allowed_domains response)))
          (is (false? (:archived response)))
          (is (string? (:tracking_snippet response)))
          (is (re-find #"data-website-id" (:tracking_snippet response)))))
      (testing "POST /sites without name returns 400"
        (mt/user-http-request :crowberto :post 400 "ee/product-analytics/sites"
                              {})))))

(deftest list-sites-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsSite]
      (let [_site (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                 {:name "Site A" :uuid (str (random-uuid))})
            _archived (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                     {:name "Archived Site" :uuid (str (random-uuid)) :archived true})]
        (testing "GET /sites returns array of sites"
          (let [sites (mt/user-http-request :crowberto :get 200 "ee/product-analytics/sites")]
            (is (sequential? sites))
            (is (some #(= "Site A" (:name %)) sites))))
        (testing "GET /sites does not include archived sites"
          (let [sites (mt/user-http-request :crowberto :get 200 "ee/product-analytics/sites")]
            (is (not (some #(= "Archived Site" (:name %)) sites)))))))))

(deftest get-site-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsSite]
      (let [site (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                {:name "My Site" :uuid (str (random-uuid))})]
        (testing "GET /sites/:id returns site with tracking snippet"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (str "ee/product-analytics/sites/" (:id site)))]
            (is (= "My Site" (:name response)))
            (is (string? (:tracking_snippet response)))))
        (testing "GET /sites/9999 returns 404"
          (mt/user-http-request :crowberto :get 404 "ee/product-analytics/sites/9999"))))))

(deftest update-site-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsSite]
      (let [site (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                {:name "Original" :uuid (str (random-uuid))})]
        (testing "PUT /sites/:id updates name"
          (let [response (mt/user-http-request :crowberto :put 200
                                               (str "ee/product-analytics/sites/" (:id site))
                                               {:name "Updated"})]
            (is (= "Updated" (:name response)))))
        (testing "PUT /sites/9999 returns 404"
          (mt/user-http-request :crowberto :put 404 "ee/product-analytics/sites/9999"
                                {:name "nope"}))))))

(deftest delete-site-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsSite]
      (let [site (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                {:name "To Delete" :uuid (str (random-uuid))})]
        (testing "DELETE /sites/:id soft-deletes (archives) the site"
          (let [response (mt/user-http-request :crowberto :delete 200
                                               (str "ee/product-analytics/sites/" (:id site)))]
            (is (true? (:archived response)))))
        (testing "DELETE /sites/9999 returns 404"
          (mt/user-http-request :crowberto :delete 404 "ee/product-analytics/sites/9999"))))))
