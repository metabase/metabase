(ns ^:synchronized metabase.app-db.snapshot-test-util.cache-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [mb.hawk.hooks :as hooks]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.cache :as cache]
   [metabase.app-db.snapshot-test-util.local :as snapshot.local]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util.encryption-test :as encryption-test]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (cache/clear!)
    (try
      (encryption-test/with-secret-key nil (thunk))
      (finally (cache/clear!)))))

(defn- small-snapshot []
  "CREATE TABLE bird (id INT);")

(deftest flavor-and-boundary-test
  (let [file (cache/ensure-snapshot! :h2 "boundary-a" small-snapshot)]
    (is (= file (cache/ensure-snapshot! :h2 "boundary-a" #(throw (ex-info "cache miss" {})))))
    (is (not= file (cache/ensure-snapshot! :h2 "boundary-b" small-snapshot)))
    (is (not= file (cache/ensure-snapshot! :postgres "boundary-a" small-snapshot)))))

(deftest run-cleanup-test
  (doseq [fail? [false true]]
    (testing (if fail? "failed run" "successful run")
      (let [file (cache/ensure-snapshot! :h2 "boundary-a" small-snapshot)
            directory (.getParentFile file)]
        (try
          (try
            (when fail? (throw (ex-info "test run failed" {})))
            (finally
              ((methodical/primary-method hooks/after-run ::cache/snapshots) {})))
          (catch Exception e
            (is (= "test run failed" (ex-message e)))))
        (is (not (.exists directory)))
        (let [next-file (cache/ensure-snapshot! :h2 "boundary-a" small-snapshot)]
          (is (.isFile next-file))
          (is (not= file next-file)))))))

(deftest before-run-clears-old-cache-test
  (let [file (cache/ensure-snapshot! :h2 "boundary-a" small-snapshot)]
    ((methodical/primary-method hooks/before-run ::cache/snapshots) {})
    (is (not (.exists (.getParentFile file))))
    (is (not= file (cache/ensure-snapshot! :h2 "boundary-a" small-snapshot)))))

(deftest failed-generation-can-retry-test
  (is (thrown-with-msg? Exception #"generation failed"
                        (cache/ensure-snapshot! :h2 "boundary-a" #(throw (ex-info "generation failed" {})))))
  (is (.isFile (cache/ensure-snapshot! :h2 "boundary-a" small-snapshot))))

(deftest concurrent-requests-test
  (let [generated (atom 0)
        started (promise)
        finish (promise)
        create! (fn []
                  (swap! generated inc)
                  (deliver started true)
                  (when (= ::timeout (deref finish 10000 ::timeout))
                    (throw (ex-info "generation timed out" {})))
                  (small-snapshot))
        first-request (future (cache/ensure-snapshot! :h2 "boundary-a" create!))]
    (try
      (is (true? (deref started 10000 ::timeout)))
      (let [second-started (promise)
            second-request (future
                             (deliver second-started true)
                             (cache/ensure-snapshot! :h2 "boundary-a" create!))]
        (try
          (is (true? (deref second-started 10000 ::timeout)))
          (deliver finish true)
          (let [file (deref first-request 10000 ::timeout)]
            (is (not= ::timeout file))
            (is (= file (deref second-request 10000 ::timeout))))
          (is (= 1 @generated))
          (finally (future-cancel second-request))))
      (finally
        (deliver finish true)
        (future-cancel first-request)))))

(deftest invalid-requests-test
  (is (thrown-with-msg? Exception #"Unsupported snapshot flavor"
                        (cache/ensure-snapshot! :unknown "boundary" small-snapshot)))
  (is (thrown-with-msg? Exception #"changeset ID is required"
                        (cache/ensure-snapshot! :h2 nil small-snapshot)))
  (encryption-test/with-secret-key "dont-tell-anyone-about-this"
    (is (thrown-with-msg? Exception #"encryption to be disabled"
                          (cache/ensure-snapshot! :h2 "boundary" small-snapshot)))))

(deftest automatic-setup-test
  (let [prepared (atom 0)
        prepare (dynamic-redefs/original-fn #'impl/migrate-to-start-uncached!)
        versions (atom [])]
    (mt/with-dynamic-fn-redefs [impl/migrate-to-start-uncached! (fn [& args]
                                                                  (swap! prepared inc)
                                                                  (apply prepare args))]
      (dotimes [_ 2]
        (impl/test-migrations-for-driver!
         :h2 ["v45.00-002" "v45.00-002"]
         (fn [migrate!]
           (let [db {:datasource (mdb/data-source)}]
             (is (empty? (jdbc/query db ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"])))
             (swap! versions conj (jdbc/query db ["SELECT * FROM DATABASECHANGELOG_VERSION ORDER BY deployment_id"]))
             (jdbc/execute! db ["CREATE TABLE snapshot_bird (id INT)"])
             (jdbc/execute! db ["INSERT INTO snapshot_bird VALUES (7)"])
             (migrate!)
             (is (= [{:id "v45.00-002"}]
                    (jdbc/query db ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"])))
             (is (= [{:id 7}] (jdbc/query db ["SELECT id FROM snapshot_bird"])))))))
      (is (= 1 @prepared))
      (is (seq (first @versions)))
      (is (apply = @versions)))))

(deftest boundary-order-test
  (mt/with-dynamic-fn-redefs [snapshot/changesets (constantly [["v00.00-000"] ["z-new"] ["a-new"]])]
    (is (nil? (#'impl/previous-changeset-id nil "v00.00-000")))
    (is (= "z-new" (#'impl/previous-changeset-id nil "a-new")))
    (is (thrown-with-msg? Exception #"Migration ID not found"
                          (#'impl/previous-changeset-id nil "unknown")))))

(deftest setup-fallback-test
  (doseq [reason [:first-migration :encryption :missing-client]]
    (testing (name reason)
      (let [prepared (atom 0)
            prepare (dynamic-redefs/original-fn #'impl/migrate-to-start-uncached!)
            start-id (if (= reason :first-migration) "v00.00-000" "v45.00-002")]
        (encryption-test/with-secret-key (when (= reason :encryption) "dont-tell-anyone-about-this")
          (mt/with-dynamic-fn-redefs [impl/migrate-to-start-uncached! (fn [& args]
                                                                        (swap! prepared inc)
                                                                        (apply prepare args))
                                      snapshot.local/dump-options (fn [& _]
                                                                    (when-not (= reason :missing-client)
                                                                      (throw (ex-info "Unexpected dump client lookup" {}))))
                                      cache/ensure-snapshot! (fn [& _] (throw (ex-info "Unexpected cache use" {})))]
            (dotimes [_ 2]
              (impl/with-temp-empty-app-db [conn :h2]
                (#'impl/migrate-to-start! conn :h2 start-id)))))
        (is (= 2 @prepared))))))

(deftest checked-in-snapshot-setup-test
  (let [loaded (atom 0)
        load-snapshot! (dynamic-redefs/original-fn #'snapshot/load-snapshot!)
        start-id (impl/with-temp-empty-app-db [conn :h2]
                   (first (last (snapshot/changesets conn))))
        histories (atom [])]
    (mt/with-dynamic-fn-redefs [snapshot/load-snapshot! (fn [& args]
                                                          (swap! loaded inc)
                                                          (apply load-snapshot! args))]
      (dotimes [_ 2]
        (impl/with-temp-empty-app-db [conn :h2]
          (#'impl/migrate-to-start! conn :h2 start-id)
          (swap! histories conj (jdbc/query {:connection conn}
                                            ["SELECT id, orderexecuted FROM DATABASECHANGELOG ORDER BY orderexecuted"])))))
    (is (= 1 @loaded))
    (is (seq (first @histories)))
    (is (apply = @histories))))
