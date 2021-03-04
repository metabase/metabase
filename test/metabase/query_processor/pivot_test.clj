(ns metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require [clojure.set :as set]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.api.pivots :as pivot.test-utils]
            [metabase.models :refer [Card Collection]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.query-processor :as qp]
            [metabase.query-processor.pivot :as pivot]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]))

(deftest group-bitmask-test
  (doseq [[indices expected] {[0]     6
                              [0 1]   4
                              [0 1 2] 0
                              []      7}]
    (is (= expected
           (#'pivot/group-bitmask 3 indices)))))

(deftest powerset-test
  (is (= [[]]
         (#'pivot/powerset [])))
  (is (= [[0] []]
         (#'pivot/powerset [0])))
  (is (= [[0 1] [1] [0] []]
         (#'pivot/powerset [0 1])))
  (is (= [[0 1 2] [1 2] [0 2] [2] [0 1] [1] [0] []]
         (#'pivot/powerset [0 1 2]))))

(deftest breakout-combinations-test
  (testing "Should return the combos that Paul specified in (#14329)"
    (is (= [[0 1 2]
            [0 1  ]
            [0    ]
            [     ]]
           (#'pivot/breakout-combinations 3 [0 1 2] [])))
    (is (= (sort-by
            (partial #'pivot/group-bitmask 4)
            [;; primary data
             [0 1 2 3]
             ;; subtotal rows
             [0     3]
             [0 1   3]
             ;; row totals
             [0 1 2  ]
             ;; subtotal rows within "row totals"
             [0      ]
             [0 1    ]
             ;; "grand totals" row
             [      3]
             ;; bottom right corner
             [       ]])
           (#'pivot/breakout-combinations 4 [0 1 2] [3])))
    (testing "If pivot-rows and pivot-cols aren't specified, then just return the powerset"
      (is (= [[0 1 2]
              [  1 2]
              [0   2]
              [    2]
              [0 1  ]
              [  1  ]
              [0    ]
              [     ]]
             (#'pivot/breakout-combinations 3 [] []))))))

(deftest validate-pivot-rows-cols-test
  (testing "Should throw an Exception if you pass in invalid pivot-rows"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-rows: specified breakout at index 3, but we only have 3 breakouts"
         (#'pivot/breakout-combinations 3 [0 1 2 3] []))))
  (testing "Should throw an Exception if you pass in invalid pivot-cols"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-cols: specified breakout at index 3, but we only have 3 breakouts"
         (#'pivot/breakout-combinations 3 [] [0 1 2 3]))))
  ;; TODO -- we should require these columns to be distinct as well (I think?)
  ;; TODO -- require all numbers to be positive
  ;; TODO -- can you specify something in both pivot-rows and pivot-cols?
  )

(defn- test-query []
  (mt/dataset sample-dataset
    (mt/$ids orders
      {:database     (mt/id)
       :type         :query
       :query        {:source-table $$orders
                      :aggregation  [[:count]]
                      :breakout     [$product_id->products.category
                                     $user_id->people.source
                                     !year.created_at]
                      :filter       [:and
                                     [:= $user_id->people.source "Facebook" "Google"]
                                     [:= $product_id->products.category "Doohickey" "Gizmo"]
                                     [:time-interval $created_at -2 :year {}]]}
       :pivot-rows [0 1 2]
       :pivot-cols []})))

(deftest allow-snake-case-test
  (testing "make sure the stuff works with either normal lisp-case keys or snake_case"
    (is (= (mt/rows (pivot/run-pivot-query (test-query)))
           (mt/rows (pivot/run-pivot-query (set/rename-keys (test-query)
                                                            {:pivot-rows :pivot_rows, :pivot-cols :pivot_cols})))))))

(deftest generate-queries-test
  (mt/test-drivers pivot.test-utils/applicable-drivers
    (mt/dataset sample-dataset
      (let [request {:database   (mt/db)
                     :query      {:source-table (mt/$ids $$orders)
                                  :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                  :breakout     [(mt/$ids $orders.user_id->people.state)
                                                 (mt/$ids $orders.user_id->people.source)
                                                 (mt/$ids $orders.product_id->products.category)]}
                     :type       :query
                     :parameters []
                     :pivot-rows [1 0]
                     :pivot-cols [2]}]
        (testing "can generate queries for each new breakout"
          (let [expected (mt/$ids
                           [{:query {:breakout    [$orders.user_id->people.state
                                                   $orders.user_id->people.source
                                                   $orders.product_id->products.category
                                                   [:expression "pivot-grouping"]]
                                     :expressions {:pivot-grouping [:abs 0]}}}
                            {:query {:breakout    [$orders.user_id->people.source
                                                   $orders.product_id->products.category
                                                   [:expression "pivot-grouping"]]
                                     :expressions {:pivot-grouping [:abs 1]}}}
                            {:query {:breakout    [$orders.product_id->products.category
                                                   [:expression "pivot-grouping"]]
                                     :expressions {:pivot-grouping [:abs 3]}}}
                            {:query {:breakout    [$orders.user_id->people.source
                                                   $orders.user_id->people.state
                                                   [:expression "pivot-grouping"]]
                                     :expressions {:pivot-grouping [:abs 4]}}}
                            {:query {:breakout    [$orders.user_id->people.source
                                                   [:expression "pivot-grouping"]]
                                     :expressions {:pivot-grouping [:abs 5]}}}
                            {:query {:breakout    [[:expression "pivot-grouping"]]
                                     :expressions {:pivot-grouping [:abs 7]}}}])
                expected (for [expected-val expected]
                           (-> expected-val
                               (assoc :type       :query
                                      :parameters []
                                      :pivot-rows [1 0]
                                      :pivot-cols [2])
                               (assoc-in [:query :aggregation] [[:count] [:sum (mt/$ids $orders.quantity)]])
                               (assoc-in [:query :source-table] (mt/$ids $$orders))))
                actual   (map (fn [actual-val] (dissoc actual-val :database)) (#'pivot/generate-queries request))]
            (is (= 6 (count actual)))
            (is (= expected actual))))))))

(deftest dont-return-too-many-rows-test
  (testing "Make sure pivot queries don't return too many rows (#14329)"
    (let [results (pivot/run-pivot-query (test-query))
          rows    (mt/rows results)]
      (is (= ["Product → Category"
              "User → Source"
              "Created At"
              "pivot-grouping"
              "Count"]
             (map :display_name (mt/cols results))))
      (is (apply distinct? rows))
      (is (= [["Doohickey" "Facebook" "2019-01-01T00:00:00Z" 0  263 ]
              ["Doohickey" "Facebook" "2020-01-01T00:00:00Z" 0  89  ]
              ["Doohickey" "Google"   "2019-01-01T00:00:00Z" 0  276 ]
              ["Doohickey" "Google"   "2020-01-01T00:00:00Z" 0  100 ]
              ["Gizmo"     "Facebook" "2019-01-01T00:00:00Z" 0  361 ]
              ["Gizmo"     "Facebook" "2020-01-01T00:00:00Z" 0  113 ]
              ["Gizmo"     "Google"   "2019-01-01T00:00:00Z" 0  325 ]
              ["Gizmo"     "Google"   "2020-01-01T00:00:00Z" 0  101 ]
              ["Doohickey" "Facebook" nil                    4  352 ]
              ["Doohickey" "Google"   nil                    4  376 ]
              ["Gizmo"     "Facebook" nil                    4  474 ]
              ["Gizmo"     "Google"   nil                    4  426 ]
              ["Doohickey" nil        nil                    6  728 ]
              ["Gizmo"     nil        nil                    6  900 ]
              [nil         nil        nil                    7  1628]]
             rows)))))

(defn- distinct-values [table col]
  (->> (mt/rows
         (mt/dataset sample-dataset
           (qp/process-query
            {:database (mt/id)
             :type     :query
             :query    {:source-table (mt/id table)
                        :breakout     [[:field-id (mt/id table col)]]}})))
       (map first)
       set))

(deftest return-correct-columns-test
  (let [results (pivot/run-pivot-query (pivot.test-utils/pivot-query))
        rows    (mt/rows results)]
    (testing "Columns should come back in the expected order"
      (is (= ["User → State"
              "User → Source"
              "Product → Category"
              "pivot-grouping"
              "Count"
              "Sum of Quantity"]
             (map :display_name (mt/cols results)))))
    (testing "Rows should have the correct shape"
      (let [Row [(s/one (s/maybe (apply s/enum (distinct-values :people   :state)))    "state")
                 (s/one (s/maybe (apply s/enum (distinct-values :people   :source)))   "source")
                 (s/one (s/maybe (apply s/enum (distinct-values :products :category))) "category")
                 (s/one (s/enum 0 1 3 4 5 7)                                           "pivot group bitmask")
                 (s/one s/Int                                                          "count")
                 (s/one s/Int                                                          "sum")]]
        (is (schema= [Row]
                     rows))))))

(deftest allow-other-rfs-test
  (letfn [(rff [_]
            (fn
              ([] 0)
              ([acc] acc)
              ([acc _] (inc acc))))]
    (is (= (count (mt/rows (pivot/run-pivot-query (pivot.test-utils/pivot-query))))
           (pivot/run-pivot-query (pivot.test-utils/pivot-query) nil {:rff rff})))))

(deftest parameters-query-test
  (mt/dataset sample-dataset
    (is (schema= {:status    (s/eq :completed)
                  :row_count (s/eq 137)
                  s/Keyword  s/Any}
                 (pivot/run-pivot-query (pivot.test-utils/parameters-query))))))

(deftest pivots-should-not-return-expressions-test
  (mt/dataset sample-dataset
    (let [query (assoc (mt/mbql-query orders
                         {:aggregation [[:count]]
                          :breakout    [$user_id->people.source $product_id->products.category]})
                       :pivot-rows [0]
                       :pivot-cols [1])]
      (testing (str "Pivots should not return expression columns in the results if they are not explicitly included in "
                    "`:fields` (#14604)")
        (is (= (m/dissoc-in (pivot/run-pivot-query query)
                            [:data :results_metadata :checksum])
               (m/dissoc-in (pivot/run-pivot-query (assoc-in query [:query :expressions] {"Don't include me pls" [:+ 1 1]}))
                            [:data :results_metadata :checksum]))))

      (testing "If the expression is *explicitly* included in `:fields`, then return it, I guess"
        ;; I'm not sure this behavior makes sense -- it seems liable to result in a query the FE can't handle
        ;; correctly, like #14604. The difference here is that #14064 was including expressions that weren't in
        ;; `:fields` at all, which was a clear bug -- while returning expressions that are referenced in `:fields` is
        ;; how the QP normally works in non-pivot-mode.
        ;;
        ;; I do not think there are any situations where the frontend actually explicitly specifies `:fields` in a
        ;; pivot query, so we can revisit this behavior at a later date if needed.
        (is (= ["User → Source"
                "Product → Category"
                "pivot-grouping"
                "Count"
                "test-expr"]
               (map :display_name
                    (mt/cols
                      (pivot/run-pivot-query (-> query
                                                 (assoc-in [:query :fields] [[:expression "test-expr"]])
                                                 (assoc-in [:query :expressions] {:test-expr [:ltrim "wheeee"]})))))))))

    (testing "We should still be able to use expressions inside the aggregations"
      (is (schema= {:status   (s/eq :completed)
                    s/Keyword s/Any}
                   (pivot/run-pivot-query
                    (mt/mbql-query orders
                      {:expressions {"Product Rating + 1" [:+ $product_id->products.rating 1]}
                       :aggregation [[:count]]
                       :breakout    [$user_id->people.source [:expression "Product Rating + 1"]]})))))))

(deftest pivot-query-should-work-without-data-permissions-test
  (testing "Pivot queries should work if the current user only has permissions to view the Card -- no data perms (#14989)"
    (mt/dataset sample-dataset
      (mt/with-temp-copy-of-db
        (let [query (mt/mbql-query orders
                      {:aggregation [[:count]]
                       :breakout    [$product_id->products.category $user_id->people.source]})]
          (perms/revoke-permissions! (group/all-users) (mt/db))
          (testing "User without perms shouldn't be able to run the query normally"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"You do not have permissions to run this query"
                 (mt/with-test-user :rasta
                   (qp/process-query query)))))
          (testing "Should be able to run the query via a Card that All Users has perms for"
            ;; now save it as a Card in a Collection in Root Collection; All Users should be able to run because the
            ;; Collection inherits Root Collection perms when created
            (mt/with-temp* [Collection [collection]
                            Card       [card {:collection_id (u/the-id collection), :dataset_query query}]]
              (is (schema= {:status   (s/eq "completed")
                            s/Keyword s/Any}
                           (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))))
              (testing "... with the pivot-table endpoints"
                (let [result (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))]
                  (is (schema= {:status   (s/eq "completed")
                                s/Keyword s/Any}
                               result))
                  (is (= (mt/rows (pivot/run-pivot-query query))
                         (mt/rows result))))))))))))
