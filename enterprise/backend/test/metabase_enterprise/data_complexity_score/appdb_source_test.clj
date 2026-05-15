(ns metabase-enterprise.data-complexity-score.appdb-source-test
  "Integration tests for the raw-JDBC writer. The cron / API path is covered by the Toucan
  `record-score!`; here we verify that the parallel raw-JDBC writer produces a byte-identical
  row from the same inputs."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.initialize :as test.initialize]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [thunk]
                      ;; The raw-JDBC INSERT bypasses Toucan, so the test framework's lazy
                      ;; DB-init (normally triggered by the first `t2/*` call) doesn't fire on
                      ;; its own. Force it once so the appdb has its schema before the writer
                      ;; runs.
                      (test.initialize/initialize-if-needed! :db)
                      (thunk)))

(deftest ^:sequential record-score-roundtrips-json-via-raw-jdbc-test
  (testing "record-score! inserts a row whose score_data round-trips back through raw SQL as the expected JSON"
    (let [fp     (str "appdb-source-test/fp-" (random-uuid))
          source "appdb-cli-test"
          score  {:library  {:total 1 :components {:entity-count {:measurement 1.0 :score 10}}}
                  :universe {:total 1 :components {:entity-count {:measurement 1.0 :score 10}}}
                  :metabot  {:total 1 :components {:entity-count {:measurement 1.0 :score 10}}}
                  :meta     {:formula-version   1
                             :synonym-threshold 0.8
                             :weights           {:entity 10}}}]
      (appdb-source/record-score! fp source score)
      (try
        (let [row     (jdbc/execute-one!
                       (mdb/data-source)
                       [(str "SELECT fingerprint, source, score_data "
                             "FROM data_complexity_score WHERE fingerprint = ?") fp]
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})
              ;; `${text.type}` maps to CLOB on H2 and TEXT on Postgres/MySQL — `clob->str`
              ;; normalizes the JDBC driver's String / Clob handoff.
              decoded (-> row :score_data mdb/clob->str (json/decode true))]
          (is (=? {:fingerprint fp
                   :source      source}
                  row))
          (is (=? {:library {:total 1}
                   :meta    {:formula-version 1}}
                  decoded)))
        (finally
          ;; Append-only table — clean up manually so the test doesn't accumulate rows.
          (t2/delete! :model/DataComplexityScore :fingerprint fp))))))

(defn- ^SQLException sql-error-with-state [state]
  (doto (SQLException. (str "boom (" state ")") state)))

(deftest with-missing-relation-fallback-test
  (testing "off by default — read-side errors propagate so cron / API surface schema bugs"
    (is (thrown? SQLException
                 (appdb-source/with-missing-relation-fallback
                   ::probe ::fallback
                   #(throw (sql-error-with-state "42P01"))))))
  (testing "when toleration is on, only missing-table / missing-column SQLState codes trigger the fallback"
    (binding [appdb-source/*tolerate-missing-relations?* true]
      (testing "happy path returns the body's value"
        (is (= ::ok
               (appdb-source/with-missing-relation-fallback ::probe ::fallback (constantly ::ok)))))
      (doseq [state ["42P01" "42703" "42102" "42122" "42S02" "42S22"]]
        (testing (str "SQLState " state " (table or column absent) → fallback")
          (is (= ::fallback
                 (appdb-source/with-missing-relation-fallback
                   ::probe ::fallback
                   #(throw (sql-error-with-state state)))))))
      (testing "an unrelated SQLState (e.g. syntax / constraint) is not swallowed"
        (is (thrown-with-msg?
             SQLException #"23505"
             (appdb-source/with-missing-relation-fallback
               ::probe ::fallback
               #(throw (sql-error-with-state "23505")))))))))

(deftest ^:sequential verify-write-target-shape-passes-on-current-schema-test
  (testing "verify-write-target-shape! is a no-op when the appdb has the columns record-score! writes"
    (mt/initialize-if-needed! :db)
    (is (nil? (appdb-source/verify-write-target-shape!)))))

(deftest verify-write-target-shape-fails-fast-on-missing-relation-test
  (testing "verify-write-target-shape! converts a missing-table / column SQL error into a `:cli-validation` ex-info"
    (mt/with-dynamic-fn-redefs [jdbc/execute-one! (fn [& _] (throw (sql-error-with-state "42P01")))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"data_complexity_score"
           (appdb-source/verify-write-target-shape!)))
      (try (appdb-source/verify-write-target-shape!)
           (catch clojure.lang.ExceptionInfo e
             (is (=? {:cli-validation true :sql-state "42P01"} (ex-data e)))))))
  (testing "an unrelated SQL error propagates without rewriting"
    (mt/with-dynamic-fn-redefs [jdbc/execute-one! (fn [& _] (throw (sql-error-with-state "08006")))]
      (is (thrown? SQLException (appdb-source/verify-write-target-shape!))))))
