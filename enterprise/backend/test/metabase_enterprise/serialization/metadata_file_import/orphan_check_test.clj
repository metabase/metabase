(ns metabase-enterprise.serialization.metadata-file-import.orphan-check-test
  "Tests for the pre-flight orphan handling that runs after drain and before
  the depth-walk merge. Asymmetric by ref kind:

    - `source_parent_id` orphans → fatal (`assert-no-orphan-refs!` throws
      `:file-incomplete`). A field claiming a non-present parent has no
      structurally valid position.
    - `source_fk_target_id` orphans → lossy (`null-orphan-fk-target-refs!`
      NULLs the ref and returns the count for the caller to WARN-log).
      A missing fk target degrades cleanly to 'no fk relationship known'."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [toucan2.core :as t2]))

(defn- insert-staging-fields!
  "Insert a sequence of partial field rows directly into `metabase_field_import`,
  filling in required columns with sensible defaults so we can focus the test
  on the source_parent_id / source_fk_target_id graph."
  [rows]
  (let [defaults {:name "x" :base_type "type/Integer" :database_type "int"}]
    (t2/insert! :metabase_field_import
                (mapv (fn [row] (merge defaults {:source_table_id 1} row)) rows))))

;;; ============================== happy path ==============================

(deftest empty-staging-passes-test
  (try
    (p/clear-staging-tables!)
    (is (nil? (p/assert-no-orphan-refs!)))
    (finally (p/clear-staging-tables!))))

(deftest staging-with-only-roots-passes-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 1}
                             {:source_id 2}
                             {:source_id 3}])
    (is (nil? (p/assert-no-orphan-refs!)))
    (finally (p/clear-staging-tables!))))

(deftest staging-with-resolvable-parent-and-fk-passes-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 10}
                             {:source_id 11 :source_parent_id 10}
                             {:source_id 12 :source_fk_target_id 11}
                             {:source_id 13 :source_parent_id 11 :source_fk_target_id 10}])
    (is (nil? (p/assert-no-orphan-refs!)))
    (finally (p/clear-staging-tables!))))

;;; ============================== orphan parent ref ==============================

(deftest single-orphan-parent-ref-throws-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 100}
                             {:source_id 101 :source_parent_id 999}])
    (let [thrown (try (p/assert-no-orphan-refs!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown) "should have thrown")
      (is (= :file-incomplete (:kind (ex-data thrown))))
      (is (= 1 (:orphan-parent-count (ex-data thrown))))
      (is (= [{:source_id 101 :source_parent_id 999}]
             (:orphan-parent-sample (ex-data thrown))))
      (testing "error message includes the count"
        (is (re-find #"1 orphan parent" (ex-message thrown)))))
    (finally (p/clear-staging-tables!))))

;;; ============================== orphan fk-target ref ==============================

(deftest orphan-fk-target-ref-is-not-fatal-for-assert-test
  ;; Handled separately by null-orphan-fk-target-refs!.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 200}
                             {:source_id 201 :source_fk_target_id 9999}])
    (is (nil? (p/assert-no-orphan-refs!))
        "orphan fk-target alone should not throw")
    (finally (p/clear-staging-tables!))))

(deftest orphan-fk-target-ref-gets-nulled-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 200}
                             {:source_id 201 :source_fk_target_id 9999}])
    (let [result (p/null-orphan-fk-target-refs!)]
      (is (= 1 (:count result)))
      (is (= [{:source_id 201 :source_fk_target_id 9999}]
             (:sample result))))
    (testing "the orphan ref is NULL'd in staging"
      (is (= [{:source_id 201 :source_fk_target_id nil}]
             (t2/query
              {:select [:source_id :source_fk_target_id]
               :from   [:metabase_field_import]
               :where  [:= :source_id 201]})))
      (testing "the non-orphan row is untouched"
        (is (= [{:source_id 200 :source_fk_target_id nil}]
               (t2/query
                {:select [:source_id :source_fk_target_id]
                 :from   [:metabase_field_import]
                 :where  [:= :source_id 200]})))))
    (finally (p/clear-staging-tables!))))

(deftest valid-fk-target-ref-survives-null-pass-test
  ;; null-orphan-fk-target-refs! must not touch rows whose fk target IS
  ;; present in staging.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 210}
                             {:source_id 211 :source_fk_target_id 210}])
    (let [result (p/null-orphan-fk-target-refs!)]
      (is (= 0 (:count result)))
      (is (nil? (:sample result))))
    (is (= [{:source_id 211 :source_fk_target_id 210}]
           (t2/query
            {:select [:source_id :source_fk_target_id]
             :from   [:metabase_field_import]
             :where  [:= :source_id 211]})))
    (finally (p/clear-staging-tables!))))

;;; ============================== both kinds of orphan ==============================

(deftest both-orphan-types-handled-asymmetrically-test
  ;; Orphan parent still throws; orphan fk-target is handled by the separate
  ;; null-pass. The throw happens before the null-pass would run.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 300}
                             {:source_id 301 :source_parent_id 9001}
                             {:source_id 302 :source_fk_target_id 9002}])
    (let [thrown (try (p/assert-no-orphan-refs!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown) "assert-no-orphan-refs! should still throw on parent orphan")
      (is (= :file-incomplete (:kind (ex-data thrown))))
      (is (= 1 (:orphan-parent-count (ex-data thrown))))
      (is (seq (:orphan-parent-sample (ex-data thrown)))))
    (finally (p/clear-staging-tables!))))

;;; ============================== sample truncation ==============================

(deftest orphan-sample-caps-at-ten-rows-test
  (try
    (p/clear-staging-tables!)
    ;; 25 rows all pointing at a non-existent parent
    (insert-staging-fields!
     (cons {:source_id 1}
           (for [i (range 1000 1025)] {:source_id i :source_parent_id 999})))
    (let [thrown (try (p/assert-no-orphan-refs!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (testing "count reflects all 25 orphans"
        (is (= 25 (:orphan-parent-count (ex-data thrown)))))
      (testing "sample is capped at 10"
        (is (= 10 (count (:orphan-parent-sample (ex-data thrown)))))))
    (finally (p/clear-staging-tables!))))

;;; ============================== self-reference is not an orphan ==============================

(deftest self-referential-parent-id-is-not-an-orphan-test
  ;; A row whose source_parent_id equals its own source_id is a cycle —
  ;; that's a different problem (caught by depth tagging) but it's NOT an
  ;; orphan since the referenced source_id IS in the file.
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 500 :source_parent_id 500}])
    (is (nil? (p/assert-no-orphan-refs!)))
    (finally (p/clear-staging-tables!))))
