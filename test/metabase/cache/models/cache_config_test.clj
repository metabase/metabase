(ns metabase.cache.models.cache-config-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.cache.schema :as cache.schema]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- status-code
  "The `:status-code` of the ex-info `thunk` throws, or nil when it does not throw one."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(deftest schema-checks-model-test
  (is (mr/validate ::cache.schema/cache-config.model "question"))
  (is (not (mr/validate ::cache.schema/cache-config.model "card")))
  (is (not (mr/validate ::cache.schema/cache-config.model-id -1))))

(deftest schema-checks-strategy-test
  (doseq [[strategy message] [[{:type :ttl} "ttl without multiplier"]
                              [{:type :schedule :schedule "not a cron" :refresh_automatically false} "invalid cron schedule"]
                              [{:type :duration :duration 1 :unit "weeks" :refresh_automatically false} "unknown duration unit"]
                              [{:type :sometimes} "unknown strategy"]]]
    (testing message
      (is (not (mr/validate ::cache.schema/cache-strategy.ee strategy)))))
  (is (mr/validate ::cache.schema/cache-strategy.ee {:type :ttl :multiplier 10 :min_duration_ms 100})))

(defn- normalize-status
  "The `:status-code` normalizing `row` by the CacheConfig schema throws, or nil when it throws none."
  [row]
  (try
    (lib/normalize ::cache.schema/cache-config.update row {:throw? true})
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(deftest schema-checks-columns-together-test
  (let [row {:model "question" :model_id 1 :strategy :ttl :config {:multiplier 10 :min_duration_ms 100}}]
    (is (nil? (normalize-status row)))
    (doseq [[changes message] [[{:model "root"} "root config with positive model_id"]
                               [{:model_id 0} "question config with model_id 0"]
                               [{:config {}} "ttl without multiplier"]]]
      (testing message
        (is (= 400 (normalize-status (merge row changes))))))
    (testing "body with only one column of a pair passes"
      (is (nil? (normalize-status {:model_id 0})))
      (is (nil? (normalize-status {:strategy :ttl}))))))

(deftest insert-accepts-valid-config-test
  (mt/with-temp [:model/Card        {card-id :id} {}
                 :model/CacheConfig {config-id :id} {:model                 "question"
                                                     :model_id              card-id
                                                     :strategy              :duration
                                                     :refresh_automatically true
                                                     :config                {:duration 1 :unit "hours"}}]
    (is (=? {:strategy :duration :config {:duration 1 :unit "hours"}}
            (t2/select-one :model/CacheConfig :id config-id)))))

(deftest update-freezes-target-test
  (mt/with-temp [:model/Card        {card-id :id}    {}
                 :model/Card        {other-id :id}   {}
                 :model/CacheConfig {config-id :id}  {:model "question" :model_id card-id}]
    (testing "model_id"
      (is (= 400 (status-code #(t2/update! :model/CacheConfig :id config-id {:model_id other-id})))))
    (testing "model"
      (is (= 400 (status-code #(t2/update! :model/CacheConfig :id config-id {:model "dashboard"})))))
    (is (=? {:model "question" :model_id card-id} (t2/select-one :model/CacheConfig :id config-id)))))

(deftest delete-card-deletes-its-cache-config-test
  (mt/with-temp [:model/Card        {card-id :id}   {}
                 :model/CacheConfig {config-id :id} {:model "question" :model_id card-id}]
    (t2/delete! :model/Card :id card-id)
    (is (not (t2/exists? :model/CacheConfig :id config-id)))))

(deftest delete-dashboard-deletes-its-cache-config-test
  (mt/with-temp [:model/Dashboard   {dashboard-id :id} {}
                 :model/CacheConfig {config-id :id}    {:model "dashboard" :model_id dashboard-id}]
    (t2/delete! :model/Dashboard :id dashboard-id)
    (is (not (t2/exists? :model/CacheConfig :id config-id)))))

(deftest delete-database-deletes-cache-configs-of-database-and-its-cards-test
  (mt/with-temp [:model/Database    {db-id :id}          {}
                 :model/Card        {card-id :id}        {:database_id db-id}
                 :model/Card        {other-card-id :id}  {}
                 :model/CacheConfig {db-config-id :id}   {:model "database" :model_id db-id}
                 :model/CacheConfig {card-config-id :id} {:model "question" :model_id card-id}
                 :model/CacheConfig {other-config-id :id} {:model "question" :model_id other-card-id}]
    (t2/delete! :model/Database :id db-id)
    (is (not (t2/exists? :model/CacheConfig :id db-config-id)))
    (is (not (t2/exists? :model/CacheConfig :id card-config-id)))
    (is (t2/exists? :model/CacheConfig :id other-config-id))))

(deftest can-read-hydration-test
  (mt/with-temp [:model/Collection  {collection-id :id} {}
                 :model/Card        {open-card-id :id}   {}
                 :model/Card        {closed-card-id :id} {:collection_id collection-id}
                 :model/Card        {other-card-id :id}  {:collection_id collection-id}
                 :model/Dashboard   {dashboard-id :id}   {:collection_id collection-id}
                 :model/CacheConfig open-config          {:model "question" :model_id open-card-id}
                 :model/CacheConfig closed-config        {:model "question" :model_id closed-card-id}
                 :model/CacheConfig other-config         {:model "question" :model_id other-card-id}
                 :model/CacheConfig dashboard-config     {:model "dashboard" :model_id dashboard-id}]
    (mt/with-non-admin-groups-no-collection-perms collection-id
      (let [configs [open-config closed-config dashboard-config]]
        (testing "a user reads the configs of targets they read"
          (mt/with-current-user (mt/user->id :rasta)
            (is (= [true false false] (map mi/can-read? (t2/hydrate configs :can_read))))))
        (testing "an admin reads every config"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (= [true true true] (map mi/can-read? (t2/hydrate configs :can_read))))))
        (testing "a list costs no more queries than one config"
          (mt/with-current-user (mt/user->id :rasta)
            (let [one-count  (t2/with-call-count [call-count]
                               (doall (t2/hydrate [closed-config] :can_read))
                               (call-count))
                  list-count (t2/with-call-count [call-count]
                               (doall (t2/hydrate [closed-config other-config] :can_read))
                               (call-count))]
              (is (= one-count list-count)))))))))

(deftest create-check-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Card       {open-card-id :id}   {}
                 :model/Card       {closed-card-id :id} {:collection_id collection-id}]
    (mt/with-non-admin-groups-no-collection-perms collection-id
      (testing "only an admin creates the root config"
        (mt/with-current-user (mt/user->id :rasta)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (api/create-check :model/CacheConfig {:model "root" :model_id 0}))))
        (mt/with-current-user (mt/user->id :crowberto)
          (is (api/create-check :model/CacheConfig {:model "root" :model_id 0}))))
      (testing "a user creates configs for cards they write"
        (mt/with-current-user (mt/user->id :rasta)
          (is (api/create-check :model/CacheConfig {:model "question" :model_id open-card-id}))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (api/create-check :model/CacheConfig {:model "question" :model_id closed-card-id}))))))))

(deftest update-check-test
  (mt/with-temp [:model/Collection  {collection-id :id} {}
                 :model/Card        {open-card-id :id}   {}
                 :model/Card        {closed-card-id :id} {:collection_id collection-id}
                 :model/CacheConfig open-config          {:model "question" :model_id open-card-id}
                 :model/CacheConfig closed-config        {:model "question" :model_id closed-card-id}]
    (mt/with-non-admin-groups-no-collection-perms collection-id
      (mt/with-current-user (mt/user->id :rasta)
        (is (api/update-check open-config {:strategy :nocache}))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (api/update-check closed-config {:strategy :nocache})))))))

(deftest can-set-cache-policy-hydration-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Card       open-card          {}
                 :model/Card       closed-card        {:collection_id collection-id}
                 :model/Dashboard  closed-dashboard   {:collection_id collection-id}]
    (mt/with-non-admin-groups-no-collection-perms collection-id
      (mt/with-current-user (mt/user->id :rasta)
        (is (= [true false]
               (map :can_set_cache_policy (t2/hydrate [open-card closed-card] :can_set_cache_policy))))
        (is (= [false]
               (map :can_set_cache_policy (t2/hydrate [closed-dashboard] :can_set_cache_policy))))))))
