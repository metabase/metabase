(ns metabase-enterprise.caching.strategies-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.caching.strategies :as caching]
   [metabase-enterprise.task.caching :as task.caching]
   [metabase.models :refer [Card Dashboard Database PersistedInfo TaskHistory]]
   [metabase.models.query :as query]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment
  caching/keep-me)

(deftest query-cache-strategy-hierarchy-test
  (mt/with-premium-features #{:cache-granular-controls}
    (mt/discard-setting-changes [enable-query-caching]
      (public-settings/enable-query-caching! true)
      ;; corresponding OSS tests in metabase.query-processor.card-test
      (testing "database TTL takes effect when no dashboard or card TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {}
                       Card card {:database_id (u/the-id db)}]
          (is (= {:type     :duration
                  :duration 1337
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "card ttl only"
        (mt/with-temp [Card card {:cache_ttl 1337}]
          (is (= {:type     :duration
                  :duration 1337
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {}))))))
      (testing "multiple ttl, card wins if dash and database TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {:cache_ttl 1338}
                       Card card {:database_id (u/the-id db) :cache_ttl 1339}]
          (is (= {:type     :duration
                  :duration 1339
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "multiple ttl, dash wins when no card TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {:cache_ttl 1338}
                       Card card {:database_id (u/the-id db)}]
          (is (= {:type     :duration
                  :duration 1338
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)})))))))))

