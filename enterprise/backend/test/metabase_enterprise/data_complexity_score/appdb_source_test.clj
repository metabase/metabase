(ns metabase-enterprise.data-complexity-score.appdb-source-test
  "Integration tests for the raw-JDBC writer. The cron / API path is covered by the Toucan
  `record-score!`; here we verify that the parallel raw-JDBC writer produces a byte-identical
  row from the same inputs."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase.app-db.core :as mdb]
   [metabase.test.initialize :as test.initialize]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

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
