(ns metabase.parameters.chain-filter.dedupe-joins-test
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.chain-filter.dedupe-joins :as dedupe]))

;; source-table-id: 298
;; all-joins: ({:lhs {:table 298, :field 557}, :rhs {:table 301, :field 555}})
;; other-table-ids: #{299 301}

(defn- dedupe-joins
  ([joins keep-ids] (dedupe-joins joins 1 keep-ids))
  ([joins start-id keep-ids]
   (map (juxt (comp :table :lhs) (comp :table :rhs))
        (dedupe/dedupe-joins
         start-id #{}
         (for [[lhs rhs] joins]
           {:lhs {:table lhs}, :rhs {:table rhs}})
         keep-ids))))

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
      (is (contains? #{[[1 2] [2 4]] [[1 3] [3 4]]}
                     (dedupe-joins
                      [[1 2] [2 4]
                       [1 3] [3 4]]
                      #{4}))))
    (testing "\n1->2->4 and 1->3->4 (keep 2,3,4) should be deduped to either 1->2, 1->3->4 *or* 1->2->4, 1->3"
      (is (contains? #{[[1 2] [2 4] [1 3]] [[1 3] [3 4] [1 2]]}
                     (dedupe-joins
                      [[1 2] [2 4]
                       [1 3] [3 4]]
                      #{2 3 4})))
      (is (contains? #{[[1 2] [2 4] [1 3]] [[1 3] [3 4] [1 2]]}
                     (dedupe-joins
                      [[1 2] [2 4]
                       [3 4] [1 3]]
                      #{2 3 4}))))
    (testing "\ndisconnected graph"
      (is (= [[1 2] [2 4]]
             (dedupe-joins
              [[1 2] [2 4]
               [3 4]]
              #{2 3 4}))))))

(deftest large-diamond-test
  ;;              7
  ;;             /
  ;;      3-----4--8--9
  ;;     /     /
  ;; 0--1--2--5--6
  (testing "Node 3 is omitted from the above graph."
    (is (= [[0 1]
            [1 2] [2 5] [5 6]
            [5 4] [4 8] [4 7]
            [8 9]]
           (dedupe-joins
            [[0 1]
             [1 3] [3 4] [4 7]
             [4 8] [8 9]
             [1 2] [2 5] [5 4] [5 6]]
            0
            #{6 7 9})
           (dedupe-joins
            [[0 1]
             [1 2] [2 5] [5 4] [5 6]
             [1 3] [3 4] [4 7]
             [4 8] [8 9]]
            0
            #{6 7 9})))))

(deftest luiggi-test
  (testing "A simple linear chain, that killed Metabase. (#46905)"
    (let [in-joins
          [{:lhs {:table 24, :field 265}, :rhs {:table 30, :field 330}} ; 5 times
           {:lhs {:table 30, :field 335}, :rhs {:table 32, :field 351}}
           {:lhs {:table 24, :field 265}, :rhs {:table 30, :field 330}}
           {:lhs {:table 30, :field 328}, :rhs {:table 40, :field 412}}
           {:lhs {:table 24, :field 265}, :rhs {:table 30, :field 330}}
           {:lhs {:table 30, :field 341}, :rhs {:table 28, :field 302}}
           {:lhs {:table 24, :field 265}, :rhs {:table 30, :field 330}}
           {:lhs {:table 30, :field 334}, :rhs {:table 38, :field 399}}
           {:lhs {:table 24, :field 265}, :rhs {:table 30, :field 330}}
           {:lhs {:table 30, :field 333}, :rhs {:table 37, :field 396}}
           {:lhs {:table 24, :field 267}, :rhs {:table 51, :field 432}}]
          expected
          [{:lhs {:table 24, :field 265}, :rhs {:table 30, :field 330}}
           {:lhs {:table 30, :field 335}, :rhs {:table 32, :field 351}}
           {:lhs {:table 30, :field 328}, :rhs {:table 40, :field 412}}
           {:lhs {:table 30, :field 341}, :rhs {:table 28, :field 302}}
           {:lhs {:table 30, :field 334}, :rhs {:table 38, :field 399}}
           {:lhs {:table 30, :field 333}, :rhs {:table 37, :field 396}}]
          result
          (dedupe/dedupe-joins 24 #{} in-joins #{32 40 28 38 37})]
      (is (= (first expected)
             (first result)))
      (is (= (-> expected rest set)
             (-> result rest set))))))
