(ns metabase.query-processor.middleware.annotate-and-sort-test
  (:require [expectations :refer :all]
            metabase.query-processor.middleware.annotate-and-sort
            [metabase.test.util :as tu]))

(tu/resolve-private-vars metabase.query-processor.middleware.annotate-and-sort
  infer-column-types)

;; make sure that `infer-column-types` can still infer types even if the initial value(s) are `nil` (#4256)
(expect
  [{:name "a", :display_name "A", :base_type :type/Integer}
   {:name "b", :display_name "B", :base_type :type/Integer}]
  (:cols (infer-column-types {:columns [:a :b], :rows [[1 nil]
                                                       [2 nil]
                                                       [3 nil]
                                                       [4   5]
                                                       [6   7]]})))
