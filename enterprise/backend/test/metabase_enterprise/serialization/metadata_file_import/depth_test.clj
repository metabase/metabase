(ns metabase-enterprise.serialization.metadata-file-import.depth-test
  "Tests for `compute-staging-depth!` — the post-drain step that tags every
  `metabase_field_import` row with a `depth` value, where 0 = root and depth
  d = max(parent depth, fk_target depth) + 1.

  Pre-condition for the tagging step is that orphan refs have already been
  rejected by `assert-no-orphan-refs!`. These tests assume that condition
  holds (every fixture below is consistent)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [toucan2.core :as t2]))

(defn- insert-staging-fields!
  "Insert a sequence of partial field rows into `metabase_field_import`,
  filling in required NOT NULL columns with sensible defaults."
  [rows]
  (let [defaults {:name "x" :base_type "type/Integer" :database_type "int"}]
    (t2/insert! :metabase_field_import
                (mapv (fn [row] (merge defaults {:source_table_id 1} row)) rows))))

(defn- depth-by-source-id
  "Return `{source_id → depth}` after tagging."
  []
  (into {}
        (map (juxt :source_id :depth))
        (t2/query "SELECT source_id, depth FROM metabase_field_import ORDER BY source_id")))

;;; ============================== empty + roots ==============================

(deftest empty-staging-is-noop-test
  (try
    (p/clear-staging-tables!)
    (is (= 0 (p/compute-staging-depth!)))
    (finally (p/clear-staging-tables!))))

(deftest all-roots-get-depth-zero-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 1}
                             {:source_id 2}
                             {:source_id 3}])
    (is (= 0 (p/compute-staging-depth!))
        "max depth assigned is 0 when all rows are roots")
    (is (= {1 0, 2 0, 3 0} (depth-by-source-id)))
    (finally (p/clear-staging-tables!))))

;;; ============================== parent chains ==============================

(deftest one-level-parent-chain-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 10}
                             {:source_id 11 :source_parent_id 10}])
    (is (= 1 (p/compute-staging-depth!)))
    (is (= {10 0, 11 1} (depth-by-source-id)))
    (finally (p/clear-staging-tables!))))

(deftest three-level-parent-chain-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 100}
                             {:source_id 101 :source_parent_id 100}
                             {:source_id 102 :source_parent_id 101}
                             {:source_id 103 :source_parent_id 102}])
    (is (= 3 (p/compute-staging-depth!)))
    (is (= {100 0, 101 1, 102 2, 103 3} (depth-by-source-id)))
    (finally (p/clear-staging-tables!))))

;;; ============================== fk_target chains ==============================

(deftest fk-target-chain-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 200}
                             {:source_id 201 :source_fk_target_id 200}
                             {:source_id 202 :source_fk_target_id 201}])
    (is (= 2 (p/compute-staging-depth!)))
    (is (= {200 0, 201 1, 202 2} (depth-by-source-id)))
    (finally (p/clear-staging-tables!))))

;;; ============================== mixed (max-depth) semantics ==============================

(deftest depth-is-max-of-parent-and-fk-target-depths-test
  (try
    (p/clear-staging-tables!)
    ;; Build:
    ;;   A (root)             — depth 0
    ;;   B → A (parent)       — depth 1
    ;;   C → B (parent)       — depth 2
    ;;   D → A (parent, depth 1) AND fk_target → C (depth 2)
    ;;     → D should be depth 3, not 2 (max of 1, 2 + 1)
    (insert-staging-fields! [{:source_id 10}
                             {:source_id 20 :source_parent_id 10}
                             {:source_id 30 :source_parent_id 20}
                             {:source_id 40 :source_parent_id 10 :source_fk_target_id 30}])
    (is (= 3 (p/compute-staging-depth!)))
    (is (= {10 0, 20 1, 30 2, 40 3} (depth-by-source-id))
        "row with parent at depth 1 and fk_target at depth 2 lands at depth 3")
    (finally (p/clear-staging-tables!))))

;;; ============================== unfolded leaves ==============================

