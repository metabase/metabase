(ns metabase-enterprise.caching.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.caching.api :as caching.api]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]
   [metabase.util :as u]))

(comment
  caching.api/keep-me)

(deftest cache-config-test
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
    (mt/with-model-cleanup [:model/CacheConfig]
      (testing "Caching requires premium token with `:caching`"
        (mt/with-premium-features #{}
          (is (= "Caching is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :crowberto :get 402 "ee/caching/")))))
      (testing "Caching API"
        (mt/with-premium-features #{:cache-granular-controls}
          (mt/with-temp [:model/Database      db     {}
                         :model/Collection    col1   {}
                         :model/Collection    col2   {:location (format "/%s/" (:id col1))}
                         :model/Collection    col3   {}
                         :model/Dashboard     dash   {:collection_id (:id col1)}
                         :model/Card          card1  {:database_id   (:id db)
                                                      :collection_id (:id col1)}
                         :model/Card          card2  {:database_id   (:id db)
                                                      :collection_id (:id col1)}
                         :model/Card          card3  {:database_id   (:id db)
                                                      :collection_id (:id col2)}
                         :model/Card          card4  {:database_id   (:id db)
                                                      :collection_id (:id col3)}
                         :model/Card          card5  {:collection_id (:id col3)}]

            (testing "No access from regular users"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 "ee/caching/"))))

            (testing "Can configure root"
              (is (mt/user-http-request :crowberto :put 200 "ee/caching/"
                                        {:model    "root"
                                         :model_id 0
                                         :strategy {:type "nocache" :name "root"}}))
              (is (=? {:items [{:model "root" :model_id 0}]}
                      (mt/user-http-request :crowberto :get 200 "ee/caching/"))))

            (testing "Can configure others"
              (is (mt/user-http-request :crowberto :put 200 "ee/caching/"
                                        {:model    "database"
                                         :model_id (:id db)
                                         :strategy {:type "nocache" :name "db"}}))
              (is (mt/user-http-request :crowberto :put 200 "ee/caching/"
                                        {:model    "collection"
                                         :model_id (:id col1)
                                         :strategy {:type "nocache" :name "col1"}}))
              (is (mt/user-http-request :crowberto :put 200 "ee/caching/"
                                        {:model    "dashboard"
                                         :model_id (:id dash)
                                         :strategy {:type "nocache" :name "dash"}}))
              (is (mt/user-http-request :crowberto :put 200 "ee/caching/"
                                        {:model    "question"
                                         :model_id (:id card1)
                                         :strategy {:type "nocache" :name "card1"}}))
              (is (mt/user-http-request :crowberto :put 200 "ee/caching/"
                                        {:model    "collection"
                                         :model_id (:id col2)
                                         :strategy {:type "nocache" :name "col2"}})))

            (testing "HTTP responds with correct listings"
              (is (=? {:items [{:model "root" :model_id 0}]}
                      (mt/user-http-request :crowberto :get 200 "ee/caching/")))
              (is (=? {:items [{:model "database" :model_id (:id db)}]}
                      (mt/user-http-request :crowberto :get 200 "ee/caching/" {}
                                            :model :database)))
              (is (=? {:items [{:model "collection" :model_id (:id col1)}]}
                      (mt/user-http-request :crowberto :get 200 "ee/caching/" {}
                                            :model :dashboard)))
              (is (=? {:items [{:model "dashboard" :model_id (:id dash)}
                               {:model "question" :model_id (:id card1)}
                               {:model "collection" :model_id (:id col2)}]}
                      (mt/user-http-request :crowberto :get 200 "ee/caching/" {}
                                            :collection (:id col1) :model :dashboard :model :question))))

            (testing "We select correct config for something from a db"
              (testing "First card has own config"
                (is (=? {:type :nocache :name "card1"}
                        (:cache-strategy (#'qp.card/query-for-card card1 {} {} {} {}))))
                (is (=? {:type :nocache :name "card1"}
                        (:cache-strategy (#'qp.card/query-for-card card1 {} {} {} {:dashboard-id (u/the-id dash)})))))
              (testing "Second card should hit collection or dashboard cache"
                (is (=? {:type :nocache :name "col1"}
                        (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {}))))
                (is (=? {:type :nocache :name "dash"}
                        (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {:dashboard-id (u/the-id dash)})))))
              (testing "Third card gets other collection config"
                (is (=? {:type :nocache :name "col2"}
                        (:cache-strategy (#'qp.card/query-for-card card3 {} {} {} {})))))
              (testing "Fourth card is in collection with no config and gets db config"
                (is (=? {:type :nocache :name "db"}
                        (:cache-strategy (#'qp.card/query-for-card card4 {} {} {} {})))))
              (testing "Fifth card1 targets other db and gets root config"
                (is (=? {:type :nocache :name "root"}
                        (:cache-strategy (#'qp.card/query-for-card card5 {} {} {} {}))))))

            (testing "It's possible to delete a configuration"
              (is (nil? (mt/user-http-request :crowberto :delete 204 "ee/caching"
                                              {:model    "collection"
                                               :model_id (:id col2)})))
              (testing "And then card3 gets db config"
                (is (=? {:type :nocache :name "db"}
                        (:cache-strategy (#'qp.card/query-for-card card3 {} {} {} {}))))))))))))
