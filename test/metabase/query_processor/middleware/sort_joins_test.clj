(ns metabase.query-processor.middleware.sort-joins-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.sort-joins :as sort-joins]))

(deftest sort-joins-by-dependency-order-test
  (is (= [{:alias     "A"
           :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}
          {:alias     "B"
           :condition [:= [:field 3 {:join-alias "A"}] [:field 4 {:join-alias "B"}]]}]
         (#'sort-joins/sort-joins-by-dependency-order
          [{:alias     "A"
            :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}
           {:alias     "B"
            :condition [:= [:field 3 {:join-alias "A"}] [:field 4 {:join-alias "B"}]]}])
         (#'sort-joins/sort-joins-by-dependency-order
          [{:alias     "B"
            :condition [:= [:field 3 {:join-alias "A"}] [:field 4 {:join-alias "B"}]]}
           {:alias     "A"
            :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}])))

  (testing "Preserve existing order if there are no dependencies."
    (is (= [{:alias     "A"
             :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}
            {:alias     "B"
             :condition [:= [:field 3 nil] [:field 4 {:join-alias "B"}]]}]
           (#'sort-joins/sort-joins-by-dependency-order
            [{:alias     "A"
              :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}
             {:alias     "B"
              :condition [:= [:field 3 nil] [:field 4 {:join-alias "B"}]]}])))
    (is (= [{:alias     "B"
             :condition [:= [:field 3 nil] [:field 4 {:join-alias "B"}]]}
            {:alias     "A"
             :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}]
           (#'sort-joins/sort-joins-by-dependency-order
            [{:alias     "B"
              :condition [:= [:field 3 nil] [:field 4 {:join-alias "B"}]]}
             {:alias     "A"
              :condition [:= [:field 1 nil] [:field 2 {:join-alias "A"}]]}]))))

  (testing "Throw an Exception if there are circular references"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Circular references between joins: join \"B\" depends on #\{\"A\"\} and join \"A\" depends on #\{\"B\"\}"
         (#'sort-joins/sort-joins-by-dependency-order
          [{:alias     "A"
            :condition [:= [:field 1 {:join-alias "B"}] [:field 2 {:join-alias "A"}]]}
           {:alias     "B"
            :condition [:= [:field 3 {:join-alias "A"}] [:field 4 {:join-alias "B"}]]}])))))
