(ns subsets
  (:require [clojure.test :refer [deftest is]]))

(defn subsets [x]
  (if (empty? x)
    #{#{}}
    (let [[head & more]     x
          recursive-subsets (subsets more)]
      (into #{} cat [recursive-subsets
                     (for [subset recursive-subsets]
                       (into #{head} subset))]))))

(deftest subsets-test
  (is (= #{#{}}
         (subsets #{})))
  (is (= #{#{:a}
           #{}}
         (subsets #{:a})))
  (is (= #{#{:a :b}
           #{:b}
           #{:a}
           #{}}
         (subsets #{:a :b})))
  (is (= #{#{:a :b :c}
           #{:b :c}
           #{:a :c}
           #{:c}
           #{:a :b}
           #{:b}
           #{:a}
           #{}}
         (subsets #{:a :b :c}))))
