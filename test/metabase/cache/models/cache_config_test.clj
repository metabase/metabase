(ns metabase.cache.models.cache-config-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- status-code
  "The `:status-code` of the ex-info `thunk` throws, or nil when it does not throw one."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(deftest insert-checks-target-test
  (mt/with-model-cleanup [:model/CacheConfig]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (doseq [[target message] [[{:model "card" :model_id card-id} "unknown model"]
                                [{:model "root" :model_id card-id} "root config with positive model_id"]
                                [{:model "question" :model_id 0} "question config with model_id 0"]]]
        (testing message
          (is (= 400 (status-code #(t2/insert! :model/CacheConfig (merge {:strategy :nocache :config {}} target))))))))))

(deftest insert-checks-strategy-test
  (mt/with-model-cleanup [:model/CacheConfig]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (doseq [[row message] [[{:strategy :ttl :config {}} "ttl without multiplier"]
                             [{:strategy :schedule :config {:schedule "not a cron"}} "invalid cron schedule"]
                             [{:strategy :duration :config {:duration 1 :unit "weeks"}} "unknown duration unit"]
                             [{:strategy :sometimes :config {}} "unknown strategy"]]]
        (testing message
          (is (= 400 (status-code #(t2/insert! :model/CacheConfig
                                               (merge {:model "question" :model_id card-id} row))))))))))

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

(deftest update-checks-strategy-test
  (mt/with-temp [:model/Card        {card-id :id}   {}
                 :model/CacheConfig {config-id :id} {:model "question" :model_id card-id}]
    (testing "strategy that does not fit the stored config"
      (is (= 400 (status-code #(t2/update! :model/CacheConfig :id config-id {:strategy :ttl})))))
    (testing "strategy with config that fits it"
      (t2/update! :model/CacheConfig :id config-id {:strategy :ttl :config {:multiplier 10 :min_duration_ms 100}})
      (is (=? {:strategy :ttl} (t2/select-one :model/CacheConfig :id config-id))))
    (testing "columns outside the strategy"
      (t2/update! :model/CacheConfig :id config-id {:next_run_at nil})
      (is (=? {:strategy :ttl} (t2/select-one :model/CacheConfig :id config-id))))))

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
