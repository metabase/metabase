(ns ^:mb/driver-tests metabase-enterprise.transforms-verification.e2e-test
  "End-to-end test for the transform test-run endpoint.

  Exercises one realistic scenario through the full HTTP stack:

  - A native-SQL transform that JOINs two input tables (orders and people)
    with GROUP BY, SUM, COUNT, COALESCE (NULL-handling), a CASE expression
    (1/0 indicator output), WHERE filtering, and a CURRENT_TIMESTAMP column
    that gets ignored via `ignore_columns`.

  - Input fixtures exercising:
    * NULL cells (empty discount column)
    * A 1/0 indicator column (has_discounts: CASE WHEN SUM(COALESCE(discount,0))>0)
    * A date column in the people fixture (birth_date: :type/Date → midnight-UTC)
    * Two fixture files (orders and people) with exact column headers

  - Asserts: 200 'passed' with empty diff sections on the correct expected CSV;
    then 200 'failed' with a named mismatch on a deliberately-wrong expected CSV.

  - Asserts the cleanup and no-TransformRun invariants at the API level.

  These tests exercise the test-run endpoint (`POST /api/ee/transform-test/transform/:id/run`)
  with `sources=[]`, the degenerate single-node case."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.api]
   [metabase-enterprise.transforms-verification.test-util :as tu :refer [with-temp-csv-files]]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Fixture CSV content
;;; ---------------------------------------------------------------------------

;; people columns in position order (matching real test-data schema):
;;   id, address, email, password, name, city, longitude, state, source,
;;   birth_date, zip, latitude, created_at
;; NULLs are empty cells. birth_date is a :type/Date column.
(def ^:private people-header
  "id,address,email,password,name,city,longitude,state,source,birth_date,zip,latitude,created_at")

;; 5 people across 3 states: CA (ids 1,3), TX (ids 2,4), WA (id 5).
;; Row 3 has a NULL birth_date (empty cell) — exercises the date-NULL edge case.
(def ^:private people-5-rows
  (str people-header "\n"
       "1,123 Main St,alice@example.com,pass1,Alice Smith,San Francisco,\"-122.4194\",CA,google,1990-05-15,94102,\"37.7749\",2020-01-01T00:00:00Z\n"
       "2,456 Oak Ave,bob@example.com,pass2,Bob Jones,Austin,\"-97.7431\",TX,direct,1985-03-20,78701,\"30.2672\",2020-01-02T00:00:00Z\n"
       "3,789 Elm St,carol@example.com,pass3,Carol Lee,Los Angeles,\"-118.2437\",CA,email,,90001,\"34.0522\",2020-01-03T00:00:00Z\n"
       "4,321 Pine Rd,dave@example.com,pass4,Dave Kim,Houston,\"-95.3698\",TX,google,1978-11-08,77001,\"29.7604\",2020-01-04T00:00:00Z\n"
       "5,654 Cedar Ln,eve@example.com,pass5,Eve Chen,Seattle,\"-122.3321\",WA,organic,2000-01-01,98101,\"47.6062\",2020-01-05T00:00:00Z\n"))

;; orders columns in position order (matching real test-data schema):
;;   id, user_id, product_id, subtotal, tax, total, discount, created_at, quantity
;; discount is nullable — empty cells = NULL (exercises NULL-in-CSV edge case).
;; 7 orders; order 4 (total=32.70) is filtered out by WHERE total > 50.
(def ^:private orders-header
  "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity")

(def ^:private orders-7-rows
  (str orders-header "\n"
       ;; user 1 (Alice/CA): 2 orders, both > 50. discount NULL on order 1.
       "1,1,10,80.00,7.20,87.20,,2024-03-15T10:00:00Z,2\n"
       "2,1,11,120.00,10.80,130.80,5.00,2024-03-16T11:00:00Z,1\n"
       ;; user 2 (Bob/TX): 1 order > 50. discount NULL.
       "3,2,12,200.00,18.00,218.00,,2024-03-17T09:00:00Z,3\n"
       ;; user 3 (Carol/CA): 2 orders. order 4 total=32.70 is filtered by WHERE; order 5 passes.
       "4,3,13,30.00,2.70,32.70,,2024-03-18T14:00:00Z,1\n"
       "5,3,14,90.00,8.10,98.10,10.00,2024-03-19T12:00:00Z,2\n"
       ;; user 4 (Dave/TX): 1 order > 50. discount NULL.
       "6,4,15,55.00,4.95,59.95,,2024-03-20T15:00:00Z,1\n"
       ;; user 5 (Eve/WA): 1 order > 50. discount 20.00.
       "7,5,16,180.00,16.20,196.20,20.00,2024-03-21T08:00:00Z,4\n"))

;; Expected output — derived by hand from the SQL + fixture data.
;; Output cols: state, order_count, revenue, has_discounts, snapshot_ts (ignored).
;;
;; CA (users 1 + 3):
;;   orders passing WHERE: 1 (87.20, disc=NULL→0), 2 (130.80, disc=5.00), 5 (98.10, disc=10.00)
;;   COUNT=3, SUM(total)=316.10, SUM(COALESCE(discount,0))=15.00 → has_discounts=1
;;
;; TX (users 2 + 4):
;;   orders passing WHERE: 3 (218.00, disc=NULL→0), 6 (59.95, disc=NULL→0)
;;   COUNT=2, SUM(total)=277.95, SUM(COALESCE(discount,0))=0 → has_discounts=0
;;
;; WA (user 5):
;;   orders passing WHERE: 7 (196.20, disc=20.00)
;;   COUNT=1, SUM(total)=196.20, SUM(COALESCE(discount,0))=20.00 → has_discounts=1
;;
;; snapshot_ts (CURRENT_TIMESTAMP) is excluded by ignore_columns — its value in the
;; expected CSV is a placeholder that will always mismatch reality.
(def ^:private correct-expected-csv
  "state,order_count,revenue,has_discounts,snapshot_ts\nCA,3,316.10,1,1970-01-01T00:00:00Z\nTX,2,277.95,0,1970-01-01T00:00:00Z\nWA,1,196.20,1,1970-01-01T00:00:00Z\n")

;; Wrong expected CSV: TX count deliberately changed to 99 instead of 2.
(def ^:private wrong-expected-csv
  "state,order_count,revenue,has_discounts,snapshot_ts\nCA,3,316.10,1,1970-01-01T00:00:00Z\nTX,99,277.95,0,1970-01-01T00:00:00Z\nWA,1,196.20,1,1970-01-01T00:00:00Z\n")

;;; ---------------------------------------------------------------------------
;;; The SQL transform under test
;;;
;;; - JOINs orders (o) → people (p) ON user_id = p.id
;;; - Aggregates: COUNT(*), SUM(total), CASE/COALESCE 1/0 indicator, CURRENT_TIMESTAMP noise col
;;; - WHERE filters orders below $50 (order 4 is excluded)
;;; - GROUP BY state; ORDER BY state (top-level ORDER BY, legal in T-SQL SELECT INTO;
;;;   the diff itself is order-insensitive)
;;; ---------------------------------------------------------------------------

(defn- e2e-sql
  "The JOIN + aggregation transform SQL. Reads the real synced table names (see
  `tu/table-name`) so input-table discovery resolves on every driver."
  []
  (str "SELECT p.state,"
       " COUNT(*) AS order_count,"
       " SUM(o.total) AS revenue,"
       ;; Integer 1/0 indicator, not a boolean literal: T-SQL has no boolean value
       ;; expressions in a SELECT list. CURRENT_TIMESTAMP, not NOW(): SQL Server has no NOW().
       " CASE WHEN SUM(COALESCE(o.discount, 0)) > 0 THEN 1 ELSE 0 END AS has_discounts,"
       " CURRENT_TIMESTAMP AS snapshot_ts"
       " FROM " (tu/table-name :orders) " o"
       " JOIN " (tu/table-name :people) " p ON o.user_id = p.id"
       " WHERE o.total > 50"
       " GROUP BY p.state"
       " ORDER BY p.state"))

