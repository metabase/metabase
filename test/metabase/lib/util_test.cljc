(ns metabase.lib.util-test
  (:require
   [clojure.test :as t]
   [metabase.lib.util :as lib.util])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel pipeline-test
  (t/are [query expected] (=? expected
                              (lib.util/pipeline query))
    ;; MBQL query
    {:database 1
     :type     :query
     :query    {:source-query {:source-query {:source-table 2}}
                :filter       [:=
                               {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                               [:field 3 {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"}]
                               "wow"]}}
    {:database 1
     :type     :pipeline
     :stages   [{:lib/type     :mbql.stage/mbql
                 :source-table 2}
                {:lib/type :mbql.stage/mbql}
                {:lib/type :mbql.stage/mbql
                 :filter   [:=
                            {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                            [:field 3 {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"}]
                            "wow"]}]}

    ;; native query
    {:database 1
     :type     :native
     :native   {:query "SELECT * FROM VENUES;"}}
    {:database 1
     :type     :pipeline
     :stages   [{:lib/type :mbql.stage/native
                 :native   "SELECT * FROM VENUES;"}]}

    ;; already a pipeline: nothing to do
    {:database 1
     :lib/type :mbql/query
     :type     :pipeline
     :stages   [{:lib/type    :mbql.stage/native
                 :lib/options {:lib/uuid "ef87e113-7436-41dd-9f78-3232c6778436"}
                 :native      "SELECT * FROM VENUES;"}]}
    {:database 1
     :lib/type :mbql/query
     :type     :pipeline
     :stages   [{:lib/type :mbql.stage/native
                 :native   "SELECT * FROM VENUES;"}]}))

(t/deftest ^:parallel query-stage-test
  (t/is (=? {:lib/type     :mbql.stage/mbql
             :source-table 1}
            (lib.util/query-stage {:database 1
                                   :type     :query
                                   :query    {:source-table 1}}
                                  0)))
  (t/are [index expected] (=? expected
                              (lib.util/query-stage {:database 1
                                                     :type     :query
                                                     :query    {:source-query {:source-table 1}}}
                                                    index))
    0 {:lib/type     :mbql.stage/mbql
       :source-table 1}
    1 {:lib/type :mbql.stage/mbql})
  (t/testing "negative index"
    (t/are [index expected] (=? expected
                                (lib.util/query-stage {:database 1
                                                       :type     :query
                                                       :query    {:source-query {:source-table 1}}}
                                                      index))
      -1 {:lib/type :mbql.stage/mbql}
      -2 {:lib/type     :mbql.stage/mbql
          :source-table 1}))
  (t/testing "Out of bounds"
    (t/is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
           #"Stage 2 does not exist"
           (lib.util/query-stage {:database 1
                                  :type     :query
                                  :query    {:source-query {:source-table 1}}}
                                 2)))
    (t/is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
           #"Stage -3 does not exist"
           (lib.util/query-stage {:database 1
                                  :type     :query
                                  :query    {:source-query {:source-table 1}}}
                                 -3)))))

(t/deftest ^:parallel update-query-stage-test
  (t/is (=? {:database 1
             :type     :pipeline
             :stages   [{:lib/type     :mbql.stage/mbql
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
  (t/are [stage expected] (=? expected
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
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1
                   :aggregation  [[:count]]}
                  {:lib/type :mbql.stage/mbql}]}
    1 {:database 1
       :type     :pipeline
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1}
                  {:lib/type    :mbql.stage/mbql
                   :aggregation [[:count]]}]}
    -1 {:database 1
        :type     :pipeline
        :stages   [{:lib/type     :mbql.stage/mbql
                    :source-table 1}
                   {:lib/type    :mbql.stage/mbql
                    :aggregation [[:count]]}]})
  (t/testing "out of bounds"
    (t/is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
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
  (t/is (=? {:database 1
             :type     :pipeline
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table 2}]}
            (lib.util/ensure-mbql-final-stage {:database 1
                                               :type     :query
                                               :query    {:source-table 2}})))
  (t/is (=? {:database 1
             :type     :pipeline
             :stages   [{:lib/type :mbql.stage/native
                         :native   "SELECT * FROM venues;"}
                        {:lib/type :mbql.stage/mbql}]}
            (lib.util/ensure-mbql-final-stage {:database 1
                                               :type     :native
                                               :native   {:query "SELECT * FROM venues;"}}))))
