(ns metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require
   [clj-time.core :as time]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.pivots :as api.pivots]
   [metabase.models :refer [Card Collection]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest ^:parallel group-bitmask-test
  (doseq [[indices expected] {[0]     6
                              [0 1]   4
                              [0 1 2] 0
                              []      7}]
    (is (= expected
           (#'qp.pivot/group-bitmask 3 indices)))))

(deftest ^:parallel powerset-test
  (is (= [[]]
         (#'qp.pivot/powerset [])))
  (is (= [[0] []]
         (#'qp.pivot/powerset [0])))
  (is (= [[0 1] [1] [0] []]
         (#'qp.pivot/powerset [0 1])))
  (is (= [[0 1 2] [1 2] [0 2] [2] [0 1] [1] [0] []]
         (#'qp.pivot/powerset [0 1 2]))))

(deftest ^:parallel breakout-combinations-test
  (testing "Should return the combos that Paul specified in (#14329)"
    (is (= [[0 1 2]
            [0 1]
            [0]
            []]
           (#'qp.pivot/breakout-combinations 3 [0 1 2] [])))
    (is (= (sort-by
            (partial #'qp.pivot/group-bitmask 4)
            [;; primary data
             [0 1 2 3]
             ;; subtotal rows
             [0     3]
             [0 1   3]
             ;; row totals
             [0 1 2]
             ;; subtotal rows within "row totals"
             [0]
             [0 1]
             ;; "grand totals" row
             [      3]
             ;; bottom right corner
             []])
           (#'qp.pivot/breakout-combinations 4 [0 1 2] [3])))
    (testing "If pivot-rows and pivot-cols aren't specified, then just return the powerset"
      (is (= [[0 1 2]
              [  1 2]
              [0   2]
              [    2]
              [0 1]
              [  1]
              [0]
              []]
             (#'qp.pivot/breakout-combinations 3 [] []))))))

(deftest ^:parallel validate-pivot-rows-cols-test
  (testing "Should throw an Exception if you pass in invalid pivot-rows"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-rows: specified breakout at index 3, but we only have 3 breakouts"
         (#'qp.pivot/breakout-combinations 3 [0 1 2 3] []))))
  (testing "Should throw an Exception if you pass in invalid pivot-cols"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-cols: specified breakout at index 3, but we only have 3 breakouts"
         (#'qp.pivot/breakout-combinations 3 [] [0 1 2 3])))))
  ;; TODO -- we should require these columns to be distinct as well (I think?)
  ;; TODO -- require all numbers to be positive
  ;; TODO -- can you specify something in both pivot-rows and pivot-cols?


(defn- test-query []
  (mt/dataset test-data
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
                                     [:time-interval $created_at (- 2019 (.getYear (time/now))) :year {}]]}
       :pivot-rows [0 1 2]
       :pivot-cols []})))

(deftest ^:parallel allow-snake-case-test
  (testing "make sure the stuff works with either normal lisp-case keys or snake_case"
    (is (= (mt/rows (qp.pivot/run-pivot-query (test-query)))
           (mt/rows (qp.pivot/run-pivot-query (set/rename-keys (test-query)
                                                               {:pivot-rows :pivot_rows, :pivot-cols :pivot_cols})))))))

(deftest ^:parallel generate-queries-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset test-data
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
                actual   (map (fn [actual-val] (dissoc actual-val :database))
                              (#'qp.pivot/generate-queries request {:pivot-rows [1 0] :pivot-cols [2]}))]
            (is (= 6 (count actual)))
            (is (= expected actual))))))))

(deftest ^:parallel pivot-options-test
  (testing "`pivot-options` correctly generates pivot-rows and pivot-cols from a card's viz settings"
    (let [query         (api.pivots/pivot-query false)
          viz-settings  (:visualization_settings (api.pivots/pivot-card))
          pivot-options {:pivot-rows [1 0], :pivot-cols [2]}]
      (is (= pivot-options
             (#'qp.pivot/pivot-options query viz-settings)))
      (are [num-breakouts expected] (= expected
                                       (#'qp.pivot/breakout-combinations
                                        num-breakouts
                                        (:pivot-rows pivot-options)
                                        (:pivot-cols pivot-options)))
        3 [[0 1 2]   [1 2] [2] [1 0] [1] []]
        4 [[0 1 2 3] [1 2] [2] [1 0] [1] []]))))

(deftest ^:parallel ignore-bad-pivot-options-test
  (mt/dataset test-data
    (let [query         (mt/mbql-query products
                          {:breakout    [$category
                                         [:field
                                          (mt/id :products :created_at)
                                          {:base-type :type/DateTime, :temporal-unit :month}]]
                           :aggregation [[:count]]})
          viz-settings  (select-keys
                         (mt/query products
                           {:pivot_table.column_split
                            {:rows    [$id]
                             :columns [[:field "RATING" {:base-type :type/Integer}]]}})
                         [:pivot_table.column_split])
          pivot-options (#'qp.pivot/pivot-options query viz-settings)]
      (is (= {:pivot-rows [], :pivot-cols []}
             pivot-options))
      (is (= [[0 1] [1] [0] []]
             (#'qp.pivot/breakout-combinations 2 (:pivot-rows pivot-options) (:pivot-cols pivot-options)))))))

(deftest ^:parallel nested-question-pivot-options-test
  (testing "#35025"
    (mt/dataset test-data
      (doseq [[message query] {"Query (incorrectly) uses :field ID refs in second stage"
                               (mt/mbql-query products
                                 {:source-query {:source-table $$products}
                                  :aggregation  [[:count]]
                                  :breakout     [$category !month.created_at]})

                               "Query uses nominal :field literal refs in second stage"
                               (mt/mbql-query products
                                 {:source-query {:source-table $$products}
                                  :aggregation  [[:count]]
                                  :breakout     [*category !month.*CREATED_AT/DateTime]})}]
        (testing message
          (testing "Sanity check: query should work in non-pivot mode"
            (is (=? {:status :completed}
                    (qp/process-query query))))
          (let [viz-settings  (mt/$ids products
                                {:pivot_table.column_split
                                 {:rows    [$category]
                                  :columns [$created_at]}})
                pivot-options (#'qp.pivot/pivot-options query viz-settings)]
            (is (= {:pivot-rows [0], :pivot-cols [1]}
                   pivot-options))
            (is (= [[0 1] [1] [0] []]
                   (#'qp.pivot/breakout-combinations 2 (:pivot-rows pivot-options) (:pivot-cols pivot-options))))
            (is (=? {:status    :completed
                     :row_count 156}
                    (qp.pivot/run-pivot-query query {:visualization-settings viz-settings})))))))))

(deftest ^:parallel dont-return-too-many-rows-test
  (testing "Make sure pivot queries don't return too many rows (#14329)"
    (let [results (qp.pivot/run-pivot-query (test-query))
          rows    (mt/rows results)]
      (is (= ["Product → Category"
              "User → Source"
              "Created At"
              "pivot-grouping"
              "Count"]
             (map :display_name (mt/cols results))))
      (is (apply distinct? rows))
      (is (= [["Doohickey" "Facebook" "2019-01-01T00:00:00Z" 0  263]
              ["Doohickey" "Facebook" "2020-01-01T00:00:00Z" 0  89]
              ["Doohickey" "Google"   "2019-01-01T00:00:00Z" 0  276]
              ["Doohickey" "Google"   "2020-01-01T00:00:00Z" 0  100]
              ["Gizmo"     "Facebook" "2019-01-01T00:00:00Z" 0  361]
              ["Gizmo"     "Facebook" "2020-01-01T00:00:00Z" 0  113]
              ["Gizmo"     "Google"   "2019-01-01T00:00:00Z" 0  325]
              ["Gizmo"     "Google"   "2020-01-01T00:00:00Z" 0  101]
              ["Doohickey" "Facebook" nil                    4  352]
              ["Doohickey" "Google"   nil                    4  376]
              ["Gizmo"     "Facebook" nil                    4  474]
              ["Gizmo"     "Google"   nil                    4  426]
              ["Doohickey" nil        nil                    6  728]
              ["Gizmo"     nil        nil                    6  900]
              [nil         nil        nil                    7  1628]]
             rows)))))

(defn- distinct-values [table col]
  (->> (mt/rows
         (mt/dataset test-data
           (qp/process-query
            {:database (mt/id)
             :type     :query
             :query    {:source-table (mt/id table)
                        :breakout     [[:field (mt/id table col) nil]]}})))
       (map first)
       set))

(deftest ^:parallel return-correct-columns-test
  (let [results (qp.pivot/run-pivot-query (api.pivots/pivot-query))
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
      (let [Row [:cat
                 ;; state
                 [:maybe (into [:enum] (distinct-values :people :state))]
                 ;; source
                 [:maybe (into [:enum] (distinct-values :people :source))]
                 ;; category
                 [:maybe (into [:enum] (distinct-values :products :category))]
                 ;; pivot group bitmask
                 [:enum 0 1 3 4 5 7]
                 ;; count
                 :int
                 ;; sum
                 :int]]
        (is (malli= [:sequential {:min 1} Row]
                    rows))))))

(deftest ^:parallel allow-other-rfs-test
  (letfn [(rff [_]
            (fn
              ([] 0)
              ([acc] acc)
              ([acc _] (inc acc))))]
    (is (= (count (mt/rows (qp.pivot/run-pivot-query (api.pivots/pivot-query))))
           (qp.pivot/run-pivot-query (api.pivots/pivot-query) nil rff nil)))))

(deftest ^:parallel parameters-query-test
  (mt/dataset test-data
    (is (=? {:status    :completed
             :row_count 137}
            (qp.pivot/run-pivot-query (api.pivots/parameters-query))))))

(deftest ^:parallel pivots-should-not-return-expressions-test
  (mt/dataset test-data
    (let [query (assoc (mt/mbql-query orders
                         {:aggregation [[:count]]
                          :breakout    [$user_id->people.source $product_id->products.category]})
                       :pivot-rows [0]
                       :pivot-cols [1])]
      (testing (str "Pivots should not return expression columns in the results if they are not explicitly included in "
                    "`:fields` (#14604)")
        (is (= (-> (qp.pivot/run-pivot-query query)
                   (m/dissoc-in [:data :results_metadata :checksum])
                   (m/dissoc-in [:data :native_form]))
               (-> (qp.pivot/run-pivot-query (assoc-in query [:query :expressions] {"Don't include me pls" [:+ 1 1]}))
                   (m/dissoc-in [:data :results_metadata :checksum])
                   (m/dissoc-in [:data :native_form]))))))))

(deftest ^:parallel pivots-should-not-return-expressions-test-2
  (mt/dataset test-data
    (let [query (assoc (mt/mbql-query orders
                         {:aggregation [[:count]]
                          :breakout    [$user_id->people.source $product_id->products.category]})
                       :pivot-rows [0]
                       :pivot-cols [1])]
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
                     (qp.pivot/run-pivot-query (-> query
                                                   (assoc-in [:query :fields] [[:expression "test-expr"]])
                                                   (assoc-in [:query :expressions] {:test-expr [:ltrim "wheeee"]})))))))))))

(deftest ^:parallel pivots-should-not-return-expressions-test-3
  (mt/dataset test-data
    (testing "We should still be able to use expressions inside the aggregations"
      (is (=? {:status   :completed}
              (qp.pivot/run-pivot-query
               (mt/mbql-query orders
                 {:expressions {"Product Rating + 1" [:+ $product_id->products.rating 1]}
                  :aggregation [[:count]]
                  :breakout    [$user_id->people.source [:expression "Product Rating + 1"]]})))))))

(deftest pivot-query-should-work-without-data-permissions-test
  (testing "Pivot queries should work if the current user only has permissions to view the Card -- no data perms (#14989)"
    (mt/dataset test-data
      (mt/with-temp-copy-of-db
        (let [query (mt/mbql-query orders
                      {:aggregation [[:count]]
                       :breakout    [$product_id->products.category $user_id->people.source]})]
          (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
          (testing "User without perms shouldn't be able to run the query normally"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"You do not have permissions to run this query"
                 (mt/with-test-user :rasta
                   (qp/process-query query)))))
          (testing "Should be able to run the query via a Card that All Users has perms for"
            ;; now save it as a Card in a Collection in Root Collection; All Users should be able to run because the
            ;; Collection inherits Root Collection perms when created
            (mt/with-temp [Collection collection {}
                           Card       card {:collection_id (u/the-id collection), :dataset_query query}]
              (is (=? {:status "completed"}
                      (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))))
              (testing "... with the pivot-table endpoints"
                (let [result (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))]
                  (is (=? {:status "completed"}
                          result))
                  (is (= (mt/rows (qp.pivot/run-pivot-query query))
                         (mt/rows result))))))))))))

(deftest ^:parallel pivot-with-order-by-test
  (testing "Pivot queries should work if there is an `:order-by` clause (#17198)"
    (mt/dataset test-data
      (let [query (mt/mbql-query products
                    {:breakout    [$category]
                     :aggregation [[:count]]
                     :order-by    [[:asc $category]]})]
        (is (= [["Doohickey" 0 42]
                ["Gadget" 0 53]
                ["Gizmo" 0 51]
                ["Widget" 0 54]
                [nil 1 200]]
               (mt/rows
                (qp.pivot/run-pivot-query query))))))))

(deftest ^:parallel pivot-with-order-by-metric-test
  (testing "Pivot queries should allow ordering by aggregation (#22872)"
    (mt/dataset test-data
      (let  [query (mt/mbql-query reviews
                     {:breakout [$rating [:field (mt/id :reviews :created_at) {:temporal-unit :year}]]
                      :aggregation [[:count]]
                      :order-by [[:asc [:aggregation 0 nil]]]
                      :filter [:between $created_at "2019-01-01" "2021-01-01"]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 "2020-01-01T00:00:00Z" 0 5]
                  [2 "2020-01-01T00:00:00Z" 0 13]
                  [3 "2020-01-01T00:00:00Z" 0 14]
                  [1 "2019-01-01T00:00:00Z" 0 15]
                  [3 "2019-01-01T00:00:00Z" 0 29]
                  [2 "2019-01-01T00:00:00Z" 0 35]
                  [5 "2020-01-01T00:00:00Z" 0 45]
                  [4 "2020-01-01T00:00:00Z" 0 78]
                  [5 "2019-01-01T00:00:00Z" 0 137]
                  [4 "2019-01-01T00:00:00Z" 0 236]
                  [nil "2020-01-01T00:00:00Z" 1 155]
                  [nil "2019-01-01T00:00:00Z" 1 452]
                  [1 nil 2 20]
                  [3 nil 2 43]
                  [2 nil 2 48]
                  [5 nil 2 182]
                  [4 nil 2 314]
                  [nil nil 3 607]]
                 (mt/rows
                   (qp.pivot/run-pivot-query query)))))))))
