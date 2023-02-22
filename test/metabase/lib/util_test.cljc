(ns metabase.lib.util-test
  (:require [metabase.lib.util :as lib.util]
            #?(:clj [clojure.test :as t]
               :cljs [cljs.test :as t :include-macros true])))

(t/deftest ^:parallel roll-query-test
  (t/is (= {:database 1
            :type     :pipeline
            :stages   [{:source-table 2}
                       {}
                       {:filter [:= [:field 3 nil] "wow"]}]}
           (lib.util/roll-query {:database 1
                                 :query    {:source-query {:source-query {:source-table 2}}
                                            :filter       [:= [:field 3 nil] "wow"]}}))))

(t/deftest ^:parallel unroll-query-test
  (t/is (= {:database 1
            :type     :query
            :query    {:source-query {:source-query {:source-table 2}}
                       :filter       [:= [:field 3 nil] "wow"]}}
           (lib.util/unroll-query {:database 1
                                   :type     :pipeline
                                   :stages   [{:source-table 2}
                                              {}
                                              {:filter [:= [:field 3 nil] "wow"]}]}))))

(t/deftest ^:parallel query-stage-test
  (t/is (= {:source-table 1}
           (lib.util/query-stage {:database 1
                                  :type     :query
                                  :query    {:source-table 1}}
                                 0)))
  (t/are [index expected] (= expected
                             (lib.util/query-stage {:database 1
                                                    :type     :query
                                                    :query    {:source-query {:source-table 1}}}
                                                   index))
    0 {:source-table 1}
    1 {})
  (t/testing "negative index"
    (t/are [index expected] (= expected
                               (lib.util/query-stage {:database 1
                                                      :type     :query
                                                      :query    {:source-query {:source-table 1}}}
                                                     index))
      -1 {}
      -2 {:source-table 1}))
  (t/testing "Out of bounds"
    (t/is (thrown-with-msg?
           Throwable
           #"Stage 2 does not exist"
           (lib.util/query-stage {:database 1
                                  :type     :query
                                  :query    {:source-query {:source-table 1}}}
                                 2)))
    (t/is (thrown-with-msg?
           Throwable
           #"Stage -3 does not exist"
           (lib.util/query-stage {:database 1
                                  :type     :query
                                  :query    {:source-query {:source-table 1}}}
                                 -3)))))

(t/deftest ^:parallel update-query-stage-test
  (t/is (= {:database 1
            :type     :query
            :query    {:source-table 1
                       :aggregation  [[:count]]}}
           (lib.util/update-query-stage {:database 1
                                         :type     :query
                                         :query    {:source-table 1}}
                                        0
                                        update
                                        :aggregation
                                        conj
                                        [:count])))
  (t/are [stage expected] (= expected
                             (lib.util/update-query-stage {:database 1
                                                           :type     :query
                                                           :query    {:source-query {:source-table 1}}}
                                                          stage
                                                          update
                                                          :aggregation
                                                          conj
                                                          [:count]))
    0 {:database 1
       :type     :query
       :query    {:source-query {:source-table 1
                                 :aggregation  [[:count]]}}}
    1 {:database 1
       :type     :query
       :query    {:source-query {:source-table 1}
                  :aggregation  [[:count]]}}
    -1 {:database 1
        :type     :query
        :query    {:source-query {:source-table 1}
                   :aggregation  [[:count]]}})
  (t/testing "out of bounds"
    (t/is (thrown-with-msg?
           Throwable
           #"Stage 2 does not exist"
           (lib.util/update-query-stage {:database 1
                                         :type     :query
                                         :query    {:source-query {:source-table 1}}}
                                        2
                                        update
                                        :aggregation
                                        conj
                                        [:count])))))

(t/deftest ^:parallel ensure-mbql-final-stage-test
  (t/is (= {:database 1
            :type     :query
            :query    {:source-table 2}}
           (lib.util/ensure-mbql-final-stage {:database 1
                                              :type     :query
                                              :query    {:source-table 2}})))
  (t/is (= {:database 1
            :type     :query
            :query    {:source-query {:native "SELECT * FROM venues;"}}}
           (lib.util/ensure-mbql-final-stage {:database 1
                                              :type     :native
                                              :native   {:query "SELECT * FROM venues;"}}))))
