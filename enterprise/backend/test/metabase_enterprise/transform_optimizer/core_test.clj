(ns metabase-enterprise.transform-optimizer.core-test
  "Pure tests for the deterministic parts of `core` — `finalise-proposals`
  and friends. Full end-to-end `optimize!` requires a transform fixture
  and the LLM call; that lives in the integration tests added alongside
  the deftool wiring (BE-1)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-optimizer.core :as core]))

(set! *warn-on-reflection* true)

(def ^:private ctx
  {:sources [{:schema "shop" :table_name "orders"}
             {:schema "shop" :table_name "order_items"}]
   :target  {:schema "shop" :table_name "monthly_revenue"}})

(defn- index-proposal
  "Helper: build a kind=:index proposal with a single DDL statement."
  [severity statement]
  {:id "p1"
   :name "test"
   :kind "index"
   :severity severity
   :rationale "test"
   :depends_on []
   :ddl_statement {:target "source-db"
                   :statement statement
                   :rationale "ok"}})

;; ---------------------------------------------------------------------------
;; finalise-proposals: single-DDL validation

(deftest finalise-tags-valid-ddl-as-accepted-test
  (let [{:keys [proposals]}
        (core/finalise-proposals
         [(index-proposal :high
                          "CREATE INDEX IF NOT EXISTS idx_o ON shop.orders (customer_id)")]
         ctx)
        ddl (:ddl_statement (first proposals))]
    (is (= :accepted (:validation ddl)))
    (is (= "idx_o" (:index_name ddl)))
    (is (nil? (:rejection ddl)))))

(deftest finalise-tags-invalid-ddl-as-rejected-test
  (testing "unknown table"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(index-proposal :high
                            "CREATE INDEX idx_x ON public.users (id)")]
           ctx)
          ddl (:ddl_statement (first proposals))]
      (is (= :rejected (:validation ddl)))
      (is (= :unknown-table (-> ddl :rejection :reason)))))

  (testing "multi-statement smuggling attempt"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(index-proposal :high
                            "CREATE INDEX idx_o ON shop.orders (id); DROP TABLE x;")]
           ctx)
          ddl (:ddl_statement (first proposals))]
      (is (= :rejected (:validation ddl)))
      (is (contains? #{:forbidden-keyword :multi-statement}
                     (-> ddl :rejection :reason))))))

(deftest finalise-leaves-rewrite-proposals-alone-test
  (testing "rewrite proposals have no ddl_statement and aren't touched"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [{:id "p1" :name "rewrite" :kind "rewrite" :severity :medium
             :depends_on []
             :body "SELECT 1"}]
           ctx)]
      (is (nil? (:ddl_statement (first proposals))))
      (is (= "SELECT 1" (:body (first proposals)))))))

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

;; ---------------------------------------------------------------------------
;; The allowed-table set spans sources + target

(deftest target-table-is-also-allowed-test
  (testing "DDL targeting the transform's own target table is accepted"
    (let [{:keys [proposals]}
          (core/finalise-proposals
           [(index-proposal :medium
                            "CREATE INDEX IF NOT EXISTS idx_mr ON shop.monthly_revenue (m)")]
           ctx)
          ddl (:ddl_statement (first proposals))]
      (is (= :accepted (:validation ddl))))))
