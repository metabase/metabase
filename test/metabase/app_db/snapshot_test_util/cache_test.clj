(ns metabase.app-db.snapshot-test-util.cache-test
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.cache :as cache]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.app-db.snapshot-test-util.server :as server]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test])
  (:import
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(defn- small-snapshot [flavor boundary]
  {:flavor flavor, :through-changeset-id boundary, :content "CREATE TABLE bird (id INT);"})

(deftest reuse-and-isolation-test
  (mt/with-temp-dir [directory nil]
    (let [generated (atom 0)
          options   {:cache-dir directory, :flavor :h2, :through-changeset-id "boundary-a"}]
      (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                                  generate/dump-boundary! (fn [flavor boundary]
                                                            (swap! generated inc)
                                                            {:flavor flavor
                                                             :through-changeset-id boundary
                                                             :content "CREATE TABLE bird (id INT);"})
                                  cache/validate-snapshot! (fn [_ _ _] nil)]
        (cache/with-snapshot [conn options]
          (jdbc/execute! {:connection conn} ["INSERT INTO bird VALUES (1)"]))
        (cache/with-snapshot [conn options]
          (is (= [{:n 0}] (jdbc/query {:connection conn} ["SELECT COUNT(*) AS n FROM bird"]))))
        (is (= 1 @generated))))))

(deftest failed-generation-can-retry-test
  (mt/with-temp-dir [directory nil]
    (let [attempts (atom 0)
          options  {:cache-dir directory}]
      (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                                  generate/dump-boundary! (fn [flavor boundary]
                                                            (when (= 1 (swap! attempts inc))
                                                              (throw (ex-info "generation failed" {})))
                                                            {:flavor flavor
                                                             :through-changeset-id boundary
                                                             :content "CREATE TABLE bird (id INT);"})
                                  cache/validate-snapshot! (fn [_ _ _] nil)]
        (is (thrown-with-msg? Exception #"generation failed"
                              (cache/ensure-snapshot! :h2 "boundary-a" options)))
        (is (.isFile (io/file (cache/ensure-snapshot! :h2 "boundary-a" options))))
        (is (= 2 @attempts))))))

