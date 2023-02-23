(ns metabase.lib.util-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib.util :as lib.util])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib.util :as lib.util])]))

(t/deftest ^:parallel pipeline-test
  (t/are [query expected] (= expected
                             (#'lib.util/pipeline query))
    ;; MBQL query
    {:database 1
     :type     :query
     :query    {:source-query {:source-query {:source-table 2}}
                :filter       [:= [:field 3 nil] "wow"]}}
    {:database 1
     :type     :pipeline
     :stages   [{:lib/type     :stage/mbql
                 :source-table 2}
                {:lib/type :stage/mbql}
                {:lib/type :stage/mbql
                 :filter   [:= [:field 3 nil] "wow"]}]}

    ;; native query
    {:database 1
     :type     :native
     :native   {:query "SELECT * FROM VENUES;"}}
    {:database 1
     :type     :pipeline
     :stages   [{:lib/type :stage/native
                 :native   "SELECT * FROM VENUES;"}]}

    ;; already a pipeline: nothing to do
    {:database 1
     :type     :pipeline
     :stages   [{:lib/type :stage/native
                 :native   "SELECT * FROM VENUES;"}]}
    {:database 1
     :type     :pipeline
     :stages   [{:lib/type :stage/native
                 :native   "SELECT * FROM VENUES;"}]}))

(t/deftest ^:parallel query-stage-test
  (t/is (= {:lib/type     :stage/mbql
            :source-table 1}
           (lib.util/query-stage {:database 1
                                  :type     :query
                                  :query    {:source-table 1}}
                                 0)))
  (t/are [index expected] (= expected
                             (lib.util/query-stage {:database 1
                                                    :type     :query
                                                    :query    {:source-query {:source-table 1}}}
                                                   index))
    0 {:lib/type     :stage/mbql
       :source-table 1}
    1 {:lib/type :stage/mbql})
  (t/testing "negative index"
    (t/are [index expected] (= expected
                               (lib.util/query-stage {:database 1
                                                      :type     :query
                                                      :query    {:source-query {:source-table 1}}}
                                                     index))
      -1 {:lib/type :stage/mbql}
      -2 {:lib/type     :stage/mbql
          :source-table 1}))
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
            :type     :pipeline
            :stages   [{:lib/type     :stage/mbql
                        :source-table 1
                        :aggregation  [[:count]]}]}
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
       :type     :pipeline
       :stages   [{:lib/type     :stage/mbql
                   :source-table 1
                   :aggregation  [[:count]]}
                  {:lib/type :stage/mbql}]}
    1 {:database 1
       :type     :pipeline
       :stages   [{:lib/type     :stage/mbql
                   :source-table 1}
                  {:lib/type    :stage/mbql
                   :aggregation [[:count]]}]}
    -1 {:database 1
        :type     :pipeline
        :stages   [{:lib/type     :stage/mbql
                    :source-table 1}
                   {:lib/type    :stage/mbql
                    :aggregation [[:count]]}]})
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
            :type     :pipeline
            :stages   [{:lib/type     :stage/mbql
                        :source-table 2}]}
           (lib.util/ensure-mbql-final-stage {:database 1
                                              :type     :query
                                              :query    {:source-table 2}})))
  (t/is (= {:database 1
            :type     :pipeline
            :stages   [{:lib/type :stage/native
                        :native   "SELECT * FROM venues;"}
                       {:lib/type :stage/mbql}]}
           (lib.util/ensure-mbql-final-stage {:database 1
                                              :type     :native
                                              :native   {:query "SELECT * FROM venues;"}}))))
