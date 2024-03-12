(ns metabase-enterprise.advanced-config.caching-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models :refer [Card Dashboard Database PersistedInfo TaskHistory]]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.card :as qp.card]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest query-cache-ttl-hierarchy-test
  (mt/with-premium-features #{:cache-granular-controls}
    (mt/discard-setting-changes [enable-query-caching]
      (public-settings/enable-query-caching! true)
      ;; corresponding OSS tests in metabase.query-processor.card-test
      (testing "database TTL takes effect when no dashboard or card TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {}
                       Card card {:database_id (u/the-id db)}]
          (is (= (* 3600 1337)
                 (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "card ttl only"
        (mt/with-temp [Card card {:cache_ttl 1337}]
          (is (= (* 3600 1337) (:cache-ttl (#'qp.card/query-for-card card {} {} {}))))))
      (testing "multiple ttl, card wins if dash and database TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {:cache_ttl 1338}
                       Card card {:database_id (u/the-id db) :cache_ttl 1339}]
          (is (= (* 3600 1339) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "multiple ttl, dash wins when no card TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {:cache_ttl 1338}
                       Card card {:database_id (u/the-id db)}]
          (is (= (* 3600 1338) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)})))))))))

(defn do-with-persist-models [f]
  (let [two-hours-ago (t/minus (t/local-date-time) (t/hours 2))]
    (t2.with-temp/with-temp
      [Database db {:settings {:persist-models-enabled true}}
       Card     creating  {:type :model, :database_id (u/the-id db)}
       Card     deletable {:type :model, :database_id (u/the-id db)}
       Card     off       {:type :model, :database_id (u/the-id db)}
       PersistedInfo pcreating  {:card_id (u/the-id creating)
                                 :database_id (u/the-id db)
                                 :state "creating"
                                 :state_change_at two-hours-ago}
       PersistedInfo pdeletable {:card_id (u/the-id deletable)
                                 :database_id (u/the-id db)
                                 :state "deletable"
                                 :state_change_at two-hours-ago}
       PersistedInfo poff       {:card_id (u/the-id off)
                                 :database_id (u/the-id db)
                                 :state "off"
                                 :state_change_at two-hours-ago}]
      (f {:db         db
          :creating   creating
          :deletable  deletable
          :off        off
          :pcreating  pcreating
          :pdeletable pdeletable
          :poff       poff}))))

(defmacro with-temp-persist-models
  "Creates a temp database with three models, each with different persisted info states: creating, deletable, and off."
  {:style/indent 1}
  [[& bindings] & body]
  `(do-with-persist-models
    (fn [{:keys [~@bindings]}] ~@body)))

(deftest model-caching-granular-controls-test
  (mt/with-model-cleanup [TaskHistory]
    (testing "with :cache-granular-controls enabled, don't refresh any tables in an 'off' or 'deletable' state"
      (mt/with-premium-features #{:cache-granular-controls}
        (with-temp-persist-models [db creating poff pdeletable]
          (testing "Calls refresh on each persisted-info row"
            (let [card-ids       (atom #{})
                  test-refresher (reify task.persist-refresh/Refresher
                                   (refresh! [_ _database _definition card]
                                     (swap! card-ids conj (:id card))
                                     {:state :success})
                                   (unpersist! [_ _database _persisted-info]))]
              (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher)
              (testing "Doesn't refresh models that have state='off' or 'deletable' if :cache-granular-controls feature flag is enabled"
                (is (= #{(u/the-id creating)} @card-ids)))
              (is (partial= {:task         "persist-refresh"
                             :task_details {:success 1 :error 0}}
                            (t2/select-one TaskHistory
                                           :db_id (u/the-id db)
                                           :task "persist-refresh"
                                           {:order-by [[:id :desc]]})))
              (testing "Deletes backing tables of models that have state='off'"
                (let [unpersisted-ids (atom #{})
                      test-refresher  (reify task.persist-refresh/Refresher
                                        (unpersist! [_ _database persisted-info]
                                          (swap! unpersisted-ids conj (:id persisted-info))))
                      deleted?        (fn [{id :id}]
                                        (not (t2/exists? :model/PersistedInfo :id id)))]
                  (#'task.persist-refresh/prune-all-deletable! test-refresher)
                  (is (set/subset? (set [(:id pdeletable) (:id poff)])
                                   @unpersisted-ids))
                  (is (deleted? pdeletable))
                  (testing "But does not delete the persisted_info record for \"off\" models"
                    (is (not (deleted? poff)))))))))))))

(deftest model-caching-granular-controls-test-2
  (mt/with-model-cleanup [TaskHistory]
    (testing "with :cache-granular-controls disabled, refresh tables in an 'off' state, but not 'deletable'"
        (mt/with-premium-features #{}
          (with-temp-persist-models [db creating off]
            (testing "Calls refresh on each persisted-info row"
              (let [card-ids (atom #{})
                    test-refresher (reify task.persist-refresh/Refresher
                                     (refresh! [_ _database _definition card]
                                       (swap! card-ids conj (:id card))
                                       {:state :success})
                                     (unpersist! [_ _database _persisted-info]))]
                (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher)
                (is (= #{(u/the-id creating) (u/the-id off)} @card-ids))
                (is (partial= {:task "persist-refresh"
                               :task_details {:success 2 :error 0}}
                              (t2/select-one TaskHistory
                                             :db_id (u/the-id db)
                                             :task "persist-refresh"
                                             {:order-by [[:id :desc]]}))))))))))

(deftest model-caching-granular-controls-test-3
  (mt/with-model-cleanup [TaskHistory]
    (testing "with :cache-granular-controls enabled, deletes any tables with state=deletable or state=off"
        (mt/with-premium-features #{:cache-granular-controls}
          (with-temp-persist-models [pdeletable poff]
            (let [deletable-persisted-infos [pdeletable poff]
                  called-on (atom #{})
                  test-refresher (reify task.persist-refresh/Refresher
                                   (refresh! [_ _ _ _]
                                     (is false "refresh! called on a model that should not be refreshed"))
                                   (unpersist! [_ _database persisted-info]
                                     (swap! called-on conj (u/the-id persisted-info))))
                  queued-for-deletion (into #{} (map :id) (#'task.persist-refresh/deletable-models))]
              (testing "Query finds deletabable, and off persisted infos"
                (is (= (set (map u/the-id deletable-persisted-infos)) queued-for-deletion)))
              ;; we manually pass in the deleteable ones to not catch others in a running instance
              (testing "Both deletables are pruned by prune-deletables!"
                (#'task.persist-refresh/prune-deletables! test-refresher deletable-persisted-infos)
                (is (= (set (map u/the-id deletable-persisted-infos)) @called-on))
                (is (partial= {:task "unpersist-tables"
                               :task_details {:success 2 :error 0, :skipped 0}}
                              (t2/select-one TaskHistory
                                             :task "unpersist-tables"
                                             {:order-by [[:id :desc]]}))))))))))

(deftest model-caching-granular-controls-test-4
  (mt/with-model-cleanup [TaskHistory]
    (testing "with :cache-granular-controls disabled, deletes any tables with state=deletable, but not state=off"
      (mt/with-premium-features #{}
        (with-temp-persist-models [pdeletable poff]
          (let [called-on (atom #{})
                test-refresher (reify task.persist-refresh/Refresher
                                 (refresh! [_ _ _ _]
                                   (is false "refresh! called on a model that should not be refreshed"))
                                 (unpersist! [_ _database persisted-info]
                                   (swap! called-on conj (u/the-id persisted-info))))
                queued-for-deletion (into #{} (map :id) (#'task.persist-refresh/deletable-models))]
            (testing "Query finds only state='deletabable' persisted info, and not state='off'"
              (is (contains? queued-for-deletion (u/the-id pdeletable)))
              (is (not (contains? queued-for-deletion (u/the-id poff)))))
              ;; we manually pass in the deleteable ones to not catch others in a running instance
            (testing "Only state='deletable' is pruned by prune-deletables!, and not state='off'"
              (#'task.persist-refresh/prune-deletables! test-refresher [pdeletable poff])
              (is (contains? @called-on (u/the-id pdeletable)))
              (is (not (contains? @called-on (u/the-id poff))))
              (is (partial= {:task "unpersist-tables"
                             :task_details {:success 1 :error 0, :skipped 1}}
                            (t2/select-one TaskHistory
                                           :task "unpersist-tables"
                                           {:order-by [[:id :desc]]}))))))))))
