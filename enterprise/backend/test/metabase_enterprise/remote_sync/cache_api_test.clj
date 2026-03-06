(ns metabase-enterprise.remote-sync.cache-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as rs-settings]
   [metabase.test :as mt]))

(deftest cache-policy-on-read-only-remote-synced-dashboard-test
  (testing "Setting a cache policy on a dashboard in a remote-synced collection should succeed even when remote-sync-type is read-only"
    (mt/with-model-cleanup [:model/CacheConfig]
      (mt/with-premium-features #{:cache-granular-controls}
        (mt/with-temporary-setting-values [rs-settings/remote-sync-type :read-only]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Remote-Synced Collection"
                                                          :is_remote_synced true}
                         :model/Dashboard  {dash-id :id} {:name          "Synced Dashboard"
                                                          :collection_id coll-id}]
            (is (=? {:id pos-int?}
                    (mt/user-http-request :crowberto :put 200 "cache/"
                                          {:model    "dashboard"
                                           :model_id dash-id
                                           :strategy {:type "nocache"}})))))))))
