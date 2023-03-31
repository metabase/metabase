(ns metabase.lib.util-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

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

(deftest ^:parallel pipeline-joins-test
  ;; this isn't meant to be 100% correct pMBQL -- `->pipeline` is just supposed to put stuff in the generally correct
  ;; shape, just to make sure we have `:stages` and stuff looking the way they should. [[metabase.lib.convert]] uses
  ;; this as part of what it does
  (is (=? {:lib/type :mbql/query
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}
                       :fields      [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins       [{:lib/type    :mbql/join
                                      :lib/options {:lib/uuid string?}
                                      :alias       "CATEGORIES__via__CATEGORY_ID"
                                      :condition   [:=
                                                    [:field (meta/id :venues :category-id)]
                                                    [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                                      :strategy    :left-join
                                      :fk-field-id (meta/id :venues :category-id)
                                      :stages      [{:lib/type     :mbql.stage/mbql
                                                     :lib/options  {:lib/uuid string?}
                                                     :source-table (meta/id :venues)}]}]}]
           :database (meta/id)}
          (lib.util/pipeline
           {:database (meta/id)
            :type     :query
            :query    {:fields [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                                 :source-table (meta/id :venues)
                                 :condition    [:=
                                                [:field (meta/id :venues :category-id)]
                                                [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                                 :strategy     :left-join
                                 :fk-field-id  (meta/id :venues :category-id)}]}}))))

(deftest ^:parallel pipeline-source-metadata-test
  (testing "`:source-metadata` should get moved to the previous stage as `:lib/stage-metadata`"
    (is (=? {:lib/type :mbql/query
             :type     :pipeline
             :stages   [{:lib/type           :mbql.stage/mbql
                         :source-table       (meta/id :venues)
                         :lib/stage-metadata {:lib/type :metadata/results
                                              :columns  [(meta/field-metadata :venues :id)]}}
                        {:lib/type :mbql.stage/mbql}]}
            (lib.util/pipeline
             {:database (meta/id)
              :type     :query
              :query    {:source-query    {:source-table (meta/id :venues)}
                         :source-metadata [(meta/field-metadata :venues :id)]}})))))

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

(deftest ^:parallel join-strings-with-conjunction-test
  (are [coll expected] (= expected
                          (lib.util/join-strings-with-conjunction "and" coll))
    []                nil
    ["a"]             "a"
    ["a" "b"]         "a and b"
    ["a" "b" "c"]     "a, b, and c"
    ["a" "b" "c" "d"] "a, b, c, and d"))
