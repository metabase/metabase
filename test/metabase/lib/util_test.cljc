(ns metabase.lib.util-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.util :as lib.util])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel pipeline-test
  (are [query expected] (=? expected
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

(deftest ^:parallel query-stage-test
  (is (=? {:lib/type     :mbql.stage/mbql
           :source-table 1}
          (lib.util/query-stage {:database 1
                                 :type     :query
                                 :query    {:source-table 1}}
                                0)))
  (are [index expected] (=? expected
                            (lib.util/query-stage {:database 1
                                                   :type     :query
                                                   :query    {:source-query {:source-table 1}}}
                                                  index))
    0 {:lib/type     :mbql.stage/mbql
       :source-table 1}
    1 {:lib/type :mbql.stage/mbql})
  (testing "negative index"
    (are [index expected] (=? expected
                              (lib.util/query-stage {:database 1
                                                     :type     :query
                                                     :query    {:source-query {:source-table 1}}}
                                                    index))
      -1 {:lib/type :mbql.stage/mbql}
      -2 {:lib/type     :mbql.stage/mbql
          :source-table 1}))
  (testing "Out of bounds"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"Stage 2 does not exist"
         (lib.util/query-stage {:database 1
                                :type     :query
                                :query    {:source-query {:source-table 1}}}
                               2)))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"Stage -3 does not exist"
         (lib.util/query-stage {:database 1
                                :type     :query
                                :query    {:source-query {:source-table 1}}}
                               -3)))))

(deftest ^:parallel update-query-stage-test
  (is (=? {:database 1
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
  (are [stage expected] (=? expected
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
  (testing "out of bounds"
    (is (thrown-with-msg?
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

(deftest ^:parallel ensure-mbql-final-stage-test
  (is (=? {:database 1
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 2}]}
          (lib.util/ensure-mbql-final-stage {:database 1
                                             :type     :query
                                             :query    {:source-table 2}})))
  (is (=? {:database 1
           :type     :pipeline
           :stages   [{:lib/type :mbql.stage/native
                       :native   "SELECT * FROM venues;"}
                      {:lib/type :mbql.stage/mbql}]}
          (lib.util/ensure-mbql-final-stage {:database 1
                                             :type     :native
                                             :native   {:query "SELECT * FROM venues;"}}))))

(deftest ^:parallel depipeline-test
  (testing "structured query"
    (let [query {:type :query
                 :database 1
                 :query {:source-table 1
                         :aggregation [["count"]]}}]
      (is (=? query (-> query lib.util/pipeline lib.util/depipeline)))))

  (testing "nested structured query"
    (let [query {:type :query
                 :database 1
                 :query {:source-query {:source-table 2
                                        :filter [">", ["field" 4 nil] 10]
                                        :aggregation [["count"]]
                                        :breakout [["field" 4 {:temporal-unit "month"}]]}
                         :filter [">" ["field" "count" { "base-type" "type/Integer" }] 20]}}]
      (is (=? query (-> query lib.util/pipeline lib.util/depipeline)))))

  (testing "native query"
    (let [query {:type :native
                 :database 1
                 :native {:query "SELECT count(*) FROM orders"}}]
      (is (=? query (-> query lib.util/pipeline lib.util/depipeline))))))
