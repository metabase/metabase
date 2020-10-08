(ns metabase.models.params.chain-filter.dedupe-joins-test
  (:require [clojure.test :refer :all]
            [metabase.models.params.chain-filter.dedupe-joins :as dedupe]))

;; source-table-id: 298
;; all-joins: ({:lhs {:table 298, :field 557}, :rhs {:table 301, :field 555}})
;; other-table-ids: #{299 301}

(defn- dedupe-joins [joins keep-ids]
  (map (juxt (comp :table :lhs) (comp :table :rhs))
       (dedupe/dedupe-joins
        1
        (for [[lhs rhs] joins]
          {:lhs {:table lhs}, :rhs {:table rhs}})
        keep-ids)))

(deftest no-duplicates-test
  (testing "Don't remove joins where there are no duplicates"
    (is (= [[1 2] [2 3]]
           (dedupe-joins [[1 2] [2 3]] #{3 4})))))

(deftest diamond-joins-test
  ;; suppose we have a joins like this: T1 is the source Table and we to join against T3, T4 and T5:
  ;;
  ;;    T1
  ;;   /  \
  ;;  T2  T3
  ;;   \  /
  ;;    T4
  ;;    |
  ;;    T5
  ;;
  ;; we might end up with T1 -> T2 -> T4 and T1 -> T3 -> T4 -> T5, respectively (2 different joins against T4).
  ;; all we really need is the T1 -> T3 -> T4 -> T5 (we don't need T2 at all)
  (testing "1->2->4 and 1->3->4->5 (keep 3, 4, 5) should be deduped to 1->3->4->5"
    (is (= [[1 3] [3 4] [4 5]]
           (dedupe-joins
            [[1 2] [2 4]
             [1 3] [3 4] [4 5]]
            #{3 4 5}))))
  (testing "if the path take is indeterminate we should get one or the other but not both"
    (testing "\n1->2->4 and 1->3->4 (keep 4) should be deduped to either 1->3->4 *or* 1->2->4"
      (is (= [[1 2] [2 4]]
             (dedupe-joins
              [[1 2] [2 4]
               [1 3] [3 4]]
              #{4}))))
    (testing "\n1->2->4 and 1->3->4 (keep 2,3,4) should be deduped to either 1->2, 1->3->4 *or* 1->2->4, 1->3"
      (is (= [[1 2] [2 4] [1 3]]
             (dedupe-joins
              [[1 2] [2 4]
               [1 3] [3 4]]
              #{2 3 4}))))))
