(ns metabase.query-processor.middleware.annotate-and-sort-test
  (:require [expectations :refer :all]
            [metabase.query-processor.middleware.annotate-and-sort :as annotate-and-sort])
  (:import java.util.Date))

;; make sure that `infer-column-types` can still infer types even if the initial value(s) are `nil` (#4256)
(expect
  [{:name "a", :display_name "A", :base_type :type/Integer}
   {:name "b", :display_name "B", :base_type :type/Integer}]
  (:cols (#'annotate-and-sort/infer-column-types {} {:columns [:a :b], :rows [[1 nil]
                                                                              [2 nil]
                                                                              [3 nil]
                                                                              [4   5]
                                                                              [6   7]]})))

(expect
  [{:name "a", :display_name "A", :base_type :type/Integer}
   {:name "b", :display_name "B", :base_type :type/Integer}
   {:name "c", :display_name "C", :base_type :type/DateTime, :timezone "UTC"}]
  (:cols (#'annotate-and-sort/infer-column-types {} {:columns [:a :b :c], :rows [[1 nil nil]
                                                                                 [2 nil nil]
                                                                                 [3 nil nil]
                                                                                 [4   5 (Date.)]
                                                                                 [6   7 (Date.)]]})))
