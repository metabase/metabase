(ns metabase-enterprise.serialization.metadata-file-import.orphan-check-test
  "Tests for `assert-no-orphan-refs!` — the pre-flight check that runs after
  drain and before the depth-walk merge. The strict-consistency assumption
  says every cross-row reference (`source_parent_id`, `source_fk_target_id`)
  must point at a row that's also in the file; orphan refs are hard errors,
  not warnings."
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
      (is (= :file_incomplete (:kind (ex-data thrown))))
      (is (= 1 (:orphan-parent-count (ex-data thrown))))
      (is (= 0 (:orphan-fk-target-count (ex-data thrown))))
      (is (= [{:source_id 101 :source_parent_id 999}]
             (:orphan-parent-sample (ex-data thrown))))
      (is (nil? (:orphan-fk-target-sample (ex-data thrown))))
      (testing "error message includes the count"
        (is (re-find #"1 orphan parent" (ex-message thrown)))))
    (finally (p/clear-staging-tables!))))

;;; ============================== orphan fk-target ref ==============================

(deftest single-orphan-fk-target-ref-throws-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 200}
                             {:source_id 201 :source_fk_target_id 9999}])
    (let [thrown (try (p/assert-no-orphan-refs!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown))
      (is (= :file_incomplete (:kind (ex-data thrown))))
      (is (= 0 (:orphan-parent-count (ex-data thrown))))
      (is (= 1 (:orphan-fk-target-count (ex-data thrown))))
      (is (= [{:source_id 201 :source_fk_target_id 9999}]
             (:orphan-fk-target-sample (ex-data thrown))))
      (is (nil? (:orphan-parent-sample (ex-data thrown)))))
    (finally (p/clear-staging-tables!))))

;;; ============================== both kinds of orphan ==============================

(deftest both-orphan-types-surface-in-one-throw-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-fields! [{:source_id 300}
                             {:source_id 301 :source_parent_id 9001}
                             {:source_id 302 :source_fk_target_id 9002}])
    (let [thrown (try (p/assert-no-orphan-refs!) nil
                      (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown))
      (is (= :file_incomplete (:kind (ex-data thrown))))
      (is (= 1 (:orphan-parent-count (ex-data thrown))))
      (is (= 1 (:orphan-fk-target-count (ex-data thrown))))
      (is (seq (:orphan-parent-sample (ex-data thrown))))
      (is (seq (:orphan-fk-target-sample (ex-data thrown)))))
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
