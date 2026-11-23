(ns metabase.cache.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; the other part is in [[metabase-enterprise.cache.cache-test]]
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
                                                                   :model "question"))))))

(deftest cache-config-root-settings-test
  (mt/with-model-cleanup [:model/CacheConfig]
    (mt/with-premium-features #{}
      (testing "Can operate on root settings though"
        (is (mt/user-http-request :crowberto :put 200 "cache/"
                                  {:model    "root"
                                   :model_id 0
                                   :strategy {:type "nocache"}}))
        (is (=? {:data [{:model "root" :model_id 0}]}
                (mt/user-http-request :crowberto :get 200 "cache/"
                                      :model "root")))
        (is (nil? (mt/user-http-request :crowberto :delete 204 "cache/"
                                        {:model "root" :model_id 0})))))))

(deftest cache-config-no-advanced-strategies-test
  (mt/with-model-cleanup [:model/CacheConfig]
    (mt/with-premium-features #{}
      (testing "But no advanced strategies can be used"
        (let [response (mt/user-http-request :crowberto :put 400 "cache/"
                                             {:model    "root"
                                              :model_id 0
                                              :strategy {:type     "schedule"
                                                         :schedule "0/2 * * * * ?"}})]
          (is (= {:strategy "cache strategy :type must be one of :nocache, :ttl"}
                 (:errors response)))
          (is (re-find #"invalid cache strategy :type \"schedule\", must be one of :nocache, :ttl"
                       (first (get-in response [:specific-errors :strategy])))))))))

(deftest delete-cache-configs-statements-do-not-grow-with-targets-test
  (mt/with-premium-features #{:cache-granular-controls}
    (mt/with-temp [:model/Collection {writable-id :id}  {}
                   :model/Collection {forbidden-id :id} {}]
      (perms/grant-collection-readwrite-permissions! (perms/all-users-group) writable-id)
      (let [cards!  (fn [coll-id n]
                      (vec (t2/insert-returning-pks! :model/Card
                                                     (for [i (range n)]
                                                       {:name          (str "cached card " i)
                                                        :creator_id    (mt/user->id :crowberto)
                                                        :database_id   (mt/id)
                                                        :display       :table
                                                        :collection_id coll-id
                                                        :visualization_settings {}
                                                        :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}))))
            delete! (fn [expected ids]
                      (mt/user-http-request :rasta :delete expected "cache/" {:model "question" :model_id ids}))]
        (mt/with-model-cleanup [:model/Card :model/CacheConfig]
          (delete! 204 (cards! writable-id 2))
          (let [small-ids (cards! writable-id 4)
                large-ids (cards! writable-id 10)
                small     (t2/with-call-count [call-count] (delete! 204 small-ids) (call-count))
                large     (t2/with-call-count [call-count] (delete! 204 large-ids) (call-count))]
            (is (= small large)))
          (testing "a batch with one question the user cannot write is refused and removes nothing"
            (let [ids       (cards! writable-id 4)
                  forbidden (first (cards! forbidden-id 1))]
              (t2/insert! :model/CacheConfig (for [id (cons forbidden ids)]
                                               {:model "question" :model_id id :strategy :nocache :config {}}))
              (delete! 403 (conj ids forbidden))
              (is (= 5 (t2/count :model/CacheConfig :model "question" :model_id [:in (conj ids forbidden)]))))))))))
