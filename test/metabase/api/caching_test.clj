(ns metabase.api.caching-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]))

;; the other part is in metabase-enterprise.caching.caching-test
(deftest cache-config-test
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
    (mt/with-model-cleanup [:model/CacheConfig]
      (mt/with-premium-features #{}
        (testing "Advanced caching requires premium token"
          (is (= "Granular Caching is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :crowberto :put 402 "caching/"
                                       {:model    "question"
                                        :model_id 1
                                        :strategy {:type "nocache"}}))))
        (testing "Can operate on root settings though"
          (is (mt/user-http-request :crowberto :put 200 "caching/"
                                    {:model    "root"
                                     :model_id 0
                                     :strategy {:type "nocache" :name "root"}}))
          (is (=? {:data [{:model "root" :model_id 0}]}
                  (mt/user-http-request :crowberto :get 200 "caching/"
                                        :model "root")))
          (is (nil? (mt/user-http-request :crowberto :delete 204 "caching/"
                                          {:model "root" :model_id 0}))))
        (testing "But no advanced strategies can be used"
          (is (:errors (mt/user-http-request :crowberto :put 400 "caching/"
                                             {:model    "root"
                                              :model_id 0
                                              :strategy {:type     "schedule"
                                                         :schedule "0/2 * * * * ?"}}))))))))
