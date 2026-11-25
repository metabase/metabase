(ns ^:synchronized metabase.app-db.snapshot-test-util.cache-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [mb.hawk.hooks :as hooks]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.cache :as cache]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]
   [methodical.core :as methodical])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (cache/clear!)
    (try
      (encryption-test/with-secret-key nil
        (thunk))
      (finally
        (cache/clear!)))))

(defn- small-snapshot [flavor boundary]
  {:flavor flavor, :through-changeset-id boundary, :content "CREATE TABLE bird (id INT);"})

(deftest reuse-and-isolation-test
  (let [generated (atom 0)
        options   {:flavor :h2, :through-changeset-id "boundary-a"}]
    (mt/with-dynamic-fn-redefs [generate/dump-boundary! (fn [flavor boundary]
                                                          (swap! generated inc)
                                                          (small-snapshot flavor boundary))
                                cache/validate-snapshot! (fn [_ _ _] nil)]
      (cache/with-snapshot [conn options]
        (jdbc/execute! {:connection conn} ["INSERT INTO bird VALUES (1)"]))
      (cache/with-snapshot [conn options]
        (is (= [{:n 0}] (jdbc/query {:connection conn} ["SELECT COUNT(*) AS n FROM bird"])))))
    (is (= 1 @generated))))
(deftest flavor-and-boundary-test
  (mt/with-dynamic-fn-redefs [generate/dump-boundary! small-snapshot
                              cache/validate-snapshot! (fn [_ _ _] nil)]
    (let [file (cache/ensure-snapshot! :h2 "boundary-a")]
      (is (= file (cache/ensure-snapshot! :h2 "boundary-a")))
      (is (not= file (cache/ensure-snapshot! :h2 "boundary-b")))
      (is (not= file (cache/ensure-snapshot! :postgres "boundary-a"))))))
(deftest run-cleanup-test
  (doseq [fail? [false true]]
    (testing (if fail? "failed run" "successful run")
      (let [generated (atom 0)
            after-run (methodical/primary-method hooks/after-run ::cache/snapshots)]
        (mt/with-dynamic-fn-redefs [generate/dump-boundary! (fn [flavor boundary]
                                                              (swap! generated inc)
                                                              (small-snapshot flavor boundary))
                                    cache/validate-snapshot! (fn [_ _ _] nil)]
          (let [file (cache/ensure-snapshot! :h2 "boundary-a")
                directory (.getParentFile file)]
            (try
              (try
                (is (.isFile file))
                (when fail?
                  (throw (ex-info "test run failed" {})))
                (finally
                  (after-run {})))
              (catch Exception e
                (is (= "test run failed" (ex-message e)))))
            (is (not (.exists file)))
            (is (not (.exists directory)))
            (is (not= file (cache/ensure-snapshot! :h2 "boundary-a")))
            (is (= 2 @generated))
            (cache/clear!)))))))
(deftest before-run-clears-old-cache-test
  (mt/with-dynamic-fn-redefs [generate/dump-boundary! small-snapshot
                              cache/validate-snapshot! (fn [_ _ _] nil)]
    (let [file (cache/ensure-snapshot! :h2 "boundary-a")]
      ((methodical/primary-method hooks/before-run ::cache/snapshots) {})
      (is (not (.exists (.getParentFile file))))
      (is (not= file (cache/ensure-snapshot! :h2 "boundary-a"))))))
(deftest failed-generation-can-retry-test
  (let [attempts (atom 0)]
    (mt/with-dynamic-fn-redefs [generate/dump-boundary! (fn [flavor boundary]
                                                          (when (= 1 (swap! attempts inc))
                                                            (throw (ex-info "generation failed" {})))
                                                          (small-snapshot flavor boundary))
                                cache/validate-snapshot! (fn [_ _ _] nil)]
      (is (thrown-with-msg? Exception #"generation failed"
                            (cache/ensure-snapshot! :h2 "boundary-a")))
      (is (.isFile (cache/ensure-snapshot! :h2 "boundary-a")))
      (is (= 2 @attempts)))))
(deftest validation-failure-is-not-cached-test
  (let [attempts (atom 0)]
    (mt/with-dynamic-fn-redefs [generate/dump-boundary! small-snapshot
                                cache/validate-snapshot! (fn [_ _ _]
                                                           (when (= 1 (swap! attempts inc))
                                                             (throw (ex-info "invalid snapshot" {}))))]
      (is (thrown-with-msg? Exception #"invalid snapshot"
                            (cache/ensure-snapshot! :h2 "boundary-a")))
      (is (.isFile (cache/ensure-snapshot! :h2 "boundary-a")))
      (is (= 2 @attempts)))))