(deftest unfolded-leaves-are-roots-test
  (try
    (p/clear-staging-tables!)
    ;; Leaves with no source_parent_id (the leaf isn't materialized as a
    ;; separate parent storage row) are roots.
    (insert-staging-fields! [{:source_id 50}
                             {:source_id 51}])
    (is (= 0 (p/compute-staging-depth!)))
    (is (= {50 0, 51 0} (depth-by-source-id)))
    (finally (p/clear-staging-tables!))))

;;; ============================== disconnected components ==============================

(deftest multiple-disconnected-chains-tag-in-parallel-test
  (try
    (p/clear-staging-tables!)
    ;; Two unrelated chains.
    (insert-staging-fields! [{:source_id 100}                       ; root in chain A
                             {:source_id 101 :source_parent_id 100} ; depth 1 chain A
                             {:source_id 200}                       ; root in chain B
                             {:source_id 201 :source_parent_id 200} ; depth 1 chain B
                             {:source_id 202 :source_parent_id 201}]) ; depth 2 chain B
    (is (= 2 (p/compute-staging-depth!)))
    (is (= {100 0, 101 1, 200 0, 201 1, 202 2} (depth-by-source-id)))
    (finally (p/clear-staging-tables!))))

;;; ============================== cycle detection ==============================

(deftest two-row-parent-cycle-throws-test
  (try
    (p/clear-staging-tables!)
    ;; X.parent = Y, Y.parent = X — neither is a root, neither can ever
    ;; be tagged.
    (insert-staging-fields! [{:source_id 1 :source_parent_id 2}
                             {:source_id 2 :source_parent_id 1}])
    (let [thrown (try (p/compute-staging-depth!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown) "should have thrown")
      (is (= :cycle-in-field-graph (:kind (ex-data thrown))))
      (is (= 2 (:remaining-rows-count (ex-data thrown))))
      (is (= 2 (count (:remaining-rows-sample (ex-data thrown))))))
    (finally (p/clear-staging-tables!))))

(deftest self-referential-parent-id-throws-test
  ;; A row pointing at itself can never be tagged: it would need depth d
  ;; where its own depth is < d.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 5 :source_parent_id 5}])
    (let [thrown (try (p/compute-staging-depth!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown))
      (is (= :cycle-in-field-graph (:kind (ex-data thrown))))
      (is (= 1 (:remaining-rows-count (ex-data thrown)))))
    (finally (p/clear-staging-tables!))))

(deftest cycle-via-fk-target-throws-test
  ;; X.fk_target = Y, Y.fk_target = X — same problem via the FK relationship
  ;; rather than parent.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 1 :source_fk_target_id 2}
                             {:source_id 2 :source_fk_target_id 1}])
    (let [thrown (try (p/compute-staging-depth!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown))
      (is (= :cycle-in-field-graph (:kind (ex-data thrown)))))
    (finally (p/clear-staging-tables!))))

(deftest cycle-with-some-tagged-rows-test
  ;; Two roots and a 2-cycle. The roots get depth 0; the cycle never
  ;; resolves. The error data should reflect just the cycle rows.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 1}                                  ; root
                             {:source_id 2}                                  ; root
                             {:source_id 100 :source_parent_id 101}          ; cycle
                             {:source_id 101 :source_parent_id 100}])        ; cycle
    (let [thrown (try (p/compute-staging-depth!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (= :cycle-in-field-graph (:kind (ex-data thrown))))
      (is (= 2 (:remaining-rows-count (ex-data thrown)))))
    (finally (p/clear-staging-tables!))))

;;; ============================== idempotence ==============================

(deftest depth-tagging-is-idempotent-test
  ;; Running twice on the same data should produce the same result.
  ;; Useful contract: the merge phase shouldn't have to worry about whether
  ;; depths are stale.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 10}
                             {:source_id 11 :source_parent_id 10}
                             {:source_id 12 :source_parent_id 11}])
    (let [first-result (p/compute-staging-depth!)
          first-depths (depth-by-source-id)
          second-result (p/compute-staging-depth!)
          second-depths (depth-by-source-id)]
      (is (= first-result second-result))
      (is (= first-depths second-depths)))
    (finally (p/clear-staging-tables!))))
