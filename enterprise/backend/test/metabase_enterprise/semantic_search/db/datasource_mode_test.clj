(ns metabase-enterprise.semantic-search.db.datasource-mode-test
  "Unit tests (redefs only, no databases) for pgvector mode selection: dedicated URL vs. shared app-db vs.
  unavailable. The end-to-end app-db mode round-trip lives in
  metabase-enterprise.semantic-search.appdb-pgvector-mode-test."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util :as u]
   [next.jdbc :as jdbc])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- stub-connection
  "The support check borrows a connection to bound it at the socket level; these tests stub every statement
  on it, so it only has to close, report its timeout, and record the ones it is handed."
  (^Connection [] (stub-connection 0 (atom [])))
  (^Connection [initial-ms timeouts]
   (reify Connection
     (getNetworkTimeout [_] initial-ms)
     (setNetworkTimeout [_ _ ms] (swap! timeouts conj ms))
     (close [_] nil))))

(deftest probe-connection-restores-its-timeout-test
  (testing "the probe's socket bound is lifted before check-in, so the next borrower keeps the app db's own"
    (let [with-bounded-connection @#'semantic.db.datasource/with-bounded-connection
          probe-bound             (:network-ms @#'semantic.db.datasource/probe-bounds)]
      (doseq [initial-ms [0 300000]]
        (testing (format "from an existing timeout of %dms" initial-ms)
          (let [timeouts (atom [])]
            (with-redefs [mdb/data-source     (constantly ::app-pool)
                          jdbc/get-connection (fn [_] (stub-connection initial-ms timeouts))]
              (is (= ::probed (with-bounded-connection @#'semantic.db.datasource/probe-bounds
                                (constantly ::probed))))
              (is (= [probe-bound initial-ms] @timeouts))))))
      (testing "and when the probe throws, which is how a stuck read ends"
        (let [timeouts (atom [])]
          (with-redefs [mdb/data-source     (constantly ::app-pool)
                        jdbc/get-connection (fn [_] (stub-connection 300000 timeouts))]
            (is (thrown? ExceptionInfo
                         (with-bounded-connection @#'semantic.db.datasource/probe-bounds
                           (fn [_] (throw (ex-info "stuck" {}))))))
            (is (= [probe-bound 300000] @timeouts))))))))

(deftest support-check-outwaits-the-probe-test
  (testing "the cached support check gets a longer leash than the readiness probe, whose callers are a search
            request and an indexer tick rather than a metric scrape"
    (let [{probe-budget :budget-seconds probe-network :network-ms} @#'semantic.db.datasource/probe-bounds
          {check-budget :budget-seconds check-network :network-ms}
          @#'semantic.db.datasource/support-check-bounds]
      (is (< probe-budget check-budget))
      (is (< probe-network check-network))
      (testing "and the socket bound outlasts the whole budget on both, or it would end the check first"
        (is (< (* 1000 probe-budget) probe-network))
        (is (< (* 1000 check-budget) check-network))))))

(deftest support-check-budget-is-cumulative-test
  (testing "the budget covers the whole check, so its catalog read and two rolled-back CREATEs can't each
            start the clock again and spend it three times over"
    (let [start-budget      @#'semantic.db.datasource/start-budget
          remaining-seconds @#'semantic.db.datasource/remaining-seconds
          budget            (start-budget {:budget-seconds 30})]
      (with-redefs [u/since-ms (constantly 0)]
        (is (= 30 (remaining-seconds budget))))
      (testing "a statement that already spent most of it leaves the rest only what is left"
        (with-redefs [u/since-ms (constantly 25000)]
          (is (= 5 (remaining-seconds budget)))))
      (testing "and once it is gone the check throws rather than passing JDBC a zero, which means no limit"
        (with-redefs [u/since-ms (constantly 30000)]
          (is (thrown-with-msg? ExceptionInfo #"ran out of time" (remaining-seconds budget))))))))

(defmacro ^:private with-support-cache
  "Run body with all three pieces of app-db probe state rebound to fresh atoms: the support cache (holding
  `init`), the cooldown timer, and the log-once hint latch."
  [init & body]
  `(with-redefs [semantic.db.datasource/app-db-pgvector-support (atom ~init)
                 semantic.db.datasource/probe-cooldown-timer (atom nil)
                 semantic.db.datasource/app-db-support-check-errored? (atom false)
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

(defn- catalog-row
  "An app-db store catalog row, defaulting every column to \"not there\".
  A present schema is `:schema-in-catalog` plus the two privileges, which are read separately because holding
  one of them is not holding the other."
  [m]
  (fn [& _]
    (merge {:installed false, :available false
            :schema-in-catalog false, :schema-usable nil, :schema-writable nil}
           m)))

(def ^:private provisioned-schema
  "The catalog columns for a schema this role has full use of."
  {:schema-in-catalog true, :schema-usable true, :schema-writable true})

(deftest support-requires-provisionable-store-test
  (testing "supported only when the vector extension and the semantic_search schema exist or can be created"
    (letfn [(check [] (semantic.db.datasource/check-app-db-pgvector-support))]
      (with-redefs [mdb/data-source      (constantly ::app-pool)
                    jdbc/get-connection (fn [_] (stub-connection))]
        (testing "extension neither installed nor available → unsupported, no provisioning probe"
          (with-redefs [jdbc/execute-one! (catalog-row {})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [& _] (throw (AssertionError. "must not probe when the extension is unavailable")))]
            (is (false? (check)))))
        (testing "extension installed and schema present → supported without a DDL probe"
          (with-redefs [jdbc/execute-one! (catalog-row (merge {:installed true :available true}
                                                              provisioned-schema))
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [& _] (throw (AssertionError. "must not probe when already fully provisioned")))]
            (is (true? (check)))))
        (testing "installed but schema missing → probe schema creation only, not the extension"
          (with-redefs [jdbc/execute-one! (catalog-row {:installed true :available true})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [_ _ create-extension? create-schema?]
                          (is (= [false true] [create-extension? create-schema?]))
                          true)]
            (is (true? (check)))))
        (testing "available but not installed → probe both extension and schema creation"
          (with-redefs [jdbc/execute-one! (catalog-row {:available true})
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [_ _ create-extension? create-schema?]
                          (is (= [true true] [create-extension? create-schema?]))
                          true)]
            (is (true? (check)))))
        (testing "available but not installed, schema pre-created → probe the extension only"
          (with-redefs [jdbc/execute-one! (catalog-row (merge {:available true} provisioned-schema))
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [_ _ create-extension? create-schema?]
                          (is (= [true false] [create-extension? create-schema?]))
                          true)]
            (is (true? (check)))))
        (testing "a privilege gap while provisioning → unsupported"
          (with-redefs [jdbc/execute-one! (catalog-row {:available true})
                        semantic.db.datasource/app-db-can-provision-pgvector? (fn [& _] false)]
            (is (false? (check)))))
        ;; information_schema.schemata, the earlier stand-in, shows a schema to a role holding either
        ;; privilege, so both of these read as fully provisioned there and passed the check.
        (testing "a schema this role holds only one privilege on → unsupported, and provisioning can't fix it"
          (doseq [[held missing] [[:schema-usable :schema-writable]
                                  [:schema-writable :schema-usable]]]
            (testing (format "holding %s but not %s" (name held) (name missing))
              (with-redefs [jdbc/execute-one! (catalog-row {:installed true :available true
                                                            :schema-in-catalog true
                                                            held true, missing false})
                            semantic.db.datasource/app-db-can-provision-pgvector?
                            (fn [& _] (throw (AssertionError.
                                              "CREATE SCHEMA IF NOT EXISTS grants nothing on a schema already there")))]
                (is (false? (check)))))))))))

(deftest probe-app-db-store-test
  (testing "the readiness probe asks what the store has now, where the support check asks what it could have"
    (letfn [(probe [] (semantic.db.datasource/probe-app-db-store!))]
      ;; A latched-true support cache throughout: the probe must not be answering from it.
      (with-support-cache true
        (mt/with-temporary-setting-values [pgvector-app-db-store-provisioned false]
          (with-redefs [mdb/data-source     (constantly ::app-pool)
                        jdbc/get-connection (fn [_] (stub-connection))
                        semantic.db.datasource/check-app-db-pgvector-support
                        (fn [] (throw (AssertionError. "the probe must read the catalog, not the cache")))
                        semantic.db.datasource/app-db-can-provision-pgvector?
                        (fn [& _] (throw (AssertionError. "rolled-back DDL answers nothing about now")))]
            (testing "never provisioned anywhere → the extension being installable is the whole question"
              (with-redefs [jdbc/execute-one! (catalog-row {:available true})]
                (is (true? (probe))))
              (with-redefs [jdbc/execute-one! (catalog-row {})]
                (is (false? (probe))))
              (is (false? (semantic.settings/pgvector-app-db-store-provisioned))
                  "and nothing has been provisioned to remember"))
            (testing "store provisioned here and the extension is installed → reachable"
              (with-redefs [jdbc/execute-one! (catalog-row (merge {:installed true :available true}
                                                                  provisioned-schema))]
                (is (true? (probe))))
              (is (true? (semantic.settings/pgvector-app-db-store-provisioned))
                  "the sighting is remembered, so a later probe can tell a lost schema from an uncreated one"))
            (testing "store provisioned here but the extension was dropped → unreachable"
              (with-redefs [jdbc/execute-one! (catalog-row (merge {:available true} provisioned-schema))]
                (is (false? (probe)))))
            (testing "the store's schema is there but this role has lost a privilege on it → out of reach"
              (doseq [lost [:schema-usable :schema-writable]]
                (testing (name lost)
                  (with-redefs [jdbc/execute-one! (catalog-row (merge {:installed true :available true}
                                                                      provisioned-schema
                                                                      {lost false}))]
                    (is (false? (probe)))))))
            (testing "the store's schema was dropped outright → unreachable, not mistaken for a fresh app db"
              (with-redefs [jdbc/execute-one! (catalog-row {:installed true :available true})]
                (is (false? (probe)))))))))))

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

(deftest errored-support-check-retries-sooner-test
  (testing "a check that couldn't answer is retried on its own short cooldown, not the five-minute one an
            answered no earns"
    (let [probe-due?     @#'semantic.db.datasource/probe-due?
          error-cooldown @#'semantic.db.datasource/probe-error-cooldown-ms
          cooldown       @#'semantic.db.datasource/probe-cooldown-ms
          elapsed-ms     (quot (+ error-cooldown cooldown) 2)]
      (is (< error-cooldown elapsed-ms cooldown))
      (with-redefs [semantic.db.datasource/probe-cooldown-timer (atom (u/start-timer))
                    u/since-ms (constantly elapsed-ms)]
        (testing "an answered no is still trusted at this point"
          (with-redefs [semantic.db.datasource/app-db-support-check-errored? (atom false)]
            (is (false? (probe-due?)))))
        (testing "an errored check is not: search is on the appdb engine over a question nobody answered"
          (with-redefs [semantic.db.datasource/app-db-support-check-errored? (atom true)]
            (is (true? (probe-due?)))))))))

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
