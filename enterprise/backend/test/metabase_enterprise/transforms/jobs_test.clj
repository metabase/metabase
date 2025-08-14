(ns metabase-enterprise.transforms.jobs-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.jobs :as jobs]))

(deftest basic-deps-test
  (let [ordering {1 #{2 3}
                  2 #{3 4}
                  3 #{}
                  4 #{5}
                  5 #{}
                  6 #{7 8}
                  7 #{}
                  8 #{}}]
    (is (= #{1 2 3 4 5}
           (#'jobs/get-deps ordering [1])))
    (is (= #{1 2 3 4 5 6 7 8}
           (#'jobs/get-deps ordering [1 6])))
    (is (= #{2 3 4 5 6 7 8}
           (#'jobs/get-deps ordering [2 6])))
    (is (= #{1 2 3 4 5}
           (#'jobs/get-deps ordering [1 2 3])))))

(deftest cycle-deps-test
  (let [ordering {1 #{2}
                  2 #{3}
                  3 #{1}}]
    (is (= #{1 2 3}
           (#'jobs/get-deps ordering [1])))))

(deftest next-transform-test
  (let [plan
        {:ordering {1 #{2 3}
                    2 #{3 4}
                    3 #{}
                    4 #{5}
                    5 #{}
                    6 #{7 8}
                    7 #{}
                    8 #{}}
         :transforms-by-id {1 {:id 1}
                            2 {:id 2}
                            3 {:id 3}
                            4 {:id 4}
                            5 {:id 5}
                            6 {:id 6}
                            7 {:id 7}
                            8 {:id 8}}}]
    (is (#{3 5 7 8}
         (-> (#'jobs/next-transform plan #{})
             :id)))
    (is (#{3 4 7 8}
         (-> (#'jobs/next-transform plan #{5})
             :id)))
    (is (= 1
           (-> (#'jobs/next-transform plan #{2 3 4 5 6 7 8})
               :id)))))
