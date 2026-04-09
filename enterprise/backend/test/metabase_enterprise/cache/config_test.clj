(ns metabase-enterprise.cache.config-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.cache.config :as cache.config]
   [metabase.events.core :as events]
   [metabase.model-persistence.task.persist-refresh :as task.persist-refresh]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment
  cache.config/keep-me)

(defn do-with-persist-models [f]
  (let [two-hours-ago (t/minus (t/local-date-time) (t/hours 2))]
    (mt/with-temp
      [:model/Database db {:settings {:persist-models-enabled true}}
       :model/Card     creating  {:type :model, :database_id (u/the-id db)}
       :model/Card     deletable {:type :model, :database_id (u/the-id db)}
       :model/Card     off       {:type :model, :database_id (u/the-id db)}
       :model/PersistedInfo pcreating  {:card_id (u/the-id creating)
                                        :database_id (u/the-id db)
                                        :state "creating"
                                        :state_change_at two-hours-ago}
       :model/PersistedInfo pdeletable {:card_id (u/the-id deletable)
                                        :database_id (u/the-id db)
                                        :state "deletable"
                                        :state_change_at two-hours-ago}
       :model/PersistedInfo poff       {:card_id (u/the-id off)
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

(deftest refreshing-models-are-refreshed
  ;; models might get stuck in "refreshing" mode and need to be "kicked". This is actually the case in the OSS
  ;; version, but when [[metabase-enterprise.cache.config/refreshable-states]] was extracted, "refreshing" was not
  ;; carried over.
  ;;
  ;; This affects mostly models that were refreshing when an instance was restarted.  both OSS and enterprise should
  ;; behave this way. Don't know how to exercise both in the same jvm, but will let CI sort it out.
  (let [two-hours-ago (t/minus (t/local-date-time) (t/hours 2))]
    (mt/with-temp
      [:model/Database db {:settings {:persist-models-enabled true}}
       :model/Card          refreshing  {:type :model, :database_id (u/the-id db)}
       :model/PersistedInfo prefreshing {:card_id         (u/the-id refreshing)
                                         :database_id     (u/the-id db)
                                         :state           "refreshing"
                                         :state_change_at two-hours-ago}]
      (let [card-ids       (atom #{})
            test-refresher (reify task.persist-refresh/Refresher
                             (refresh! [_ _database _definition card]
                               (swap! card-ids conj (:id card))
                               {:state :success})
                             (unpersist! [_ _database _persisted-info]))
            current-state! (fn [] (t2/select-one-fn :state :model/PersistedInfo (u/the-id prefreshing)))]
        ;; ensure ee path is taken
        (mt/with-premium-features #{:cache-granular-controls}
          (is (= "refreshing" (current-state!)))
          (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher)
          (testing "Doesn't refresh models that have state='off' or 'deletable' if :cache-granular-controls feature flag is enabled"
            (is (= #{(u/the-id refreshing)} @card-ids)))
          (is (= "persisted" (current-state!))))))))

(deftest model-caching-granular-controls-test
  (mt/with-model-cleanup [:model/TaskHistory]
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
                            (t2/select-one :model/TaskHistory
                                           :db_id (u/the-id db)
                                           :task "persist-refresh"
                                           {:order-by [[:id :desc]]})))
              (testing "Deletes backing tables of models that have state='off'"
                (let [unpersisted-ids (atom #{})
                      deleted?        (fn [{id :id}]
                                        (not (t2/exists? :model/PersistedInfo :id id)))
                      test-refresher
                      #_{:clj-kondo/ignore [:missing-protocol-method]}
                      (reify task.persist-refresh/Refresher
                        (unpersist! [_ _database persisted-info]
                          (swap! unpersisted-ids conj (:id persisted-info))))]
                  (#'task.persist-refresh/prune-all-deletable! test-refresher)
                  (is (set/subset? (set [(:id pdeletable) (:id poff)])
                                   @unpersisted-ids))
                  (is (deleted? pdeletable))
                  (testing "But does not delete the persisted_info record for \"off\" models"
                    (is (not (deleted? poff)))))))))))))

(deftest model-caching-granular-controls-test-2
  (mt/with-model-cleanup [:model/TaskHistory]
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
                            (t2/select-one :model/TaskHistory
                                           :db_id (u/the-id db)
                                           :task "persist-refresh"
                                           {:order-by [[:id :desc]]}))))))))))

(deftest model-caching-granular-controls-test-3
  (mt/with-model-cleanup [:model/TaskHistory]
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
            (testing "Query finds deletable, and off persisted infos"
              ;; use superset, because orphaned PersistedInfo records from other tests might also be deletable
              (is (set/superset? queued-for-deletion (set (map u/the-id deletable-persisted-infos)))))
              ;; we manually pass in the deletable ones to not catch others in a running instance
            (testing "Both deletables are pruned by prune-deletables!"
              (#'task.persist-refresh/prune-deletables! test-refresher deletable-persisted-infos)
              (is (= (set (map u/the-id deletable-persisted-infos)) @called-on))
              (is (partial= {:task "unpersist-tables"
                             :task_details {:success 2 :error 0, :skipped 0}}
                            (t2/select-one :model/TaskHistory
                                           :task "unpersist-tables"
                                           {:order-by [[:id :desc]]}))))))))))

(deftest model-caching-granular-controls-test-4
  (mt/with-model-cleanup [:model/TaskHistory]
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
            (testing "Query finds only state='deletable' persisted info, and not state='off'"
              (is (contains? queued-for-deletion (u/the-id pdeletable)))
              (is (not (contains? queued-for-deletion (u/the-id poff)))))
              ;; we manually pass in the deletable ones to not catch others in a running instance
            (testing "Only state='deletable' is pruned by prune-deletables!, and not state='off'"
              (#'task.persist-refresh/prune-deletables! test-refresher [pdeletable poff])
              (is (contains? @called-on (u/the-id pdeletable)))
              (is (not (contains? @called-on (u/the-id poff))))
              (is (partial= {:task "unpersist-tables"
                             :task_details {:success 1 :error 0, :skipped 1}}
                            (t2/select-one :model/TaskHistory
                                           :task "unpersist-tables"
                                           {:order-by [[:id :desc]]}))))))))))

(deftest event-test
  (testing "In EE, new models are not persisted by default"
    (mt/with-premium-features #{:cache-granular-controls}
      (mt/with-temporary-setting-values [persisted-models-enabled true]
        (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                       :model/Card     card {:database_id (u/the-id db)}]
          (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :rasta)})
          (is (zero? (count (t2/select :model/PersistedInfo :card_id (u/the-id card)))))
          (events/publish-event! :event/card-create {:object (assoc card :type :model) :user-id (mt/user->id :rasta)})
          (is (= "off" (:state (t2/select-one :model/PersistedInfo :card_id (u/the-id card))))))))))
