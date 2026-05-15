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
                             :weights           {:entity 10}}}
          inserted-id (appdb-source/record-score! fp source score)]
      (try
        (is (some? inserted-id) "raw INSERT should surface the generated id")
        (let [row (jdbc/execute-one!
                   (mdb/data-source)
                   [(str "SELECT fingerprint, source, score_data "
                         "FROM data_complexity_score WHERE id = ?") inserted-id]
                   {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
          (is (=? {:fingerprint fp
                   :source      source}
                  row))
          (testing "score_data is stored as the JSON we serialized; round-trips via `json/decode`"
            ;; `${text.type}` maps to CLOB on H2 and TEXT on Postgres/MySQL, so the JDBC driver
            ;; hands us either a `String` or a `Clob` depending on the appdb — `clob->str`
            ;; normalizes both.
            (let [raw     (mdb/clob->str (:score_data row))
                  decoded (json/decode raw true)]
              (is (= 1 (get-in decoded [:library :total])))
              (is (= 1 (get-in decoded [:meta :formula-version]))))))
        (finally
          ;; Append-only table — clean up manually so the test doesn't accumulate rows.
          (t2/delete! :model/DataComplexityScore :id inserted-id))))))
