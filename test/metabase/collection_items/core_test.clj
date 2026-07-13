(ns metabase.collection-items.core-test
  "The sort clause behind a collection listing: \"special\" collection types last, then the requested column, with a
   deterministic tiebreak — and the app DB decides how nulls fall."
  (:require
   [clojure.test :refer :all]
   [metabase.collection-items.core :as collection-items]))

(set! *warn-on-reflection* true)

(deftest ^:parallel children-sort-clause-test
  ;; we always place "special" collection types (i.e. "Metabase Analytics") last
  (testing "Default sort"
    (doseq [app-db [:mysql :h2 :postgres]]
      (is (= [[:authority_level :asc :nulls-last]
              [:type :asc :nulls-first]
              [:%lower.name :asc]
              [:id :asc]]
             (collection-items/children-sort-clause {:official-collections-first? true} app-db))))))

(deftest ^:parallel children-sort-clause-test-2
  (testing "Sorting by last-edited-at"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:%isnull.last_edit_timestamp]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (collection-items/children-sort-clause {:sort-column :last-edited-at
                                                   :sort-direction :asc
                                                   :official-collections-first? true} :mysql)))))

(deftest ^:parallel children-sort-clause-test-2b
  (testing "Sorting by last-edited-at"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:last_edit_timestamp :nulls-last]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (collection-items/children-sort-clause {:sort-column :last-edited-at
                                                   :sort-direction :asc
                                                   :official-collections-first? true} :postgres)))))

(deftest ^:parallel children-sort-clause-test-2c
  (testing "Sorting by last-edited-by"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:last_edit_last_name :nulls-last]
            [:last_edit_last_name :asc]
            [:last_edit_first_name :nulls-last]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (collection-items/children-sort-clause {:sort-column :last-edited-by
                                                   :sort-direction :asc
                                                   :official-collections-first? true} :postgres)))))

(deftest ^:parallel children-sort-clause-test-2d
  (testing "Sorting by last-edited-by"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:%isnull.last_edit_last_name]
            [:last_edit_last_name :asc]
            [:%isnull.last_edit_first_name]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (collection-items/children-sort-clause {:sort-column :last-edited-by
                                                   :sort-direction :asc
                                                   :official-collections-first? true} :mysql)))))

(deftest ^:parallel children-sort-clause-test-3
  (testing "Sorting by model"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:model_ranking :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (collection-items/children-sort-clause {:sort-column :model
                                                   :sort-direction :asc
                                                   :official-collections-first? true} :postgres)))))

(deftest ^:parallel children-sort-clause-test-3b
  (testing "Sorting by model"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:model_ranking :desc]
            [:%lower.name :asc]
            [:id :asc]]
           (collection-items/children-sort-clause {:sort-column :model
                                                   :sort-direction :desc
                                                   :official-collections-first? true} :mysql)))))

(deftest ^:parallel children-sort-clause-description-test
  (testing "Sorting by description"
    (testing "ascending"
      (is (= [[:authority_level :asc :nulls-last]
              [:type :asc :nulls-first]
              [:%lower.description :asc :nulls-last]
              [:%lower.name :asc]
              [:id :asc]]
             (collection-items/children-sort-clause {:sort-column :description
                                                     :sort-direction :asc
                                                     :official-collections-first? true} :postgres))))
    (testing "descending"
      (is (= [[:authority_level :asc :nulls-last]
              [:type :asc :nulls-first]
              [:%lower.description :desc :nulls-last]
              [:%lower.name :asc]
              [:id :asc]]
             (collection-items/children-sort-clause {:sort-column :description
                                                     :sort-direction :desc
                                                     :official-collections-first? true} :postgres))))))