(deftest invalidation-test
  (mt/with-temp-dir [directory nil]
    (let [source    (atom "source-a")
          generated (atom 0)
          options   {:cache-dir directory}]
      (mt/with-dynamic-fn-redefs [cache/input-identity #(deref source)
                                  generate/dump-boundary! (fn [flavor boundary]
                                                            (swap! generated inc)
                                                            (small-snapshot flavor boundary))
                                  cache/validate-snapshot! (fn [_ _ _] nil)]
        (let [file (cache/ensure-snapshot! :h2 "boundary-a" options)]
          (is (= file (cache/ensure-snapshot! :h2 "boundary-a" options)))
          (spit file "partial SQL")
          (is (= file (cache/ensure-snapshot! :h2 "boundary-a" options)))
          (is (= "CREATE TABLE bird (id INT);" (slurp file)))
          (io/delete-file (io/file directory (str/replace (.getName file) #"\.sql$" ".edn")))
          (is (= file (cache/ensure-snapshot! :h2 "boundary-a" options)))
          (reset! source "source-b")
          (is (not= file (cache/ensure-snapshot! :h2 "boundary-a" options)))
          (is (not= file (cache/ensure-snapshot! :h2 "boundary-b" options)))
          (is (= 5 @generated)))))))

(deftest flavor-image-and-format-identity-test
  (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                              server/image-identity! (constantly "image-a")]
    (encryption-test/with-secret-key nil
      (let [original (#'cache/request-identity! :mysql "boundary")]
        (is (not= original (#'cache/request-identity! :mariadb "boundary")))
        (with-redefs [cache/format-version 2]
          (is (not= original (#'cache/request-identity! :mysql "boundary"))))
        (mt/with-dynamic-fn-redefs [server/image-identity! (constantly "image-b")]
          (is (not= original (#'cache/request-identity! :mysql "boundary"))))
        (mt/with-dynamic-fn-redefs [versions/current-recorded-version (constantly "x.99.0.0")]
          (is (not= original (#'cache/request-identity! :mysql "boundary"))))))))

(deftest dependency-identity-test
  (mt/with-temp-dir [directory nil]
    (let [file (io/file directory "dependency.jar")]
      (spit file "original")
      (let [original (#'cache/dependency-identity directory [(str file)])]
        (spit file "modified")
        (is (not= original (#'cache/dependency-identity directory [(str file)])))))))

(defn- start-clojure [code]
  (.start (ProcessBuilder. ^java.util.List
           [(str (System/getProperty "java.home") "/bin/java")
            "-cp" (System/getProperty "java.class.path") "clojure.main" "-e" code])))

(deftest process-lock-test
  (mt/with-temp-dir [directory nil]
    (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                                generate/dump-boundary! small-snapshot
                                cache/validate-snapshot! (fn [_ _ _] nil)]
      (let [options   {:cache-dir directory}
            file      (cache/ensure-snapshot! :h2 "boundary-a" options)
            lock-path (str/replace (str file) #"\.sql$" ".lock")
            process   (start-clojure
                       (str "(with-open [file (java.io.RandomAccessFile. " (pr-str lock-path) " \"rw\")"
                            " channel (.getChannel file) lock (.lock channel)]"
                            " (println \"locked\") (flush) (.read System/in))"))
            errors    (future (slurp (.getErrorStream process)))]
        (try
          (with-open [reader (io/reader (.getInputStream process))]
            (let [ready (future (.readLine ^java.io.BufferedReader reader))]
              (is (= "locked" (deref ready 30000 ::timeout))))
            (let [requested (promise)]
              (mt/with-dynamic-fn-redefs [cache/input-identity (fn [] (deliver requested true) "source-a")]
                (let [result (future (cache/ensure-snapshot! :h2 "boundary-a" options))]
                  (is (true? (deref requested 10000 ::timeout)))
                  (is (= ::blocked (deref result 100 ::blocked)))
                  (.write (.getOutputStream process) (int 10))
                  (.flush (.getOutputStream process))
                  (is (= file (deref result 10000 ::timeout)))))))
          (is (.waitFor process 10 TimeUnit/SECONDS))
          (is (zero? (.exitValue process)) (deref errors 1000 "stderr timeout"))
          (finally
            (.destroyForcibly process)))))))

(deftest reuse-in-another-process-test
  (mt/with-temp-dir [directory nil]
    (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                                generate/dump-boundary! small-snapshot
                                cache/validate-snapshot! (fn [_ _ _] nil)]
      (let [file    (cache/ensure-snapshot! :h2 "boundary-a" {:cache-dir directory})
            process (start-clojure
                     (str "(require '[metabase.app-db.snapshot-test-util.cache :as cache]"
                          " '[metabase.app-db.snapshot-test-util.generate :as generate] '[metabase.test :as mt])"
                          " (mt/with-dynamic-fn-redefs [cache/input-identity (constantly \"source-a\")"
                          " generate/dump-boundary! (fn [& _] (throw (ex-info \"unexpected generation\" {})))]"
                          " (println (.getPath (cache/ensure-snapshot! :h2 \"boundary-a\" "
                          (pr-str {:cache-dir directory}) ")))) (shutdown-agents)"))
            output  (future (slurp (.getInputStream process)))
            errors  (future (slurp (.getErrorStream process)))]
        (try
          (is (.waitFor process 120 TimeUnit/SECONDS))
          (is (zero? (.exitValue process)) (deref errors 1000 "stderr timeout"))
          (is (str/includes? (deref output 1000 "stdout timeout") (str file)))
          (finally
            (.destroyForcibly process)))))))

(deftest validation-failure-is-not-cached-test
  (mt/with-temp-dir [directory nil]
    (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                                generate/dump-boundary! small-snapshot
                                cache/validate-snapshot! (fn [_ _ _]
                                                           (throw (ex-info "invalid snapshot" {})))]
      (is (thrown-with-msg? Exception #"invalid snapshot"
                            (cache/ensure-snapshot! :h2 "boundary-a" {:cache-dir directory})))
      (is (empty? (filter #(re-find #"\.(sql|edn|tmp)$" (str %)) (file-seq (io/file directory))))))))

(deftest source-change-during-generation-test
  (mt/with-temp-dir [directory nil]
    (let [source (atom "source-a")]
      (mt/with-dynamic-fn-redefs [cache/input-identity #(deref source)
                                  generate/dump-boundary! (fn [flavor boundary]
                                                            (reset! source "source-b")
                                                            (small-snapshot flavor boundary))
                                  cache/validate-snapshot! (fn [_ _ _] nil)]
        (is (thrown-with-msg? Exception #"inputs changed"
                              (cache/ensure-snapshot! :h2 "boundary-a" {:cache-dir directory})))))))

(deftest concurrent-requests-test
  (mt/with-temp-dir [directory nil]
    (let [generated (atom 0)
          started   (promise)
          finish    (promise)]
      (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "source-a")
                                  generate/dump-boundary! (fn [flavor boundary]
                                                            (swap! generated inc)
                                                            (deliver started true)
                                                            (when (= ::timeout (deref finish 10000 ::timeout))
                                                              (throw (ex-info "generation timed out" {})))
                                                            (small-snapshot flavor boundary))
                                  cache/validate-snapshot! (fn [_ _ _] nil)]
        (let [first-request (future (cache/ensure-snapshot! :h2 "boundary-a" {:cache-dir directory}))]
          (try
            (is (true? (deref started 10000 ::timeout)))
            (let [second-request (future (cache/ensure-snapshot! :h2 "boundary-a" {:cache-dir directory}))]
              (deliver finish true)
              (is (= (deref first-request 10000 ::timeout) (deref second-request 10000 ::timeout)))
              (is (= 1 @generated)))
            (finally
              (deliver finish true)
              (future-cancel first-request))))))))

(deftest working-tree-identity-test
  (mt/with-temp-dir [directory nil]
    (let [file (io/file directory "migration.clj")
          git  (fn [& args] (apply shell/sh "git" "-C" directory args))]
      (is (zero? (:exit (git "init"))))
      (spit file "original")
      (is (zero? (:exit (git "add" "migration.clj"))))
      (is (zero? (:exit (git "-c" "user.name=Test" "-c" "user.email=test@example.com"
                             "-c" "core.hooksPath=/dev/null" "commit" "-m" "Initial"))))
      (let [original (#'cache/source-identity directory)]
        (spit file "changed")
        (is (not= original (#'cache/source-identity directory)))
        (spit file "original")
        (is (= original (#'cache/source-identity directory)))
        (spit (io/file directory "new-migration.clj") "new")
        (is (not= original (#'cache/source-identity directory)))))))

(deftest invalid-requests-test
  (mt/with-temp-dir [directory nil]
    (let [options {:cache-dir directory}]
      (is (thrown-with-msg? Exception #"Unsupported snapshot flavor"
                            (cache/ensure-snapshot! :unknown "boundary" options)))
      (is (thrown-with-msg? Exception #"changeset ID is required"
                            (cache/ensure-snapshot! :h2 nil options)))
      (encryption-test/with-secret-key "dont-tell-anyone-about-this"
        (is (thrown-with-msg? Exception #"encryption to be disabled"
                              (cache/ensure-snapshot! :h2 "boundary" options)))))))

(deftest h2-boundary-round-trip-test
  (mt/with-temp-dir [directory nil]
    (encryption-test/with-secret-key nil
      (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "integration")]
        (let [options {:cache-dir directory, :flavor :h2, :through-changeset-id "v45.00-001"}
              file    (cache/ensure-snapshot! :h2 "v45.00-001" options)]
          (is (.isFile file))
          (cache/with-snapshot [conn options]
            (is (= [{:id "v45.00-001"}]
                   (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-001'"])))
            (is (seq (jdbc/query {:connection conn} ["SELECT * FROM DATABASECHANGELOG_VERSION"])))
            (is (empty? (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"])))
            (impl/run-migrations-in-range! conn ["v45.00-002" "v45.00-002"])
            (is (= [{:id "v45.00-002"}]
                   (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"]))))
          (is (= file (cache/ensure-snapshot! :h2 "v45.00-001" options))))))))

(deftest unknown-boundary-test
  (encryption-test/with-secret-key nil
    (is (thrown-with-msg? Exception #"Migration ID not found"
                          (generate/dump-boundary! :h2 "does-not-exist")))))

(deftest versionless-boundary-round-trip-test
  (mt/with-temp-dir [directory nil]
    (encryption-test/with-secret-key nil
      (mt/with-dynamic-fn-redefs [cache/input-identity (constantly "integration")]
        (let [boundary (impl/with-temp-empty-app-db [conn :h2]
                         (some (fn [[id]] (when-not (re-find #"^v\d+\." id) id)) (snapshot/changesets conn)))]
          (is (string? boundary))
          (cache/with-snapshot [conn {:cache-dir directory, :flavor :h2, :through-changeset-id boundary}]
            (is (seq (jdbc/query {:connection conn}
                                 ["SELECT v.metabase_version FROM DATABASECHANGELOG c
                                  JOIN DATABASECHANGELOG_VERSION v ON c.deployment_id = v.deployment_id
                                  WHERE c.id = ?" boundary])))))))))

(deftest source-aware-reuse-test
  (mt/with-temp-dir [directory nil]
    (encryption-test/with-secret-key nil
      (let [options {:cache-dir directory}
            file    (cache/ensure-snapshot! :h2 "v45.00-001" options)]
        (is (= file (cache/ensure-snapshot! :h2 "v45.00-001" options)))))))

(deftest server-boundary-round-trip-test
  (when (= "true" (config/config-str :mb-app-db-snapshot-regeneration-test))
    (mt/test-drivers #{:mysql :postgres}
      (mt/with-temp-dir [directory nil]
        (encryption-test/with-secret-key nil
          (let [options {:cache-dir directory}
                file    (cache/ensure-snapshot! driver/*driver* "v45.00-001" options)]
            (is (.isFile file))
            (is (= file (cache/ensure-snapshot! driver/*driver* "v45.00-001" options)))
            (generate/do-with-empty-db!
             driver/*driver*
             (fn [conn _server]
               (snapshot/load-sql! conn driver/*driver* (slurp file))
               (is (seq (jdbc/query {:connection conn}
                                    ["SELECT v.metabase_version FROM DATABASECHANGELOG c
                                     JOIN DATABASECHANGELOG_VERSION v ON c.deployment_id = v.deployment_id
                                     WHERE c.id = 'v45.00-001' AND v.ran_migrations = TRUE"])))))))))))
