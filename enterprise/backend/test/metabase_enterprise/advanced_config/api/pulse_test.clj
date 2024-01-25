(ns metabase-enterprise.advanced-config.api.pulse-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest test-pulse-endpoint-should-respect-email-domain-allow-list-test
  (testing "POST /api/pulse/test"
    (t2.with-temp/with-temp [Card card {:dataset_query (mt/mbql-query venues)}]
      ;; make sure we validate raw emails whether they're part of `:details` or part of `:recipients` -- we
      ;; technically allow either right now
      (doseq [channel [{:details {:emails ["test@metabase.com"]}}
                       {:recipients [{:email "test@metabase.com"}]
                        :details    {}}]]
        (testing (format "\nChannel = %s\n" (u/pprint-to-str channel))
          (letfn [(send! [expected-status-code]
                    (let [pulse-name (mt/random-name)]
                      (mt/with-fake-inbox
                        {:response   (mt/user-http-request
                                      :rasta :post expected-status-code "pulse/test"
                                      {:name          pulse-name
                                       :cards         [{:id                (u/the-id card)
                                                        :include_csv       false
                                                        :include_xls       false
                                                        :dashboard_card_id nil}]
                                       :channels      [(merge {:enabled       true
                                                               :channel_type  "email"
                                                               :schedule_type "daily"
                                                               :schedule_hour 12
                                                               :schedule_day  nil}
                                                              channel)]
                                       :skip_if_empty false})
                         :recipients (set (keys (mt/regex-email-bodies (re-pattern pulse-name))))})))]
            (testing "allowed email -- should pass"
              (mt/with-premium-features #{:email-allow-list}
                (mt/with-temporary-setting-values [subscription-allowed-domains "metabase.com"]
                  (let [{:keys [response recipients]} (send! 200)]
                    (is (= {:ok true}
                           response))
                    (is (contains? recipients "test@metabase.com"))))
                (testing "No :email-allow-list token"
                  (mt/with-premium-features #{}
                    (let [{:keys [response recipients]} (send! 200)]
                      (is (= {:ok true}
                             response))
                      (is (contains? recipients "test@metabase.com")))))))
            (testing "disallowed email"
              (mt/with-premium-features #{:email-allow-list}
                (mt/with-temporary-setting-values [subscription-allowed-domains "example.com"]
                  (testing "should fail when :email-allow-list is enabled"
                    (let [{:keys [response recipients]} (send! 403)]
                      (is (= "You cannot create new subscriptions for the domain \"metabase.com\". Allowed domains are: example.com"
                             (:message response)))
                      (is (not (contains? recipients "test@metabase.com")))))
                  (testing "No :email-allow-list token -- should still pass"
                    (mt/with-premium-features #{}
                      (let [{:keys [response recipients]} (send! 200)]
                        (is (= {:ok true}
                               response))
                        (is (contains? recipients "test@metabase.com"))))))))))))))