;;; ===========================================================================
;;; E2E: passed case — correct expected CSV with ignore_columns for snapshot_ts
;;; ===========================================================================

(deftest e2e-join-aggregation-passed-test
  (testing "E2E: JOIN orders→people + aggregation with NULL/indicator/date fixtures → 200 passed"
    (tu/with-test-run-features
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id      (mt/id)
                schema     (tu/test-schema)
                mp         (mt/metadata-provider)
                orders-id  (mt/id :orders)
                people-id  (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id schema)
                before-runs    (t2/count :model/TransformRun)]
            (mt/with-temp [:model/Transform transform
                           {:source {:type  :query
                                     :query (lib/native-query mp (e2e-sql))}
                            :target {:schema schema
                                     :type   "table"
                                     :name   (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   orders-7-rows
                 people-f   people-5-rows
                 expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/test-run-url (:id transform))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [])
                             "options"                "{\"ignore_columns\":[\"snapshot_ts\"]}"})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; diff: " (pr-str (:diff resp)))))
                  (testing "response has no test_run_id field"
                    (is (not (contains? resp :test_run_id))))
                  (testing "diff is present and well-formed"
                    (is (map? (:diff resp)))
                    (is (contains? (:diff resp) :status))
                    (is (contains? (:diff resp) :row-counts)))
                  (testing "diff sections are empty (no missing/extra/cell-mismatch rows)"
                    (is (empty? (get-in resp [:diff :missing-rows]))
                        "No missing rows expected in a passing diff")
                    (is (empty? (get-in resp [:diff :extra-rows]))
                        "No extra rows expected in a passing diff")
                    (is (empty? (get-in resp [:diff :cell-mismatches]))
                        "No cell mismatches expected in a passing diff")
                    (is (empty? (get-in resp [:diff :column-issues]))
                        "No column issues expected in a passing diff"))
                  (testing "no scratch tables remain after successful run"
                    (is (= before-scratch (tu/count-test-scratch-tables db-id schema))
                        "All scratch tables cleaned up"))
                  (testing "no TransformRun row created"
                    (is (= before-runs (t2/count :model/TransformRun))
                        "No TransformRun row should be created by a test run")))))))))))