(defn do-with-persist-models [f]
  (let [two-hours-ago (t/minus (t/local-date-time) (t/hours 2))]
    (mt/with-temp
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
              (testing "First card1 has own config"
                (is (=? {:type :nocache :name "card1"}
                        (:cache-strategy (#'qp.card/query-for-card card1 {} {} {} {}))))
                (is (=? {:type :nocache :name "card1"}
                        (:cache-strategy (#'qp.card/query-for-card card1 {} {} {} {:dashboard-id (u/the-id dash)})))))
              (testing "Second card1 should hit collection or dashboard cache"
                (is (=? {:type :nocache :name "col1"}
                        (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {}))))
                (is (=? {:type :nocache :name "dash"}
                        (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {:dashboard-id (u/the-id dash)})))))
              (testing "Third card1 hits other collection cache"
                (is (=? {:type :nocache :name "col2"}
                        (:cache-strategy (#'qp.card/query-for-card card3 {} {} {} {})))))
              (testing "Fourth card1 is in collection with no config and hits db config"
                (is (=? {:type :nocache :name "db"}
                        (:cache-strategy (#'qp.card/query-for-card card4 {} {} {} {})))))
              (testing "Fifth card1 targets other db and hits root config"
                (is (=? {:type :nocache :name "root"}
                        (:cache-strategy (#'qp.card/query-for-card card5 {} {} {} {}))))))))))))

(deftest caching-strategies
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
    (mt/with-premium-features #{:cache-granular-controls}

      (let [query (mt/mbql-query venues {:order-by [[:asc $id]] :limit 5})
            mkres (fn [input]
                    {:cache/details (if input
                                      {:cached true, :updated_at input, :hash some?}
                                      {:stored true, :hash some?})
                     :row_count     5
                     :status        :completed})]
        (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
          (testing "strategy = ttl"
            (let [query (assoc query :cache-strategy {:type           :ttl
                                                      :multiplier     10
                                                      :min_duration   0
                                                      :avg-execution-ms 500})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:00:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (testing "4 seconds past that results are still there - 10 * 500 = 5 seconds"
                (mt/with-clock #t "2024-02-13T10:00:04Z"
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (testing "6 seconds later results are unavailable"
                (mt/with-clock #t "2024-02-13T10:00:06Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data)))))))))

        (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
          (testing "strategy = duration"
            (let [query (assoc query :cache-strategy {:type         :duration
                                                      :duration     1
                                                      :unit         "minutes"
                                                      :min_duration 0})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:00:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data)))))
                (mt/with-clock #t "2024-02-13T10:00:59Z"
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data)))))
                (mt/with-clock #t "2024-02-13T10:01:01Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data)))))))))

        (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
          (testing "strategy = schedule || query"
            (let [query (assoc query :cache-strategy {:type       :schedule
                                                      :schedule   "0/2 * * * *"
                                                      :last-expired-at (t/offset-date-time #t "2024-02-13T10:00:00Z")})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:01:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:01:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (let [query (assoc-in query [:cache-strategy :last-expired-at] (t/offset-date-time #t "2024-02-13T10:02:00Z"))]
                (testing "Cache is invalidated when schedule ran after the query"
                  (mt/with-clock #t "2024-02-13T10:03:00Z"
                    (is (=? (mkres nil)
                            (-> (qp/process-query query) (dissoc :data))))))
                (testing "schedule did not run - cache is still intact"
                  (mt/with-clock #t "2024-02-13T10:08:00Z"
                    (is (=? (mkres #t "2024-02-13T10:03:00Z")
                            (-> (qp/process-query query) (dissoc :data))))))))))))))

(deftest e2e-advanced-caching
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
    (mt/with-premium-features #{:cache-granular-controls}
      (mt/dataset (mt/dataset-definition "caching1"
                                         ["table"
                                          [{:field-name "value" :indexed? true :base-type :type/Text}]
                                          [["a"] ["b"] ["c"]]])
        (mt/with-temp [:model/Card       card1 {:dataset_query (mt/mbql-query table)}
                       :model/Card       card2 {:dataset_query (mt/mbql-query table)}
                       :model/Card       card3 {:dataset_query (mt/mbql-query table)}
                       :model/Card       card4 {:dataset_query (mt/mbql-query table)}
                       :model/Card       card5 {:dataset_query (mt/mbql-query table)}

                       :model/CacheConfig _c1 {:model    "question"
                                               :model_id (:id card1)
                                               :strategy :ttl
                                               :config   {:multiplier   100
                                                          :min_duration 1}}
                       :model/CacheConfig _c2 {:model    "question"
                                               :model_id (:id card2)
                                               :strategy :duration
                                               :config   {:duration 1
                                                          :unit     "minutes"}}
                       :model/CacheConfig _c3 {:model    "question"
                                               :model_id (:id card3)
                                               :strategy :schedule
                                               :config   {:schedule "0 0/2 * * * ? *"}}
                       :model/CacheConfig c4  {:model    "question"
                                               :model_id (:id card4)
                                               :strategy :query
                                               :config   {:field_id    (mt/id :table :id)
                                                          :aggregation "max"
                                                          :schedule    "0 0/2 * * * ? *"}}]
          (let [t     (fn [seconds]
                        (t/plus #t "2024-02-13T10:00:00Z" (t/duration seconds :seconds)))
                mkres (fn [input]
                        {:cache/details (if input
                                          {:cached true, :updated_at input, :hash some?}
                                          {:stored true, :hash some?})
                         :row_count     3
                         :status        :completed})]
            (testing "strategy = ttl"
              (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                (mt/with-clock (t 0)
                  (let [q (with-redefs [query/average-execution-time-ms (constantly 1000)]
                            (#'qp.card/query-for-card card1 {} {} {} {}))]
                    (is (=? {:type :ttl}
                            (:cache-strategy q)))
                    (is (=? (mkres nil)
                            (-> (qp/process-query q) (dissoc :data))))
                    (testing "There is cache on second call"
                      (is (=? (mkres (t 0))
                              (-> (qp/process-query q) (dissoc :data)))))
                    (testing "No cache after expiration"
                      (mt/with-clock (t 101) ;; avg execution time 1s * multiplier 100 + 1
                        (is (=? (mkres nil)
                                (-> (qp/process-query q) (dissoc :data))))))))))

            (testing "strategy = duration"
              (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                (mt/with-clock (t 0)
                  (let [q (#'qp.card/query-for-card card2 {} {} {} {})]
                    (is (=? {:type :duration}
                            (:cache-strategy q)))
                    (is (=? (mkres nil)
                            (-> (qp/process-query q) (dissoc :data))))
                    (testing "There is cache on the next call"
                      (is (=? (mkres (t 0))
                              (-> (qp/process-query q) (dissoc :data)))))
                    (testing "No cache after expiration"
                      (mt/with-clock (t 61)
                        (is (=? (mkres nil)
                                (-> (qp/process-query q) (dissoc :data))))))))))

            (testing "strategy = schedule"
              (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                (mt/with-clock (t 0)
                  (is (pos? (#'task.caching/refresh-schedule-configs)))
                  (let [q (#'qp.card/query-for-card card3 {} {} {} {})]
                    (is (=? {:type :schedule}
                            (:cache-strategy q)))
                    (is (=? (mkres nil)
                            (-> (qp/process-query q) (dissoc :data))))
                    (testing "There is cache on second call"
                      (is (=? (mkres (t 0))
                              (-> (qp/process-query q) (dissoc :data)))))))
                (testing "No cache after job ran again"
                  (mt/with-clock (t 121)
                    (is (pos? (#'task.caching/refresh-schedule-configs)))
                    (let [q (#'qp.card/query-for-card card3 {} {} {} {})]
                      (is (=? (mkres nil)
                              (-> (qp/process-query q) (dissoc :data)))))))))

            (testing "strategy = query"
              (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                (mt/with-clock (t 0)
                  (is (pos? (#'task.caching/refresh-query-configs)))
                  (let [q (#'qp.card/query-for-card card4 {} {} {} {})]
                    (is (=? {:type :query}
                            (:cache-strategy q)))
                    (is (=? (mkres nil)
                            (-> (qp/process-query q) (dissoc :data))))
                    (testing "There is cache on second call"
                      (is (= 1 (count (t2/select :model/QueryCache))))
                      (is (=? (mkres (t 0))
                              (-> (qp/process-query q) (dissoc :data)))))))

                (mt/with-clock (t 121)
                  (is (pos? (#'task.caching/refresh-query-configs)))
                  (testing "Nothing to run, because it's already scheduled for later"
                    (is (zero? (#'task.caching/refresh-query-configs))))
                  (testing "Job ran again, but state has not changed, so there's still cache"
                    (let [q (#'qp.card/query-for-card card4 {} {} {} {})]
                      (is (=? (mkres (t 0))
                              (-> (qp/process-query q) (dissoc :data)))))))

                (mt/with-clock (t 242)
                  (t2/update! :model/CacheConfig {:id (:id c4)} {:config (assoc (:config c4)
                                                                                :field_id (mt/id :table :value))})
                  (is (pos? (#'task.caching/refresh-query-configs)))
                  (testing "But no cache after the data has changed"
                    (let [q (#'qp.card/query-for-card card4 {} {} {} {})]
                      (is (=? (mkres nil)
                              (-> (qp/process-query q) (dissoc :data)))))))))

            (testing "default strategy = ttl"
              (let [q (#'qp.card/query-for-card card5 {} {} {} {})]
                (is (=? {:type :ttl}
                        (:cache-strategy q)))))))))))