(deftest concurrent-requests-test
  (let [generated (atom 0)
        started   (promise)
        finish    (promise)]
    (mt/with-dynamic-fn-redefs [generate/dump-boundary! (fn [flavor boundary]
                                                          (swap! generated inc)
                                                          (deliver started true)
                                                          (when (= ::timeout (deref finish 10000 ::timeout))
                                                            (throw (ex-info "generation timed out" {})))
                                                          (small-snapshot flavor boundary))
                                cache/validate-snapshot! (fn [_ _ _] nil)]
      (let [first-request (future (cache/ensure-snapshot! :h2 "boundary-a"))]
        (try
          (is (true? (deref started 10000 ::timeout)))
          (let [second-started (promise)
                second-request (future
                                 (deliver second-started true)
                                 (cache/ensure-snapshot! :h2 "boundary-a"))]
            (is (true? (deref second-started 10000 ::timeout)))
            (deliver finish true)
            (let [file (deref first-request 10000 ::timeout)]
              (is (instance? File file))
              (is (= file (deref second-request 10000 ::timeout))))
            (is (= 1 @generated)))
          (finally
            (deliver finish true)
            (future-cancel first-request)))))))
(deftest invalid-requests-test
  (is (thrown-with-msg? Exception #"Unsupported snapshot flavor"
                        (cache/ensure-snapshot! :unknown "boundary")))
  (is (thrown-with-msg? Exception #"changeset ID is required"
                        (cache/ensure-snapshot! :h2 nil)))
  (encryption-test/with-secret-key "dont-tell-anyone-about-this"
    (is (thrown-with-msg? Exception #"encryption to be disabled"
                          (cache/ensure-snapshot! :h2 "boundary")))))
(deftest h2-boundary-round-trip-test
  (let [options {:flavor :h2, :through-changeset-id "v45.00-001"}
        file    (cache/ensure-snapshot! :h2 "v45.00-001")]
    (is (.isFile file))
    (cache/with-snapshot [conn options]
      (is (= [{:id "v45.00-001"}]
             (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-001'"])))
      (is (seq (jdbc/query {:connection conn} ["SELECT * FROM DATABASECHANGELOG_VERSION"])))
      (is (empty? (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"])))
      (impl/run-migrations-in-range! conn ["v45.00-002" "v45.00-002"])
      (is (= [{:id "v45.00-002"}]
             (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"]))))
    (is (= file (cache/ensure-snapshot! :h2 "v45.00-001")))))
(deftest unknown-boundary-test
  (is (thrown-with-msg? Exception #"Migration ID not found"
                        (cache/ensure-snapshot! :h2 "does-not-exist"))))
(deftest versionless-boundary-round-trip-test
  (let [boundary (impl/with-temp-empty-app-db [conn :h2]
                   (some (fn [[id]] (when-not (re-find #"^v\d+\." id) id)) (snapshot/changesets conn)))]
    (is (string? boundary))
    (cache/with-snapshot [conn {:flavor :h2, :through-changeset-id boundary}]
      (is (seq (jdbc/query {:connection conn}
                           ["SELECT v.metabase_version FROM DATABASECHANGELOG c
                            JOIN DATABASECHANGELOG_VERSION v ON c.deployment_id = v.deployment_id
                            WHERE c.id = ?" boundary]))))))

(deftest server-boundary-round-trip-test
  (when (= "true" (config/config-str :mb-app-db-snapshot-regeneration-test))
    (mt/test-drivers #{:mysql :postgres}
      (let [file (cache/ensure-snapshot! driver/*driver* "v45.00-001")]
        (is (.isFile file))
        (is (= file (cache/ensure-snapshot! driver/*driver* "v45.00-001")))
        (generate/do-with-empty-db!
         driver/*driver*
         (fn [conn _server]
           (snapshot/load-sql! conn driver/*driver* (slurp file))
           (is (seq (jdbc/query {:connection conn}
                                ["SELECT v.metabase_version FROM DATABASECHANGELOG c
                                 JOIN DATABASECHANGELOG_VERSION v ON c.deployment_id = v.deployment_id
                                 WHERE c.id = 'v45.00-001' AND v.ran_migrations = TRUE"])))))))))