;;; ===========================================================================
;;; E2E: failed case — wrong expected value triggers named row mismatch
;;; ===========================================================================

(deftest e2e-join-aggregation-failed-test
  (testing "E2E: mutate one expected cell (TX order_count 99) → 200 failed with named diff"
    ;; Uses POST /ee/transform-test/transform/:id/run with sources=[] (degenerate single-node).
    (tu/with-test-run-features
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset test-data
          (let [db-id      (mt/id)
                schema     (tu/test-schema)
                mp         (mt/metadata-provider)
                orders-id  (mt/id :orders)
                people-id  (mt/id :people)
                before-scratch (tu/count-test-scratch-tables db-id schema)
                before-runs    (t2/count :model/TransformRun)]
            (mt/with-temp [:model/Transform transform
                           {:source {:type  :query
                                     :query (lib/native-query mp (e2e-sql))}
                            :target {:schema schema
                                     :type   "table"
                                     :name   (mt/random-name)}}]
              (with-temp-csv-files
                [orders-f   orders-7-rows
                 people-f   people-5-rows
                 ;; TX order_count is 2 in reality, but expected says 99.
                 expected-f wrong-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (tu/test-run-url (:id transform))
                            tu/multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [])
                             "options"                "{\"ignore_columns\":[\"snapshot_ts\"]}"})]
                  (testing "status is failed"
                    (is (= "failed" (:status resp))
                        "Expected :failed when expected CSV has wrong TX order_count"))
                  (testing "diff shows a mismatch (missing or extra rows, or cell mismatches)"
                    (is (or (seq (get-in resp [:diff :missing-rows]))
                            (seq (get-in resp [:diff :extra-rows]))
                            (seq (get-in resp [:diff :cell-mismatches])))
                        (str "Expected diff to report discrepancy; got: "
                             (pr-str (:diff resp)))))
                  (testing "the diff references the TX row (the deliberately wrong cell)"
                    ;; The TX row (order_count=99 vs 2) should appear in either the
                    ;; missing-rows or cell-mismatches section. Diff rows are sequences
                    ;; of display-string cell values; flatten to individual strings.
                    (let [row-cells  (concat
                                      (mapcat identity (get-in resp [:diff :missing-rows]))
                                      (mapcat identity (get-in resp [:diff :extra-rows])))
                          cm-values  (mapcat (juxt :expected-canonical :actual-canonical)
                                             (get-in resp [:diff :cell-mismatches]))
                          all-strs   (map str (concat row-cells cm-values))]
                      (is (some #(or (.contains ^String % "TX") (.contains ^String % "99"))
                                all-strs)
                          (str "Expected TX/99 to appear in diff; got: "
                               (pr-str (:diff resp))))))
                  (testing "no scratch tables remain after failed run"
                    (is (= before-scratch (tu/count-test-scratch-tables db-id schema))
                        "All scratch tables cleaned up even on failed diff"))
                  (testing "no TransformRun row created"
                    (is (= before-runs (t2/count :model/TransformRun))
                        "No TransformRun row should be created by a test run")))))))))))
