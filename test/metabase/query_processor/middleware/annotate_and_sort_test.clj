(ns metabase.query-processor.middleware.annotate-and-sort-test
  (:require [expectations :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-vars metabase.query-processor.middleware.annotate-and-sort
  vals->base-type infer-column-types)

;; tests for vals->base-type
(expect
  :type/Integer
  (vals->base-type [1 "A" "B"]))

;; should work with some initial nils
(expect
  :type/Text
  (vals->base-type [nil nil "A"]))

;; (even if sequence is lazy)
(expect
  [:type/Integer true]
  (let [realized-lazy-seq? (atom false)]
    [(vals->base-type (lazy-cat [nil nil nil]
                                (do (reset! realized-lazy-seq? true)
                                    [4 5 6])))
     @realized-lazy-seq?]))

;; but it should respect laziness and not keep scanning after it finds the first non-`nil` value
(expect
  [:type/Integer false]
  (let [realized-lazy-seq? (atom false)]
    [(vals->base-type (lazy-cat [1 2 3]
                                (do (reset! realized-lazy-seq? true)
                                    [4 5 6])))
     @realized-lazy-seq?]))


;; make sure that `infer-column-types` can still infer types even if the initial value(s) are `nil` (#4256)
(expect
  [{:name "a", :base_type :type/Integer}
   {:name "b", :base_type :type/Integer}]
  (:cols (infer-column-types {:columns [:a :b], :rows [[1 nil]
                                                       [2 nil]
                                                       [3 nil]
                                                       [4   5]
                                                       [6   7]]})))
