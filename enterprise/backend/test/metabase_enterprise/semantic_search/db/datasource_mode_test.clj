(ns metabase-enterprise.semantic-search.db.datasource-mode-test
  "Unit tests (redefs only, no databases) for pgvector mode selection: dedicated URL vs. shared app-db vs.
  unavailable. The end-to-end app-db mode round-trip lives in
  metabase-enterprise.semantic-search.appdb-pgvector-mode-test."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-support-cache
  "Run body with [[semantic.db.datasource/app-db-pgvector-support]] rebound to a fresh atom holding `init`."
  [init & body]
  `(with-redefs [semantic.db.datasource/app-db-pgvector-support (atom ~init)]
     ~@body))

(deftest dedicated-mode-wins-test
  (testing "MB_PGVECTOR_DB_URL always wins, even when the app db could also support pgvector"
    (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://localhost:5432/pgvector"
                  mdb/db-type (constantly :postgres)]
      (with-support-cache true
        (is (= :dedicated (semantic.db.datasource/pgvector-mode)))
        (is (semantic.db.datasource/pgvector-configured?))))))

(deftest non-postgres-app-db-test
  (testing "no URL + non-Postgres app db → :unavailable without ever probing the app db"
    (doseq [db-type [:h2 :mysql]]
      (with-redefs [semantic.db.datasource/db-url nil
                    mdb/db-type (constantly db-type)
                    semantic.db.datasource/check-app-db-pgvector-support!
                    (fn [] (throw (AssertionError. "must not probe a non-Postgres app db")))]
        (with-support-cache nil
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (not (semantic.db.datasource/pgvector-configured?)))
          (is (nil? @semantic.db.datasource/app-db-pgvector-support)))))))

(deftest support-check-caching-test
  (with-redefs [semantic.db.datasource/db-url nil
                mdb/db-type (constantly :postgres)]
    (testing "nothing cached (and mode :unavailable) before the app db is set up"
      (with-support-cache nil
        (with-redefs [mdb/db-is-set-up? (constantly false)
                      semantic.db.datasource/check-app-db-pgvector-support!
                      (fn [] (throw (AssertionError. "must not probe before the app db is set up")))]
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (nil? @semantic.db.datasource/app-db-pgvector-support)))))
    (testing "check runs exactly once; its result is cached for subsequent calls"
      (with-support-cache nil
        (let [calls (atom 0)]
          (with-redefs [mdb/db-is-set-up? (constantly true)
                        semantic.db.datasource/check-app-db-pgvector-support! (fn [] (swap! calls inc) true)]
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))
            (is (= 1 @calls))
            (is (true? @semantic.db.datasource/app-db-pgvector-support))))))
    (testing "a throwing check is caught and caches false"
      (with-support-cache nil
        (with-redefs [mdb/db-is-set-up? (constantly true)
                      semantic.db.datasource/check-app-db-pgvector-support! (fn [] (throw (ex-info "boom" {})))]
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (false? @semantic.db.datasource/app-db-pgvector-support)))))
    (testing "the cache is resettable (JVM-lifetime semantics, tests/REPL reset it)"
      (with-support-cache false
        (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
        (reset! semantic.db.datasource/app-db-pgvector-support nil)
        (with-redefs [mdb/db-is-set-up? (constantly true)
                      semantic.db.datasource/check-app-db-pgvector-support! (constantly true)]
          (is (= :app-db (semantic.db.datasource/pgvector-mode))))))))

(deftest unlicensed-availability-check-does-not-probe-test
  (testing "without the :semantic-search feature, the availability gate never probes the app db"
    ;; the probe attempts CREATE EXTENSION / CREATE SCHEMA — an unlicensed instance must never reach it
    (with-redefs [semantic.db.datasource/db-url nil
                  mdb/db-type (constantly :postgres)
                  mdb/db-is-set-up? (constantly true)
                  semantic.db.datasource/check-app-db-pgvector-support!
                  (fn [] (throw (AssertionError. "must not probe when the feature is off")))]
      (with-support-cache nil
        (mt/with-premium-features #{}
          (is (false? (semantic.util/semantic-search-available?))))
        (is (nil? @semantic.db.datasource/app-db-pgvector-support))))))

(deftest ensure-initialized-data-source-app-db-test
  (testing "app-db mode hands back the shared application pool without storing it"
    (with-redefs [semantic.db.datasource/db-url nil
                  semantic.db.datasource/data-source (atom nil)
                  mdb/db-type (constantly :postgres)
                  mdb/data-source (constantly ::app-pool)]
      (with-support-cache true
        (is (= ::app-pool (semantic.db.datasource/ensure-initialized-data-source!)))
        (testing "the shared pool is never stored in the module's data-source atom"
          (is (nil? @semantic.db.datasource/data-source)))
        (testing "shutdown-db! therefore cannot close the shared pool"
          ;; would throw on ::app-pool (not a PooledDataSource) if it tried
          (semantic.db.datasource/shutdown-db!)
          (is (= ::app-pool (semantic.db.datasource/ensure-initialized-data-source!))))))))

(deftest ensure-initialized-data-source-unavailable-test
  (testing "no pgvector anywhere → an actionable error"
    (with-redefs [semantic.db.datasource/db-url nil
                  semantic.db.datasource/data-source (atom nil)
                  mdb/db-type (constantly :h2)]
      (with-support-cache nil
        (is (thrown-with-msg? ExceptionInfo #"MB_PGVECTOR_DB_URL"
                              (semantic.db.datasource/ensure-initialized-data-source!)))))))
