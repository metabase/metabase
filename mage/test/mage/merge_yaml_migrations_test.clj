(ns mage.merge-yaml-migrations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.merge-yaml-migrations :as merge-yaml]))

(def fixtures-dir "mage/resources/merge-yaml-migrations-test/fixtures")

(defn- fixture-path [filename]
  (str fixtures-dir "/" filename))

(defn- merge-files-test
  "Test helper that calls the private merge-files function"
  [base ours theirs]
  (#'merge-yaml/merge-files base ours theirs {:marker-size 7}))

(deftest clean-merge-both-add-different-changesets
  (testing "clean merge: both branches add different changesets"
    (let [{:keys [result conflicts cnt]} (merge-files-test
                                          (fixture-path "base-simple.yaml")
                                          (fixture-path "ours-adds-one.yaml")
                                          (fixture-path "theirs-adds-one.yaml"))]
      (is (empty? conflicts) "Should have no conflicts")
      (is (= 3 cnt) "Should have 3 changesets total")
      (is (= 3 (count (re-seq #"(?m)^  - changeSet:" result)))
          "Result should contain 3 changesets"))))

(deftest clean-merge-only-ours-adds
  (testing "clean merge: only our branch adds a changeset"
    (let [{:keys [result conflicts cnt]} (merge-files-test
                                          (fixture-path "base-simple.yaml")
                                          (fixture-path "ours-adds-one.yaml")
                                          (fixture-path "base-simple.yaml"))]
      (is (empty? conflicts) "Should have no conflicts")
      (is (= 2 cnt) "Should have 2 changesets")
      (is (= 2 (count (re-seq #"(?m)^  - changeSet:" result)))
          "Result should contain 2 changesets"))))

(deftest conflict-both-modify-same-changeset
  (testing "conflict: both branches modify the same changeset differently"
    (let [{:keys [result conflicts cnt]} (merge-files-test
                                          (fixture-path "base-conflict.yaml")
                                          (fixture-path "ours-modifies.yaml")
                                          (fixture-path "theirs-modifies.yaml"))]
      (is (= 1 cnt))
      (is (seq conflicts) "Should have conflicts")
      (is (str/includes? result "MERGE CONFLICT")
          "Result should contain conflict markers"))))

(deftest deletion-changeset-deleted
  (testing "deletion: changeset deletion is respected"
    (let [{:keys [result conflicts cnt]} (merge-files-test
                                          (fixture-path "base-two-changesets.yaml")
                                          (fixture-path "ours-deletes-second.yaml")
                                          (fixture-path "base-two-changesets.yaml"))]
      (is (empty? conflicts) "Should have no conflicts")
      (is (= 1 cnt) "Should have only 1 changeset (deletion respected)")
      (is (= 1 (count (re-seq #"(?m)^  - changeSet:" result)))
          "Result should contain 1 changeset"))))

(deftest preserves-footer-warning
  (testing "preserves footer warning"
    (let [{:keys [result conflicts]} (merge-files-test
                                      (fixture-path "base-with-footer.yaml")
                                      (fixture-path "ours-adds-with-footer.yaml")
                                      (fixture-path "base-with-footer.yaml"))]
      (is (empty? conflicts) "Should have no conflicts")
      (is (str/includes? result "# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE!")
          "Footer warning should be preserved")
      (is (str/includes? result "# ADVICE:")
          "Footer advice should be preserved"))))

(deftest preserves-formatting
  (testing "preserves formatting and blank lines"
    (let [{:keys [result conflicts]} (merge-files-test
                                      (fixture-path "base-simple.yaml")
                                      (fixture-path "ours-adds-one.yaml")
                                      (fixture-path "theirs-adds-one.yaml"))]
      (is (empty? conflicts) "Should have no conflicts")
      (is (str/includes? result "  - objectQuotingStrategy: QUOTE_ALL_OBJECTS")
          "Should preserve quoting strategy line")
      (is (not (str/includes? result "\n\n\n"))
          "Should not have consecutive blank lines"))))

(deftest sorts-changesets-chronologically
  (testing "sorts changesets by ID chronologically"
    (let [{:keys [result conflicts]} (merge-files-test
                                      (fixture-path "base-sort.yaml")
                                      (fixture-path "ours-adds-later.yaml")
                                      (fixture-path "theirs-adds-between.yaml"))]
      (is (empty? conflicts) "Should have no conflicts")

      ;; Extract changeset IDs in order
      (let [ids (re-seq #"id: v58\.2025-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}" result)
            ids-str (map #(subs % 4) ids)] ;; Remove "id: " prefix
        (is (= ["v58.2025-10-30T09:00:00"
                "v58.2025-10-31T10:00:00"
                "v58.2025-11-01T12:00:00"]
               ids-str)
            "Changesets should be sorted chronologically")))))
