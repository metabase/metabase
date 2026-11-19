(ns metabase.sync.initial-sync-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.driver.settings :as driver.settings]
   [metabase.serialization.core :as serialization]
   [metabase.sync.core :as sync]
   [metabase.sync.sync :as sync.sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- submitted-by!
  "The number of tasks `thunk` submits, which run at once on this thread."
  [thunk]
  (let [submitted (atom 0)]
    (mt/with-dynamic-fn-redefs [quick-task/submit-task!         (fn [task] (swap! submitted inc) (task))
                                sync.sync/sync-database!        (fn [_id] nil)
                                sync-metadata/sync-db-metadata! (fn [_id] nil)]
      (thunk))
    @submitted))

(deftest start-initial-sync-conditions-test
  (let [db   {:id 1 :is_full_sync true :is_stub false}
        stub (assoc db :is_stub true)]
    (testing "a created Database is synced"
      (is (= 1 (submitted-by! #(sync/start-initial-sync! db nil)))))
    (testing "a created stub is not synced"
      (is (= 0 (submitted-by! #(sync/start-initial-sync! stub nil)))))
    (testing "a stub that gets connected is synced"
      (is (= 1 (submitted-by! #(sync/start-initial-sync! db stub)))))
    (testing "a stub that stays a stub is not synced"
      (is (= 0 (submitted-by! #(sync/start-initial-sync! stub stub)))))
    (testing "an update of a connected Database is not synced"
      (is (= 0 (submitted-by! #(sync/start-initial-sync! db db)))))
    (testing "nothing is synced when auto sync is disabled"
      (mt/with-temporary-setting-values [disable-auto-sync true]
        (is (= 0 (submitted-by! #(sync/start-initial-sync! db nil))))))))

(deftest start-initial-sync-kind-test
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [quick-task/submit-task!         (fn [task] (task))
                                sync.sync/sync-database!        (fn [_id] (swap! calls conj :full))
                                sync-metadata/sync-db-metadata! (fn [_id] (swap! calls conj :metadata))]
      (sync/start-initial-sync! {:id 1 :is_full_sync true} nil)
      (sync/start-initial-sync! {:id 1 :is_full_sync false} nil))
    (is (= [:full :metadata] @calls))))

(deftest start-initial-sync-after-commit-test
  (let [submitted (atom 0)]
    (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [_task] (swap! submitted inc))]
      (testing "the sync of a Database written in a transaction starts once the transaction commits"
        (t2/with-transaction [_conn]
          (sync/start-initial-sync! {:id 1} nil)
          (is (zero? @submitted)))
        (is (= 1 @submitted)))
      (testing "the sync of a Database written in a transaction that rolls back never starts"
        (reset! submitted 0)
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (sync/start-initial-sync! {:id 1} nil))
        (is (zero? @submitted))))))

(defn- database-row []
  {:name (mt/random-name) :engine :h2 :details (:details (mt/db))})

(deftest model-insert-starts-no-sync-test
  (testing "a Database inserted through the model, with a user bound, gets no sync of its own"
    (mt/with-model-cleanup [:model/Database]
      (let [row (database-row)]
        (is (= 0 (submitted-by! #(mt/with-current-user (mt/user->id :crowberto)
                                   (t2/insert! :model/Database row)))))))))

(deftest serdes-import-starts-no-sync-test
  (testing "a Database a SerDes import creates, with a user bound, gets no sync of its own"
    (mt/with-temp [:model/Database db {:engine :postgres :details {:host "localhost" :dbname "serdes"}}]
      (let [[exported] (into [] (serialization/export :model/Database [db]))
            imported   (assoc exported :name (mt/random-name))]
        (mt/with-model-cleanup [:model/Database]
          (is (= 0 (submitted-by! #(mt/with-current-user (mt/user->id :crowberto)
                                     (serialization/load-all [(serialization/key-of imported)]
                                                             (fn [_ks] [imported]))))))
          (is (t2/exists? :model/Database :name (:name imported))))))))

(defn- wait-for-initial-sync
  "The `initial_sync_status` of the Database `db-id` once its sync ends, or after a minute."
  [db-id]
  (loop [n 0]
    (let [status (t2/select-one-fn :initial_sync_status :model/Database :id db-id)]
      (if (or (#{"complete" "aborted"} status) (= n 120))
        status
        (do (Thread/sleep 500)
            (recur (inc n)))))))

(deftest api-create-syncs-test
  (testing "POST /api/database submits one sync once the insert commits, which syncs the Database"
    (mt/with-model-cleanup [:model/Database]
      (let [submits  (atom [])
            original (mt/original-fn #'quick-task/submit-task!)]
        (with-redefs [driver.settings/*allow-testing-h2-connections* true]
          (mt/with-dynamic-fn-redefs [quick-task/submit-task! (fn [task]
                                                                (swap! submits conj (mdb/in-transaction?))
                                                                (original task))]
            (let [{db-id :id} (mt/user-http-request :crowberto :post 200 "database" (database-row))]
              (is (= [false] @submits))
              (is (= "complete" (wait-for-initial-sync db-id)))
              (is (pos? (t2/count :model/Table :db_id db-id))))))))))

(deftest api-connecting-stub-syncs-test
  (mt/with-model-cleanup [:model/Database]
    (let [stub-id (t2/insert-returning-pk! :model/Database (assoc (database-row) :is_stub true :details {:db "mem:stub"}))
          db-id   (t2/insert-returning-pk! :model/Database (database-row))]
      (testing "PUT /api/database/:id that gives a stub its details connects and syncs it"
        (with-redefs [driver.settings/*allow-testing-h2-connections* true]
          (let [details (:details (mt/db))]
            (is (= 1 (submitted-by! #(mt/user-http-request :crowberto :put 200 (str "database/" stub-id)
                                                           {:details details}))))))
        (is (false? (t2/select-one-fn :is_stub :model/Database :id stub-id))))
      (testing "PUT /api/database/:id on a connected Database does not"
        (is (= 0 (submitted-by! #(mt/user-http-request :crowberto :put 200 (str "database/" db-id)
                                                       {:description "d"}))))))))
