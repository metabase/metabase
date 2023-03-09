(ns metabase.lib.util-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.util :as lib.util])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel pipeline-test
  (let [uuid1 (random-uuid)
        uuid2 (random-uuid)]
    (are [query expected] (=? expected
                              (lib.util/pipeline query))
      ;; MBQL query
      {:database 1
       :type     :query
       :query    {:source-query {:source-query {:source-table 2}}
                  :filter       [:=
                                 {:lib/uuid uuid1}
                                 [:field 3 {:lib/uuid uuid2}]
                                 "wow"]}}
      {:database 1
       :type     :pipeline
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 2}
                  {:lib/type :mbql.stage/mbql}
                  {:lib/type :mbql.stage/mbql
                   :filter   [:=
                              {:lib/uuid uuid1}
                              [:field 3 {:lib/uuid uuid2}]
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
                   :lib/options {:lib/uuid (random-uuid)}
                   :native      "SELECT * FROM VENUES;"}]}
      {:database 1
       :lib/type :mbql/query
       :type     :pipeline
       :stages   [{:lib/type :mbql.stage/native
                   :native   "SELECT * FROM VENUES;"}]})))

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
