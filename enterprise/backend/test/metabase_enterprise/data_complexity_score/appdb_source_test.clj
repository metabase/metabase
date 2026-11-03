(ns metabase-enterprise.data-complexity-score.appdb-source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(defn- sql-error-with-state ^SQLException [^String state]
  (SQLException. (str "boom (" state ")") state))

(defn- throw-sql-state [state]
  (fn [& _] (throw (sql-error-with-state state))))

(deftest ^:synchronized insert-score-row-roundtrips-json-test
  (testing "insert-score-row! writes score_data that reads back as the same JSON, with a database-set created_at"
    ;; The raw INSERT does not trigger the test framework's lazy appdb setup the way a model call does, and the
    ;; `validate-deftest` lint forbids destructive fixtures, so initialize inline.
    (mt/initialize-if-needed! :db)
    (let [fp     (str "appdb-source-test/fp-" (random-uuid))
          source "appdb-cli-test"
          score  {:library  {:total 1, :components {:entity-count {:measurement 1.0, :score 10}}}
                  :universe {:total 1, :components {:entity-count {:measurement 1.0, :score 10}}}
                  :metabot  {:total 1, :components {:entity-count {:measurement 1.0, :score 10}}}
                  :meta     {:formula-version   1
                             :synonym-threshold 0.8
                             :weights           {:entity 10}}}]
      (is (nil? (appdb-source/insert-score-row! fp source score)))
      (try
        (let [row     (jdbc/execute-one!
                       (mdb/data-source)
                       [(str "SELECT fingerprint, source, score_data, created_at "
                             "FROM data_complexity_score WHERE fingerprint = ?") fp]
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})
              ;; `${text.type}` is a CLOB on H2 and TEXT elsewhere. next.jdbc returns a String for TEXT and an
              ;; `org.h2.jdbc.JdbcClob` for the CLOB, and `mdb/clob->str` only handles the Clob.
              raw     (:score_data row)
              decoded (json/decode (if (string? raw) raw (mdb/clob->str raw)) true)]
          (is (=? {:fingerprint fp
                   :source      source
                   :created_at  some?}
                  row))
          (is (= (json/decode (json/encode score) true) decoded)))
        (finally
          ;; Append-only table, so clean up by hand.
          (t2/delete! :model/DataComplexityScore :fingerprint fp))))))

(deftest with-missing-relation-fallback-without-degraded-signals-test
  (testing "with nil degraded-signals, a missing-relation error propagates so the cron and API surface schema bugs"
    (is (thrown? SQLException
                 (appdb-source/with-missing-relation-fallback nil ::probe ::fallback (throw-sql-state "42P01"))))))

(deftest with-missing-relation-fallback-with-degraded-signals-test
  (let [degraded (atom #{})
        fallback #(appdb-source/with-missing-relation-fallback degraded %1 ::fallback %2)]
    (testing "a successful read returns its value and records nothing"
      (is (= ::ok (fallback ::ok-read (constantly ::ok))))
      (is (= #{} @degraded)))
    (testing "every missing-table and missing-column SQLState falls back and records its signal"
      (let [states ["42102" "42122" "42703" "42P01" "42S02" "42S03" "42S04" "42S22"]]
        (doseq [state states]
          (testing state
            (is (= ::fallback (fallback (keyword "sql-state" state) (throw-sql-state state))))))
        (is (= (into #{} (map #(keyword "sql-state" %)) states) @degraded))))
    (testing "a missing-relation error reached only through getCause still falls back"
      (is (= ::fallback (fallback ::wrapped #(throw (ex-info "wrapper" {} (sql-error-with-state "42P01")))))))
    (testing "a missing-relation error reached only through getNextException still falls back"
      (let [outer (sql-error-with-state "08006")]
        (.setNextException outer (sql-error-with-state "42S02"))
        (is (= ::fallback (fallback ::chained #(throw outer))))))
    (testing "a cyclic cause chain without a missing-relation error terminates and rethrows"
      (let [a (sql-error-with-state "08006")
            b (sql-error-with-state "08006")]
        (.setNextException a b)
        (.setNextException b a)
        (is (thrown? SQLException (fallback ::cycle #(throw a))))))
    (testing "an unrelated SQLState is not swallowed"
      (is (thrown-with-msg? SQLException #"23505" (fallback ::constraint (throw-sql-state "23505")))))))

(deftest ^:synchronized verify-write-target-shape-passes-on-current-schema-test
  (testing "verify-write-target-shape! returns nil when the appdb has the columns insert-score-row! writes"
    (mt/initialize-if-needed! :db)
    (is (nil? (appdb-source/verify-write-target-shape!)))))

(deftest verify-write-target-shape-fails-fast-on-missing-relation-test
  (testing "a missing table or column becomes a :cli-validation ex-info naming the table"
    (mt/with-dynamic-fn-redefs [data-complexity-score.db/probe-score-columns (throw-sql-state "42P01")]
      (let [thrown (try (appdb-source/verify-write-target-shape!)
                        (catch clojure.lang.ExceptionInfo e e))]
        (is (=? {:cli-validation true, :sql-state "42P01"} (ex-data thrown)))
        (is (re-find #"data_complexity_score" (ex-message thrown))))))
  (testing "an unrelated SQL error propagates unchanged"
    (mt/with-dynamic-fn-redefs [data-complexity-score.db/probe-score-columns (throw-sql-state "08006")]
      (is (thrown? SQLException (appdb-source/verify-write-target-shape!))))))
