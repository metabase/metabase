(ns metabase-enterprise.transform-optimizer.core-test
  "Pure tests for the deterministic parts of `core` — `finalise-proposals`
  and `pair-set`. Full end-to-end `optimize!` requires a transform fixture
  and the (stubbed) LLM call; that lives in the integration tests added
  alongside the deftool wiring (BE-1)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.core :as core]))

(set! *warn-on-reflection* true)

(def ^:private ctx
  {:sources [{:schema "shop" :table_name "orders"}
             {:schema "shop" :table_name "order_items"}]
   :target  {:schema "shop" :table_name "monthly_revenue"}})

(defn- one-stmt-proposal
  "Helper: build a proposal with a single DDL entry."
  [severity statement]
  {:id "p1"
   :name "test"
   :kind "index"
   :severity severity
   :rationale "test"
   :ddl_statements [{:id "d1"
                     :target "source-db"
                     :statement statement
                     :rationale "ok"}]})

;; ---------------------------------------------------------------------------
;; finalise-proposals: DDL validation

(deftest finalise-tags-valid-ddl-as-accepted-test
  (let [{:keys [proposals]}
        (core/finalise-proposals
         [(one-stmt-proposal :high
                             "CREATE INDEX IF NOT EXISTS idx_o ON shop.orders (customer_id)")]
         ctx)
        ddl (first (:ddl_statements (first proposals)))]
    (is (= :accepted (:validation ddl)))
    (is (= "idx_o" (:index_name ddl)))
    (is (nil? (:rejection ddl)))))

(deftest finalise-tags-invalid-ddl-as-rejected-test
  (testing "unknown table"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(one-stmt-proposal :high
                               "CREATE INDEX idx_x ON public.users (id)")]
           ctx)
          ddl (first (:ddl_statements (first proposals)))]
      (is (= :rejected (:validation ddl)))
      (is (= :unknown-table (-> ddl :rejection :reason)))))

  (testing "multi-statement smuggling attempt"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(one-stmt-proposal :high
                               "CREATE INDEX idx_o ON shop.orders (id); DROP TABLE x;")]
           ctx)
          ddl (first (:ddl_statements (first proposals)))]
      (is (= :rejected (:validation ddl)))
      (is (contains? #{:forbidden-keyword :multi-statement}
                     (-> ddl :rejection :reason))))))

(deftest finalise-keeps-rejected-ddls-in-payload-test
  (testing "rejected DDL stays in the response (the UI surfaces it with the reason)"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(one-stmt-proposal :high "CREATE INDEX x ON nope.table (id)")]
           ctx)]
      (is (= 1 (count (:ddl_statements (first proposals))))))))

;; ---------------------------------------------------------------------------
;; finalise-proposals: scoring is wired in

(deftest finalise-includes-optimization-degree-test
  (testing "score reflects all proposals' severities"
    (is (= 100 (:optimization_degree
                (core/finalise-proposals [] ctx))))
    (is (= 70  (:optimization_degree
                (core/finalise-proposals [{:severity :high}] ctx))))
    (is (= 55  (:optimization_degree
                (core/finalise-proposals
                 [{:severity :high} {:severity :medium}] ctx))))))

(deftest finalise-handles-proposals-with-no-ddl-test
  (testing "kind=rewrite proposals (empty ddl_statements) pass through cleanly"
    (let [{:keys [proposals optimization_degree]}
          (core/finalise-proposals
           [{:id "p1" :name "rewrite" :kind "rewrite" :severity :medium
             :body "SELECT 1"
             :ddl_statements []}]
           ctx)]
      (is (= [] (:ddl_statements (first proposals))))
      (is (= 85 optimization_degree)))))

(deftest finalise-handles-missing-ddl-key-test
  (testing "a proposal without :ddl_statements at all is normalised to []"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [{:id "p1" :severity :high}]
           ctx)]
      (is (= [] (:ddl_statements (first proposals)))))))

;; ---------------------------------------------------------------------------
;; The allowed-table set spans sources + target

(deftest target-table-is-also-allowed-test
  (testing "DDL targeting the transform's own target table is accepted"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(one-stmt-proposal :medium
                               "CREATE INDEX IF NOT EXISTS idx_mr ON shop.monthly_revenue (m)")]
           ctx)
          ddl (first (:ddl_statements (first proposals)))]
      (is (= :accepted (:validation ddl))))))
