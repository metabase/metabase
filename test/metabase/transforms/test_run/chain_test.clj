(ns ^:mb/driver-tests metabase.transforms.test-run.chain-test
  "End-to-end tests for the chained (sub-graph) test-run orchestrator
  ([[metabase.transforms.test-run.chain/run-chain-test!]]) and its HTTP endpoints
  (`POST /:id/test-run/subgraph`, `GET /:id/test-run/subgraph-inputs`).

  Builds a 2-node native chain on the test-data schema:

    t1 (enrich): orders ⋈ people → <enriched>   (per-order rows with state, total)
    t2 (target): <enriched> → aggregate count/revenue by state

  Selecting source {t1} + target {t2} makes the slice {t1, t2} with leaves
  {orders, people}; the executor seeds the two leaves, runs t1 into a scratch
  table, redirects t2's reference to t1's output (accumulating remap), runs t2,
  and diffs t2's output against the expected CSV."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp.core]
   [metabase.test :as mt]
   [metabase.transforms-rest.api.transform]
   [metabase.transforms.test-run.chain :as chain]
   [metabase.transforms.test-run.scratch :as scratch]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; CSV / temp-file helpers
;;; ---------------------------------------------------------------------------

(defn- write-temp-csv!
  ^File [csv-string]
  (doto (File/createTempFile "chain-test-run-" ".csv")
    (spit csv-string)))

(defmacro ^:private with-temp-csv-files
  [bindings & body]
  (let [pairs   (partition 2 bindings)
        names   (mapv first pairs)
        strings (mapv second pairs)]
    `(let [~@(mapcat (fn [n s] [n `(write-temp-csv! ~s)]) names strings)]
       (try
         ~@body
         (finally
           ~@(map (fn [n] `(.delete ~n)) names))))))

(defn- count-test-scratch-tables [db-id schema]
  (let [result (qp.core/process-query
                {:database db-id
                 :type     :native
                 :native   {:query (str "SELECT COUNT(*) FROM information_schema.tables"
                                        " WHERE table_schema = '" schema "'"
                                        " AND table_name LIKE 'mb_transform_temp_table_test_%'")}})]
    (-> result (get-in [:data :rows]) first first int)))

;;; ---------------------------------------------------------------------------
;;; Fixture CSV content (full real-schema headers; small row sets)
;;; ---------------------------------------------------------------------------

(def ^:private people-header
  "id,address,email,password,name,city,longitude,state,source,birth_date,zip,latitude,created_at")

;; 3 people: ids 1 & 3 → CA, id 2 → TX
(def ^:private people-rows
  (str people-header "\n"
       "1,Addr,a@e.com,pw,Alice,SF,\"-1\",CA,g,1990-01-01,94102,\"37\",2020-01-01T00:00:00Z\n"
       "2,Addr,b@e.com,pw,Bob,Austin,\"-2\",TX,d,1985-01-01,78701,\"30\",2020-01-02T00:00:00Z\n"
       "3,Addr,c@e.com,pw,Carol,LA,\"-3\",CA,e,1978-01-01,90001,\"34\",2020-01-03T00:00:00Z\n"))

(def ^:private orders-header
  "id,user_id,product_id,subtotal,tax,total,discount,created_at,quantity")

;; 4 orders: user 1 (CA) → 100 + 50, user 2 (TX) → 200, user 3 (CA) → 30
(def ^:private orders-rows
  (str orders-header "\n"
       "1,1,10,90,10,100.00,,2024-01-01T00:00:00Z,1\n"
       "2,1,11,45,5,50.00,,2024-01-02T00:00:00Z,1\n"
       "3,2,12,180,20,200.00,,2024-01-03T00:00:00Z,1\n"
       "4,3,13,27,3,30.00,,2024-01-04T00:00:00Z,1\n"))

;; Expected target output, ordered by state:
;;   CA: orders 1,2,4 → count 3, revenue 180.00
;;   TX: order 3      → count 1, revenue 200.00
(def ^:private correct-expected-csv
  "state,order_count,revenue\nCA,3,180.00\nTX,1,200.00\n")

;; CA count deliberately wrong (9 instead of 3).
(def ^:private wrong-expected-csv
  "state,order_count,revenue\nCA,9,180.00\nTX,1,200.00\n")

;;; ---------------------------------------------------------------------------
;;; The chain under test
;;; ---------------------------------------------------------------------------

(def ^:private enrich-sql
  (str "SELECT o.id AS order_id, o.total AS total, p.state AS state"
       " FROM orders o JOIN people p ON o.user_id = p.id"))

(defn- aggregate-sql [enriched-table]
  (str "SELECT state, count(*) AS order_count, sum(total) AS revenue"
       " FROM " enriched-table
       " GROUP BY state ORDER BY state"))

;;; ===========================================================================
;;; Passed: full native chain (source t1 → target t2)
;;; ===========================================================================

(deftest chain-native-passed-test
  (testing "2-node native chain runs end-to-end and passes against the correct expected CSV"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (count-test-scratch-tables db-id schema)
                before-runs    (t2/count :model/TransformRun)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [result (chain/run-chain-test!
                              (:id t2) #{(:id t1)}
                              {orders-id orders-f people-id people-f}
                              expected-f {})]
                  (testing "status is passed"
                    (is (= :passed (:status result))
                        (str "Expected passed; diff: " (pr-str (:diff result)))))
                  (testing "run order is topological (t1 before t2)"
                    (is (= [(:id t1) (:id t2)] (:order result))))
                  (testing "diff sections are empty"
                    (is (empty? (get-in result [:diff :missing-rows])))
                    (is (empty? (get-in result [:diff :extra-rows])))
                    (is (empty? (get-in result [:diff :cell-mismatches]))))
                  (testing "all scratch tables cleaned up (2 leaves + 2 node outputs)"
                    (is (= before-scratch (count-test-scratch-tables db-id schema))))
                  (testing "no TransformRun row created"
                    (is (= before-runs (t2/count :model/TransformRun)))))))))))))

;;; ===========================================================================
;;; Failed: wrong expected value triggers a diff mismatch
;;; ===========================================================================

(deftest chain-native-failed-test
  (testing "wrong expected CA count → failed with a named diff, scratch still cleaned"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f wrong-expected-csv]
                (let [result (chain/run-chain-test!
                              (:id t2) #{(:id t1)}
                              {orders-id orders-f people-id people-f}
                              expected-f {})]
                  (testing "status is failed"
                    (is (= :failed (:status result))))
                  (testing "diff reports the discrepancy"
                    (is (or (seq (get-in result [:diff :missing-rows]))
                            (seq (get-in result [:diff :extra-rows]))
                            (seq (get-in result [:diff :cell-mismatches])))))
                  (testing "scratch cleaned up even on a failed diff"
                    (is (= before-scratch (count-test-scratch-tables db-id schema)))))))))))))

;;; ===========================================================================
;;; HTTP endpoints: GET subgraph-inputs + POST subgraph
;;; ===========================================================================

(def ^:private multipart-content-type
  {:request-options {:headers {"content-type" "multipart/form-data"}}})

(defn- subgraph-inputs-url [id] (format "transform/%d/test-run/subgraph-inputs" id))
(defn- subgraph-test-run-url [id] (format "transform/%d/test-run/subgraph" id))

(deftest subgraph-inputs-endpoint-test
  (testing "GET subgraph-inputs returns the leaf input tables for (target, sources)"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (let [resp (mt/user-http-request :crowberto :get 200 (subgraph-inputs-url (:id t2))
                                               :sources (:id t1))]
                (testing "both leaf tables (orders, people) are returned"
                  (is (= #{orders-id people-id} (set (map :table_id resp)))))
                (testing "each descriptor carries schema, name, and column headers"
                  (is (every? (fn [d] (and (string? (:schema d))
                                           (string? (:name d))
                                           (seq (:columns d))))
                              resp)))))))))))

(deftest subgraph-test-run-endpoint-passed-test
  (testing "POST subgraph runs the chain and returns 200 passed"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id          (mt/id)
                schema         "public"
                mp             (mt/metadata-provider)
                orders-id      (mt/id :orders)
                people-id      (mt/id :people)
                enriched-name  (mt/random-name)
                before-scratch (count-test-scratch-tables db-id schema)]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 200 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t1)])})]
                  (testing "status is passed"
                    (is (= "passed" (:status resp))
                        (str "Expected passed; body: " (pr-str resp))))
                  (testing "no scratch tables remain"
                    (is (= before-scratch (count-test-scratch-tables db-id schema)))))))))))))

(deftest subgraph-test-run-endpoint-bad-source-test
  (testing "POST subgraph with a source that does not feed the target → 400 error envelope"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)]
            (mt/with-temp [;; _t1 exists only so t2's reference to enriched-name resolves into a chain.
                           :model/Transform _t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema "public" :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}
                           ;; t3 is unrelated — reads orders only, does not feed t2.
                           :model/Transform t3
                           {:source {:type :query :query (lib/native-query mp "SELECT id FROM orders")}
                            :target {:schema "public" :type "table" :name (mt/random-name)}}]
              (with-temp-csv-files [orders-f   orders-rows
                                    people-f   people-rows
                                    expected-f correct-expected-csv]
                (let [resp (mt/user-http-request
                            :crowberto :post 400 (subgraph-test-run-url (:id t2))
                            multipart-content-type
                            {(str "input-" orders-id) orders-f
                             (str "input-" people-id) people-f
                             "expected"               expected-f
                             "sources"                (json/encode [(:id t3)])})]
                  (testing "error envelope is returned"
                    (is (= "error" (:status resp)))
                    (is (string? (get-in resp [:error :message])))))))))))))

;;; ===========================================================================
;;; Contract: cleanup! runs inside the transform connection context
;;; ===========================================================================

(deftest chain-cleanup-runs-inside-transform-connection-test
  ;; CONTRACT (documented in scratch.clj:29-34): every call to scratch/cleanup!
  ;; issued by run-chain-test! must occur while *connection-type* is bound to
  ;; :transform. On databases with separate write-data credentials the DROP TABLE
  ;; issued by cleanup! would run on read credentials if cleanup! fires after
  ;; with-transform-connection unwinds, leaking all scratch tables.
  ;;
  ;; The single-credential test DB makes this invisible at the table level; we
  ;; observe it by intercepting scratch/cleanup! and capturing *connection-type*
  ;; at each call, then asserting every capture equals :transform.
  (testing "all cleanup! calls occur inside with-transform-connection (success path)"
    (mt/with-premium-features #{}
      (mt/test-drivers #{:postgres}
        (mt/dataset test-data
          (let [db-id         (mt/id)
                schema        "public"
                mp            (mt/metadata-provider)
                orders-id     (mt/id :orders)
                people-id     (mt/id :people)
                enriched-name (mt/random-name)
                ;; Collect *connection-type* for every cleanup! call.
                ;; run-chain-test! issues N+1 calls: one per node output + one
                ;; for the leaf mapping. All must be :transform.
                captured      (atom [])
                real-cleanup! scratch/cleanup!]
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp enrich-sql)}
                            :target {:schema schema :type "table" :name enriched-name}}
                           :model/Transform t2
                           {:source {:type :query :query (lib/native-query mp (aggregate-sql enriched-name))}
                            :target {:schema schema :type "table" :name (mt/random-name)}}]
              (with-redefs [scratch/cleanup!
                            (fn [& args]
                              (swap! captured conj @#'metabase.driver.connection/*connection-type*)
                              (apply real-cleanup! args))]
                (with-temp-csv-files [orders-f   orders-rows
                                      people-f   people-rows
                                      expected-f correct-expected-csv]
                  (chain/run-chain-test!
                   (:id t2) #{(:id t1)}
                   {orders-id orders-f people-id people-f}
                   expected-f {}))))
            (is (pos? (count @captured))
                "cleanup! should have been called at least once")
            (is (every? #{:transform} @captured)
                (str "every cleanup! call must see *connection-type* = :transform; "
                     "got: " (pr-str @captured)))))))))
