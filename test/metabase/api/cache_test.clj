(ns metabase.api.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

;; the other part is in `metabase-enterprise.cache.cache-test`
(deftest cache-config-test
  (mt/with-model-cleanup [:model/CacheConfig]
    (mt/with-premium-features #{}
      (testing "Advanced caching requires premium token"
        (mt/assert-has-premium-feature-error "Granular Caching"
                                             (mt/user-http-request :crowberto :put 402 "cache/"
                                                                   {:model    "question"
                                                                    :model_id 123456789
                                                                    :strategy {:type "nocache"}}))
        (mt/assert-has-premium-feature-error "Granular Caching"
                                             (mt/user-http-request :crowberto :get 402 "cache/"
                                                                   :model "question")))
      (testing "Can operate on root settings though"
        (is (mt/user-http-request :crowberto :put 200 "cache/"
                                  {:model    "root"
                                   :model_id 0
                                   :strategy {:type "nocache"}}))
        (is (=? {:data [{:model "root" :model_id 0}]}
                (mt/user-http-request :crowberto :get 200 "cache/"
                                      :model "root")))
        (is (nil? (mt/user-http-request :crowberto :delete 204 "cache/"
                                        {:model "root" :model_id 0}))))
      (testing "But no advanced strategies can be used"
        (is (:errors (mt/user-http-request :crowberto :put 400 "cache/"
                                           {:model    "root"
                                            :model_id 0
                                            :strategy {:type     "schedule"
                                                       :schedule "0/2 * * * * ?"}})))))))
