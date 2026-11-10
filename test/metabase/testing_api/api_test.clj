(ns metabase.testing-api.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [java-time.clock]
   [metabase.app-db.core :as mdb]
   [metabase.llm.settings :as llm.settings]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.session.api :as session.api]
   [metabase.test :as mt]
   [metabase.testing-api.api :as testing]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.queue :as queue]))

(set! *warn-on-reflection* true)

(deftest snapshot-test
  (when (= (mdb/db-type) :h2)
    (let [snapshot-name (mt/random-name)]
      (testing "Just make sure the snapshot endpoint doesn't crash."
        (let [file (io/file (#'testing/snapshot-path-for-name snapshot-name))]
          (try
            (is (= nil
                   (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))))
            (testing (format "File %s should have been created" (str file))
              (is (.exists file)))
            (finally
              (.delete file))))))))

(deftest restore-test
  (when (= (mdb/db-type) :h2)
    (let [path (format "testing/restore/%s" (mt/random-name))]
      (testing "Should throw Exception if file does not exist"
        (is (= "Not found."
               (mt/user-http-request :rasta :post 404 path))))
      (testing "An indexing timeout prevents reaching the missing snapshot"
        (mt/with-dynamic-fn-redefs [search.ingestion/await-pending-updates! (constantly false)]
          (is (=? {:message "Timed out waiting for search indexing before restoring a snapshot."}
                  (mt/user-http-request :rasta :post 500 path))))))))

(deftest restore-waits-for-in-flight-indexing-test
  (mt/initialize-if-needed! :db :test-users :web-server)
  (let [test-queue    (queue/delay-queue)
        pending       (atom 2)
        queue-cleared (promise)
        restored      (promise)]
    (queue/put-with-delay! test-queue 60000 ["card" [:= :this.id 1]])
    (add-watch pending ::queue-cleared
               (fn [_key _ref _old new]
                 (when (= new 1)
                   (deliver queue-cleared true))))
    (with-redefs [search.ingestion/queue           test-queue
                  search.ingestion/pending-updates pending]
      (mt/with-dynamic-fn-redefs [testing/restore-snapshot!     (fn [_name] (deliver restored @pending))
                                  search/sync-from-restored-db! (constantly nil)]
        (let [request (future (mt/user-http-request :rasta :post 204 "testing/restore/in-flight-indexing"))]
          (try
            (is (true? (deref queue-cleared 2000 ::timeout)))
            (is (empty? test-queue))
            (is (= ::waiting (deref restored 100 ::waiting))
                "Restoration cannot start while the remaining batch is still being indexed")
            (reset! pending 0)
            (is (nil? (deref request 2000 ::timeout)))
            (is (= 0 (deref restored 2000 ::timeout)))
            (finally
              (reset! pending 0)
              (future-cancel request))))))))

(deftest e2e-test
  (when (= (mdb/db-type) :h2)
    (testing "Should be able to snapshot & restore stuff"
      (let [snapshot-name (munge (u/qualified-name ::test-snapshot))]
        (try
          (is (= nil
                 (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))))
          (is (= nil
                 (mt/user-http-request :rasta :post 204 (format "testing/restore/%s" snapshot-name))))
          (finally
            (.delete (io/file (#'testing/snapshot-path-for-name snapshot-name))))))))
  (when (= (mdb/db-type) :h2)
    (testing "Restore should reset the java-time clock"
      (let [snapshot-name (munge (u/qualified-name ::test-snapshot))]
        (try
          (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))
          ;; Set the clock to a fixed time
          (mt/user-http-request :rasta :post 200 "testing/set-time" {:time "2024-01-01T00:00:00Z"})
          (is (some? java-time.clock/*clock*) "Clock should be set before restore")
          ;; Restore should reset the clock
          (mt/user-http-request :rasta :post 204 (format "testing/restore/%s" snapshot-name))
          (is (nil? java-time.clock/*clock*) "Clock should be reset after restore")
          (finally
            (alter-var-root #'java-time.clock/*clock* (constantly nil))
            (.delete (io/file (#'testing/snapshot-path-for-name snapshot-name)))))))))

(deftest restore-refreshes-search-index-test
  (when (and (= (mdb/db-type) :h2) (search/supports-index?))
    (testing "After restore, the search index tracking atoms should reflect the restored state"
      (let [snapshot-name (munge (u/qualified-name ::search-index-snapshot))]
        (try
          ;; Ensure a search index exists before snapshotting
          (mt/user-http-request :crowberto :post 200 "search/re-init")
          (is (some? (search.index/active-table))
              "Precondition: search index should exist before snapshot")
          ;; Snapshot with a valid search index in place
          (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))
          ;; Clear the tracking atoms so we can verify they get restored
          (reset! @#'search.index/*indexes* {:active nil, :pending nil})
          (is (nil? (search.index/active-table))
              "Precondition: tracking atoms should be cleared before restore")
          ;; Restore should call sync-from-restored-db! and refresh the atoms
          (mt/user-http-request :rasta :post 204 (format "testing/restore/%s" snapshot-name))
          (is (some? (search.index/active-table))
              "After restore, the active search index table should be tracked")
          (finally
            (.delete (io/file (#'testing/snapshot-path-for-name snapshot-name)))))))))

(deftest snapshot-restore-works-with-views
  ;; workaround for https://github.com/h2database/h2database/issues/3942, see comment in
  ;; `restore-app-db-from-snapshot!` for more details
  (let [snapshot-name (str (random-uuid))]
    (mt/with-temp-empty-app-db [_conn :h2]
      (jdbc/execute! {:datasource (mdb/app-db)} ["create table test_table (a int)"])
      (jdbc/execute! {:datasource (mdb/app-db)} ["insert into test_table (a) values (1)"])
      (jdbc/execute! {:datasource (mdb/app-db)} ["create or replace view test_view as select a from test_table"])
      (jdbc/execute! {:datasource (mdb/app-db)} ["alter table test_table add column b int"])
      (#'testing/save-snapshot! snapshot-name))
    (mt/with-temp-empty-app-db [_conn :h2]
      (#'testing/restore-snapshot! snapshot-name)
      (is (= [{:a 1}] (jdbc/query {:datasource (mdb/app-db)} ["select a from test_view"]))))))

(deftest set-time-test
  (try
    (let [t (t/zoned-date-time 2024 7 8 15 00 00)]
      (testing "You can set exact date and reset it back"
        (is (= {:result "set" :time "2024-07-08T15:00:00.000Z"}
               (mt/user-http-request :rasta :post 200 "testing/set-time"
                                     {:time (u.date/format t)})))
        (is (=? {:result "reset" :time string?}
                (mt/user-http-request :rasta :post 200 "testing/set-time"))))
      (testing "You can move date with `add-ms`"
        (is (= {:result "set" :time "2024-07-08T15:00:00.000Z"}
               (mt/user-http-request :rasta :post 200 "testing/set-time"
                                     {:time (u.date/format t)})))
        (is (= {:result "set" :time "2024-07-08T15:00:10.000Z"}
               (mt/user-http-request :rasta :post 200 "testing/set-time" {:add-ms 10000})))
        (is (=? {:result "reset" :time string?}
                (mt/user-http-request :rasta :post 200 "testing/set-time")))))
    (finally
      (alter-var-root #'java-time.clock/*clock* (constantly nil)))))

(deftest reset-throttlers-test
  (let [throttler (:username @#'session.api/login-throttlers)]
    (try
      (reset! (:attempts throttler) (list ["someone@metabase.test" (System/currentTimeMillis)]))
      (testing "POST /api/testing/reset-throttlers clears accumulated throttle state"
        (is (= {:success true}
               (mt/user-http-request :rasta :post 200 "testing/reset-throttlers")))
        (is (empty? @(:attempts throttler))))
      (finally
        (reset! (:attempts throttler) nil)))))

(deftest replace-llm-providers-test
  (mt/with-temporary-setting-values [llm.settings/llm-providers []]
    (let [connections [{:key    "anthropic"
                        :type   "anthropic"
                        :name   "Anthropic"
                        :config {:api-key "sk-ant-test-key"}}]]
      (is (nil? (mt/user-http-request :rasta :put 204 "testing/llm-providers" {:value connections})))
      (is (= connections (vec (llm.settings/llm-providers))))
      (testing "unknown connection fields cannot reach storage"
        (is (nil? (mt/user-http-request :rasta :put 204 "testing/llm-providers"
                                        {:value [(assoc (first connections) :unknown "value")]})))
        (is (= connections (vec (llm.settings/llm-providers)))))
      (testing "unknown provider config fields are rejected"
        (is (some? (mt/user-http-request :rasta :put 400 "testing/llm-providers"
                                         {:value [(update (first connections) :config assoc :unknown "value")]})))
        (is (= connections (vec (llm.settings/llm-providers)))))
      (testing "provider-internal stored config fields are accepted"
        (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
          (let [vllm [{:key    "vllm"
                       :type   "vllm"
                       :name   "vLLM"
                       :config {:base-url       "http://localhost:8000/v1"
                                :model-reasoning "true"}}]]
            (is (nil? (mt/user-http-request :rasta :put 204 "testing/llm-providers" {:value vllm})))
            (is (= vllm (vec (llm.settings/llm-providers))))))))))
