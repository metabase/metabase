(ns metabase-enterprise.semantic-search.db.datasource-mode-test
  "Unit tests (redefs only, no databases) for pgvector mode selection: dedicated URL vs. shared app-db vs.
  unavailable. The end-to-end app-db mode round-trip lives in
  metabase-enterprise.semantic-search.appdb-pgvector-mode-test."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [next.jdbc :as jdbc])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-support-cache
  "Run body with all three pieces of app-db probe state rebound to fresh atoms: the support cache (holding
  `init`), the cooldown timer, and the log-once hint latch."
  [init & body]
  `(with-redefs [semantic.db.datasource/app-db-pgvector-support (atom ~init)
                 semantic.db.datasource/probe-cooldown-timer (atom nil)
                 semantic.db.datasource/logged-pgvector-absent? (atom false)]
     ~@body))

(deftest dedicated-mode-wins-test
  (testing "MB_PGVECTOR_DB_URL always wins, even when the app db could also support pgvector"
    (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://localhost:5432/pgvector"
                  mdb/db-type (constantly :postgres)]
      (with-support-cache true
        (is (= :dedicated (semantic.db.datasource/pgvector-mode)))
        (is (semantic.db.datasource/pgvector-configured?))))))

(deftest whitespace-url-counts-as-unset-test
  (testing "a whitespace-only MB_PGVECTOR_DB_URL is unset for every predicate — no silent app-db fallback
            while a task gate elsewhere believes a dedicated store is configured"
    (with-redefs [semantic.db.datasource/db-url "   "
                  mdb/db-type (constantly :h2)]
      (with-support-cache nil
        (is (false? (semantic.db.datasource/dedicated-url-configured?)))
        (is (false? (semantic.util/semantic-search-configured?)))
        (is (= :unavailable (semantic.db.datasource/pgvector-mode)))))))

(deftest non-postgres-app-db-test
  (testing "no URL + non-Postgres app db → :unavailable without ever probing the app db"
    (doseq [db-type [:h2 :mysql]]
      (with-redefs [semantic.db.datasource/db-url nil
                    mdb/db-type (constantly db-type)
                    semantic.db.datasource/check-app-db-pgvector-support
                    (fn [] (throw (AssertionError. "must not probe a non-Postgres app db")))]
        (with-support-cache nil
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (not (semantic.db.datasource/pgvector-configured?)))
          (is (nil? @semantic.db.datasource/app-db-pgvector-support)))))))

(deftest support-requires-provisionable-store-test
  (testing "supported only when the vector extension and the semantic_search schema exist or can be created"
    (letfn [(check [] (semantic.db.datasource/check-app-db-pgvector-support))
            (catalog [m] (fn [& _] m))]
      (with-redefs [mdb/data-source (constantly ::app-pool)]
        (testing "extension neither installed nor available → unsupported, no provisioning probe"
          (with-redefs [jdbc/execute-one! (catalog {:installed false :available false :schema-exists false})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [& _] (throw (AssertionError. "must not probe when the extension is unavailable")))]
            (is (false? (check)))))
        (testing "extension installed and schema present → supported without a DDL probe"
          (with-redefs [jdbc/execute-one! (catalog {:installed true :available true :schema-exists true})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [& _] (throw (AssertionError. "must not probe when already fully provisioned")))]
            (is (true? (check)))))
        (testing "installed but schema missing → probe schema creation only, not the extension"
          (with-redefs [jdbc/execute-one! (catalog {:installed true :available true :schema-exists false})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [_ create-extension? create-schema?]
                          (is (= [false true] [create-extension? create-schema?]))
                          true)]
            (is (true? (check)))))
        (testing "available but not installed → probe both extension and schema creation"
          (with-redefs [jdbc/execute-one! (catalog {:installed false :available true :schema-exists false})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [_ create-extension? create-schema?]
                          (is (= [true true] [create-extension? create-schema?]))
                          true)]
            (is (true? (check)))))
        (testing "available but not installed, schema pre-created → probe the extension only"
          (with-redefs [jdbc/execute-one! (catalog {:installed false :available true :schema-exists true})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [_ create-extension? create-schema?]
                          (is (= [true false] [create-extension? create-schema?]))
                          true)]
            (is (true? (check)))))
        (testing "a privilege gap while provisioning → unsupported"
          (with-redefs [jdbc/execute-one! (catalog {:installed false :available true :schema-exists false})
                        semantic.db.datasource/app-db-can-provision-pgvector? (fn [& _] false)]
            (is (false? (check)))))))))

(deftest support-check-caching-test
  (with-redefs [semantic.db.datasource/db-url nil
                mdb/db-type (constantly :postgres)]
    (testing "nothing cached (and mode :unavailable) before the app db is set up"
      (with-support-cache nil
        (with-redefs [mdb/db-is-set-up? (constantly false)
                      semantic.db.datasource/check-app-db-pgvector-support
                      (fn [] (throw (AssertionError. "must not probe before the app db is set up")))]
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (nil? @semantic.db.datasource/app-db-pgvector-support)))))
    (testing "check runs exactly once; its result is cached for subsequent calls"
      (with-support-cache nil
        (let [calls (atom 0)]
          (with-redefs [mdb/db-is-set-up? (constantly true)
                        semantic.db.datasource/check-app-db-pgvector-support (fn [] (swap! calls inc) true)]
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))
            (is (= 1 @calls))
            (is (true? @semantic.db.datasource/app-db-pgvector-support))))))
    (testing "a failed probe reads as unavailable, does NOT latch, and backs off before retrying"
      (with-support-cache nil
        (with-redefs [mdb/db-is-set-up? (constantly true)
                      semantic.db.datasource/check-app-db-pgvector-support (fn [] (throw (ex-info "boom" {})))]
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (nil? @semantic.db.datasource/app-db-pgvector-support)))
        (testing "within the backoff window the check must not run again"
          (with-redefs [mdb/db-is-set-up? (constantly true)
                        semantic.db.datasource/check-app-db-pgvector-support
                        (fn [] (throw (AssertionError. "must not re-probe during backoff")))]
            (is (= :unavailable (semantic.db.datasource/pgvector-mode)))))
        (testing "once the window clears, the next call re-probes"
          (reset! semantic.db.datasource/probe-cooldown-timer nil)
          (with-redefs [mdb/db-is-set-up? (constantly true)
                        semantic.db.datasource/check-app-db-pgvector-support (constantly true)]
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))))))
    ;; This exercises the false->true transition with the probe mocked.
    ;; The real thing (an app-db role reads unsupported, an admin runs CREATE EXTENSION out-of-band, the
    ;; next probe reads installed and the mode flips with no restart) was verified by hand against a real
    ;; Postgres.
    ;; We deliberately don't automate it: it needs a real DB whose extension state changes mid-test, which
    ;; would be flaky against the database shared with other tests between runs.
    (testing "an unsupported probe is NOT latched — it re-probes after the cooldown, so a runtime install is picked up"
      (with-support-cache nil
        (with-redefs [mdb/db-is-set-up? (constantly true)
                      semantic.db.datasource/check-app-db-pgvector-support (constantly false)]
          (is (= :unavailable (semantic.db.datasource/pgvector-mode)))
          (is (nil? @semantic.db.datasource/app-db-pgvector-support))
          (testing "within the cooldown the check must not run again"
            (with-redefs [mdb/db-is-set-up? (constantly true)
                          semantic.db.datasource/check-app-db-pgvector-support
                          (fn [] (throw (AssertionError. "must not re-probe during cooldown")))]
              (is (= :unavailable (semantic.db.datasource/pgvector-mode))))))
        (testing "cooldown elapsed: pgvector installed at runtime is now picked up (no restart)"
          (reset! semantic.db.datasource/probe-cooldown-timer nil)
          (with-redefs [mdb/db-is-set-up? (constantly true)
                        semantic.db.datasource/check-app-db-pgvector-support (constantly true)]
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))))))
    (testing "a confirmed true latches for the JVM lifetime; tests/REPL reset it"
      (with-support-cache nil
        (with-redefs [mdb/db-is-set-up? (constantly true)
                      semantic.db.datasource/check-app-db-pgvector-support (constantly true)]
          (is (= :app-db (semantic.db.datasource/pgvector-mode)))
          (is (true? @semantic.db.datasource/app-db-pgvector-support)))
        (testing "latched: a now-failing check is never consulted"
          (with-redefs [mdb/db-is-set-up? (constantly true)
                        semantic.db.datasource/check-app-db-pgvector-support
                        (fn [] (throw (AssertionError. "must not re-probe after a confirmed true")))]
            (is (= :app-db (semantic.db.datasource/pgvector-mode)))))))))

(deftest unlicensed-availability-check-does-not-probe-test
  (testing "without the :semantic-search feature, the availability gate never probes the app db"
    (with-redefs [semantic.db.datasource/db-url nil
                  mdb/db-type (constantly :postgres)
                  mdb/db-is-set-up? (constantly true)
                  semantic.db.datasource/check-app-db-pgvector-support
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
