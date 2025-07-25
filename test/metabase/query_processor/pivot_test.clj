(ns ^:mb/driver-tests metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require
   [clj-time.core :as time]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.pivot.test-util :as qp.pivot.test-util]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel group-bitmask-test
  (doseq [[indices expected] {[0]     6
                              [0 1]   4
                              [0 1 2] 0
                              []      7}]
    (is (= expected
           (#'qp.pivot/group-bitmask 3 indices))))

  (testing "Should work for more than 31 breakouts"
    (is (= 4294967295 (#'qp.pivot/group-bitmask 32 [])))))

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
           (#'qp.pivot/breakout-combinations 3 [0 1 2] [] true true)))))

(deftest ^:parallel breakout-combinations-test-2
  (testing "Should return the combos that Paul specified in (#14329)"
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
             [3]
             ;; bottom right corner
             []])
           (#'qp.pivot/breakout-combinations 4 [0 1 2] [3] true true)))))

(deftest ^:parallel breakout-combinations-test-3
  (testing "Should return the combos that Paul specified in (#14329)"
    (testing "If pivot-rows and pivot-cols aren't specified, then just return the powerset"
      (is (= [[0 1 2]
              [1 2]
              [0   2]
              [2]
              [0 1]
              [1]
              [0]
              []]
             (#'qp.pivot/breakout-combinations 3 [] [] true true))))))

(deftest ^:parallel breakout-combinations-test-row-totals-disabled
  (testing "Should return the correct combos when row totals are disabled but column totals are enabled"
    (is (= [[0 1] [0]]
           (#'qp.pivot/breakout-combinations 2 [1] [0] false true)))))

(deftest ^:parallel breakout-combinations-test-col-totals-disabled
  (testing "Should return the correct combos when column totals are disabled but row totals are enabled"
    (is (= [[0 1] [1]]
           (#'qp.pivot/breakout-combinations 2 [1] [0] true false)))))

(deftest ^:parallel breakout-combinations-test-row-col-totals-disabled
  (testing "Should return only the main query when both row and column totals are disabled"
    (is (= [[0 1]]
           (#'qp.pivot/breakout-combinations 2 [1] [0] false false)))))

(deftest ^:parallel breakout-combinations-test-4
  (testing "The breakouts are sorted ascending."
    (is (= [[0 1 2] [1 2] [2] [0 1] [1] []]
           (#'qp.pivot/breakout-combinations 3 [1 0] [2] true true)))))

(deftest ^:parallel validate-pivot-rows-cols-test
  (testing "Should throw an Exception if you pass in invalid pivot-rows"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-rows: specified breakout at index 3, but we only have 3 breakouts"
         (#'qp.pivot/breakout-combinations 3 [0 1 2 3] [] true true))))
  (testing "Should throw an Exception if you pass in invalid pivot-cols"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid pivot-cols: specified breakout at index 3, but we only have 3 breakouts"
         (#'qp.pivot/breakout-combinations 3 [] [0 1 2 3] true true)))))
  ;; TODO -- we should require these columns to be distinct as well (I think?)
  ;; TODO -- require all numbers to be positive
  ;; TODO -- can you specify something in both pivot-rows and pivot-cols?

(defn- test-query []
  (mt/dataset test-data
    (merge (mt/mbql-query orders
             {:aggregation  [[:count]]
              :breakout     [$product_id->products.category
                             $user_id->people.source
                             !year.created_at]
              :filter       [:and
                             [:= $user_id->people.source "Facebook" "Google"]
                             [:= $product_id->products.category "Doohickey" "Gizmo"]
                             [:time-interval $created_at (- 2019 (.getYear (time/now))) :year {}]]})
           {:pivot-rows [0 1 2]
            :pivot-cols []})))

(deftest ^:parallel allow-snake-case-test
  (testing "make sure the stuff works with either normal lisp-case keys or snake_case"
    (is (= (mt/rows (qp.pivot/run-pivot-query (test-query)))
           (mt/rows (qp.pivot/run-pivot-query (set/rename-keys (test-query)
                                                               {:pivot-rows :pivot_rows, :pivot-cols :pivot_cols})))))))

(deftest ^:parallel generate-queries-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          query             (lib/query
                             metadata-provider
                             {:database   (mt/id)
                              :query      {:source-table (mt/$ids $$orders)
                                           :aggregation  [[:count] [:sum (mt/$ids $orders.quantity)]]
                                           :breakout     [(mt/$ids $orders.user_id->people.state)
                                                          (mt/$ids $orders.user_id->people.source)
                                                          (mt/$ids $orders.product_id->products.category)]}
                              :type       :query
                              :parameters []
                              :pivot-rows [1 0]
                              :pivot-cols [2]})]
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
                          {:query {:breakout    [$orders.user_id->people.state
                                                 $orders.user_id->people.source
                                                 [:expression "pivot-grouping"]]
                                   :expressions {:pivot-grouping [:abs 4]}}}
                          {:query {:breakout    [$orders.user_id->people.source
                                                 [:expression "pivot-grouping"]]
                                   :expressions {:pivot-grouping [:abs 5]}}}
                          {:query {:breakout    [[:expression "pivot-grouping"]]
                                   :expressions {:pivot-grouping [:abs 7]}}}])
              expected (for [query expected]
                         (-> query
                             (assoc :database (mt/id)
                                    :type       :query
                                    :parameters []
                                    :pivot-rows [1 0]
                                    :pivot-cols [2])
                             (assoc-in [:query :aggregation] [[:count] [:sum (mt/$ids $orders.quantity)]])
                             (assoc-in [:query :source-table] (mt/$ids $$orders))))
              expected (for [query expected]
                         (lib/query metadata-provider query))
              expected (walk/postwalk
                        (fn [x]
                          (cond-> x
                            (and (map? x) (:lib/uuid x)) (assoc :lib/uuid string?)))
                        expected)
              actual   (#'qp.pivot/generate-queries query {:pivot-rows [1 0] :pivot-cols [2]})]
          (is (= 6 (count actual)))
          (doseq [i (range 6)]
            (testing (format "Query #%d" i)
              (is (=? (nth expected i)
                      (nth actual i))))))))))

(deftest ^:parallel pivot-options-test
  (testing "`pivot-options` correctly generates pivot-rows and pivot-cols from a card's viz settings"
    (let [query         (qp.pivot.test-util/pivot-query false)
          viz-settings  (:visualization_settings (qp.pivot.test-util/pivot-card))
          pivot-options {:pivot-rows [1 0], :pivot-cols [2] :pivot-measures nil :column-sort-order {}}]
      (let [actual-pivot-options (#'qp.pivot/pivot-options query viz-settings)]
        (is (= (assoc pivot-options :show-row-totals true :show-column-totals true)
               actual-pivot-options)))
      (are [num-breakouts expected] (= expected
                                       (#'qp.pivot/breakout-combinations
                                        num-breakouts
                                        (:pivot-rows pivot-options)
                                        (:pivot-cols pivot-options)
                                        true
                                        true))
        3 [[0 1 2]   [1 2] [2] [0 1] [1] []]
        4 [[0 1 2 3] [1 2] [2] [0 1] [1] []]))))

(deftest ^:parallel ignore-bad-pivot-options-test
  (mt/dataset test-data
    (let [query         (mt/mbql-query products
                          {:breakout    [$category
                                         [:field
                                          (mt/id :products :created_at)
                                          {:base-type :type/DateTime, :temporal-unit :month}]]
                           :aggregation [[:count]]})
          viz-settings  {:pivot_table.column_split
                         {:rows    ["ID"]
                          :columns ["RATING"]}}
          pivot-options (#'qp.pivot/pivot-options query viz-settings)]
      (is (= {:pivot-rows [], :pivot-cols [] :pivot-measures nil :column-sort-order {},
              :show-row-totals true, :show-column-totals true}
             pivot-options))
      (is (= [[0 1] [1] [0] []]
             (#'qp.pivot/breakout-combinations 2
                                               (:pivot-rows pivot-options)
                                               (:pivot-cols pivot-options)
                                               (:show-row-totals pivot-options)
                                               (:show-column-totals pivot-options)))))))

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
          (let [viz-settings  {:pivot_table.column_split
                               {:rows    ["CATEGORY"]
                                :columns ["CREATED_AT"]}}
                pivot-options (#'qp.pivot/pivot-options query viz-settings)]
            (is (= {:pivot-rows [0], :pivot-cols [1] :pivot-measures nil :column-sort-order {},
                    :show-row-totals true, :show-column-totals true}
                   pivot-options))
            (is (= [[0 1] [1] [0] []]
                   (#'qp.pivot/breakout-combinations 2
                                                     (:pivot-rows pivot-options)
                                                     (:pivot-cols pivot-options)
                                                     (:show-row-totals pivot-options)
                                                     (:show-column-totals pivot-options))))
            (is (=? {:status    :completed
                     :row_count 156
                     :data {:cols [{:lib/desired-column-alias "CATEGORY"}
                                   {:lib/desired-column-alias "CREATED_AT"}
                                   {:lib/desired-column-alias "pivot-grouping"}
                                   {:lib/desired-column-alias "count"}]}}
                    (qp.pivot/run-pivot-query (assoc query :info {:visualization-settings viz-settings}))))))))))

(deftest ^:parallel nested-question-pivot-aggregation-names-test
  (testing "#43993"
    (mt/dataset
      test-data
      (testing "Column aliasing needs to work even with joins and across stages"
        (let [query        (mt/mbql-query
                             orders {:source-query {:source-table $$orders
                                                    :joins        [{:source-table $$people
                                                                    :alias        "People - User"
                                                                    :condition
                                                                    [:= $orders.user_id
                                                                     [:field %people.id {:join-alias "People - User"}]]}]
                                                    :aggregation  [[:sum $subtotal]]
                                                    :breakout     [!month.created_at
                                                                   [:field %people.id {:join-alias "People - User"}]]}
                                     :aggregation  [[:sum [:field "sum" {:base-type :type/Number}]]]
                                     :breakout     [[:field "ID" {:base-type :type/Number}]]})
              viz-settings {:pivot_table.column_split
                            {:columns ["ID"]}}]
          (testing "for a regular query"
            (is (=? {:status :completed}
                    (qp/process-query query))))
          (testing "and a pivot query"
            (is (=? {:status    :completed
                     :row_count 1747}
                    (-> query
                        (assoc :info {:visualization-settings viz-settings})
                        qp.pivot/run-pivot-query)))))))))

(deftest model-with-aggregations-nested-pivot-aggregation-names-test
  (testing "#43993"
    (let [model (mt/mbql-query orders
                  {:source-table $$orders
                   :joins        [{:source-table $$people
                                   :alias        "People - User"
                                   :condition
                                   [:= $orders.user_id
                                    [:field %people.id {:join-alias "People - User"}]]}]
                   :aggregation  [[:sum $subtotal]]
                   :breakout     [!month.created_at
                                  [:field %people.id {:join-alias "People - User"}]]})]
      (mt/with-temp [:model/Card card {:dataset_query model, :type :model}]
        (testing "Column aliasing needs to work even with aggregations over a model"
          (let [query        (mt/mbql-query
                               orders {:source-table (str "card__" (u/the-id card))
                                       :aggregation  [[:sum [:field "sum" {:base-type :type/Number}]]]
                                       :breakout     [[:field "ID" {:base-type :type/Number}]]})
                viz-settings {:pivot_table.column_split
                              {:columns ["ID"]}}]
            (testing "for a regular query"
              (is (=? {:status :completed}
                      (qp/process-query query))))
            (testing "and a pivot query"
              (is (=? {:status    :completed
                       :row_count 1747}
                      (-> query
                          (assoc :info {:visualization-settings viz-settings})
                          qp.pivot/run-pivot-query))))))))))

(deftest nested-models-with-expressions-pivot-breakout-names-test
  (testing "#43993 again - breakouts on an expression from the inner model should pass"
    (mt/with-temp [:model/Card model1 {:type :model
                                       :dataset_query
                                       (mt/mbql-query products
                                         {:source-table $$products
                                          :expressions  {"Rating Bucket" [:floor $products.rating]}})}
                   :model/Card model2 {:type :model
                                       :dataset_query
                                       (mt/mbql-query orders
                                         {:source-table $$orders
                                          :joins        [{:source-table (str "card__" (u/the-id model1))
                                                          :alias        "model A - Product"
                                                          :fields       :all
                                                          :condition    [:= $orders.product_id
                                                                         [:field %products.id
                                                                          {:join-alias "model A - Product"}]]}]})}]
      (testing "Column aliasing works when joining an expression in an inner model"
        (let [query        (mt/mbql-query
                             orders {:source-table (str "card__" (u/the-id model2))
                                     :aggregation  [[:sum [:field "SUBTOTAL" {:base-type :type/Number}]]]
                                     :breakout     [[:field "Rating Bucket" {:base-type  :type/Number
                                                                             :join-alias "model A - Product"}]]})
              viz-settings {:pivot_table.column_split
                            {:columns ["Rating Bucket"]}}]
          (testing "for a regular query"
            (is (=? {:status :completed}
                    (qp/process-query query))))
          (testing "and a pivot query"
            (is (=? {:status    :completed
                     :row_count 6}
                    (-> query
                        (assoc :info {:visualization-settings viz-settings})
                        qp.pivot/run-pivot-query)))))))))

(deftest ^:parallel dont-return-too-many-rows-test
  (testing "Make sure pivot queries don't return too many rows (#14329)"
    (let [results (qp.pivot/run-pivot-query (test-query))
          rows    (mt/rows results)]
      (is (= ["Product → Category"
              "User → Source"
              "Created At: Year"
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
           (mt/mbql-query nil
             {:source-table (mt/id table)
              :breakout     [[:field (mt/id table col) nil]]}))))
       (map first)
       set))

(deftest ^:parallel return-correct-columns-test
  (let [results (qp.pivot/run-pivot-query (qp.pivot.test-util/pivot-query))
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
        (is (pos? (count rows)))
        ;; check each row, but fail fast if the shapes are wrong.
        (is (=? {:status :success}
                (reduce
                 (let [validator (mr/validator Row)]
                   (fn [_ row]
                     (testing (pr-str row)
                       (if (validator row)
                         {:status :success}
                         (reduced {:status :fail, :bad-row row})))))
                 nil
                 rows))
            "all rows match the Row schema above")))))

(deftest ^:parallel allow-other-rfs-test
  (letfn [(rff [_]
            (fn
              ([] 0)
              ([acc] acc)
              ([acc _] (inc acc))))]
    (is (= (count (mt/rows (qp.pivot/run-pivot-query (qp.pivot.test-util/pivot-query))))
           (qp.pivot/run-pivot-query (qp.pivot.test-util/pivot-query) rff)))))

(deftest ^:parallel parameters-query-test
  (mt/dataset test-data
    (is (=? {:status    :completed
             :row_count 137}
            (qp.pivot/run-pivot-query (qp.pivot.test-util/parameters-query))))))

(defn- clean-pivot-results [results]
  (let [no-uuid #(dissoc % :lib/source_uuid)]
    (-> results
        (dissoc :running_time :started_at :json_query)
        (m/dissoc-in [:data :results_metadata :checksum])
        (m/dissoc-in [:data :native_form])
        (update-in [:data :cols] #(mapv no-uuid %)))))

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
                   clean-pivot-results)
               (-> (qp.pivot/run-pivot-query (assoc-in query [:query :expressions] {"Don't include me pls" [:+ 1 1]}))
                   clean-pivot-results)))))))

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
        (let [results (qp.pivot/run-pivot-query (-> query
                                                    (assoc-in [:query :fields] [[:expression "test-expr"]])
                                                    (assoc-in [:query :expressions] {:test-expr [:ltrim "wheeee"]})))]
          (is (= ["User → Source"
                  "Product → Category"
                  "pivot-grouping"
                  "Count"
                  "test-expr"]
                 (map :display_name (mt/cols results))))
          (testing "expression value should get returned"
            (is (= ["Affiliate" "Doohickey" 0 783 "wheeee"]
                   (mt/first-row results)))))))))

(deftest ^:parallel pivots-should-not-return-expressions-test-3
  (mt/dataset test-data
    (testing "We should still be able to use expressions inside the aggregations"
      (is (=? {:status :completed}
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
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-table-permission! (perms-group/all-users) (data/id :orders) :perms/create-queries :no)
            (data-perms/set-database-permission! (perms-group/all-users) (data/id) :perms/view-data :unrestricted)
            (testing "User without perms shouldn't be able to run the query normally"
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"You do not have permissions to run this query"
                   (mt/with-test-user :rasta
                     (qp/process-query query)))))
            (testing "Should be able to run the query via a Card that All Users has perms for"
              ;; now save it as a Card in a Collection in Root Collection; All Users should be able to run because the
              ;; Collection inherits Root Collection perms when created
              (mt/with-temp [:model/Collection collection {}
                             :model/Card       card {:collection_id (u/the-id collection), :dataset_query query}]
                (is (=? {:status "completed"}
                        (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))))
                (testing "... with the pivot-table endpoints"
                  (let [result (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))]
                    (is (=? {:status "completed"}
                            result))
                    (is (= [["Doohickey" "Affiliate" 0 783]
                            ["Doohickey" "Facebook" 0 816]
                            ["Doohickey" "Google" 0 844]
                            ["Doohickey" "Organic" 0 738]
                            ["Doohickey" "Twitter" 0 795]
                            ["Gadget" "Affiliate" 0 899]
                            ["Gadget" "Facebook" 0 1041]
                            ["Gadget" "Google" 0 971]
                            ["Gadget" "Organic" 0 1038]
                            ["Gadget" "Twitter" 0 990]
                            ["Gizmo" "Affiliate" 0 876]
                            ["Gizmo" "Facebook" 0 994]
                            ["Gizmo" "Google" 0 956]
                            ["Gizmo" "Organic" 0 972]
                            ["Gizmo" "Twitter" 0 986]
                            ["Widget" "Affiliate" 0 962]
                            ["Widget" "Facebook" 0 1055]
                            ["Widget" "Google" 0 1027]
                            ["Widget" "Organic" 0 1016]
                            ["Widget" "Twitter" 0 1001]
                            [nil "Affiliate" 1 3520]
                            [nil "Facebook" 1 3906]
                            [nil "Google" 1 3798]
                            [nil "Organic" 1 3764]
                            [nil "Twitter" 1 3772]
                            ["Doohickey" nil 2 3976]
                            ["Gadget" nil 2 4939]
                            ["Gizmo" nil 2 4784]
                            ["Widget" nil 2 5061]
                            [nil nil 3 18760]]
                           (mt/rows (qp.pivot/run-pivot-query query))
                           (mt/rows result)))))))))))))

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

(def ^:private order-by-aggregation-expected-results
  ;; breakout 0: rating
  ;; breakout 1: year(created-at)
  ;;
  ;; rating, year(created-at), pivot-grouping, count
  [;; query 1 [0 1]: breakout on rating, year(created-at), pivot-grouping
   [1 "2020-01-01T00:00:00Z" 0 5]
   [2 "2020-01-01T00:00:00Z" 0 13]
   [3 "2020-01-01T00:00:00Z" 0 14]
   [1 "2019-01-01T00:00:00Z" 0 15]
   [3 "2019-01-01T00:00:00Z" 0 29]
   [2 "2019-01-01T00:00:00Z" 0 35]
   [5 "2020-01-01T00:00:00Z" 0 45]
   [4 "2020-01-01T00:00:00Z" 0 78]
   [5 "2019-01-01T00:00:00Z" 0 137]
   [4 "2019-01-01T00:00:00Z" 0 236]
   ;; query 2 [1]: breakout on year(created-at), pivot-grouping
   [nil "2020-01-01T00:00:00Z" 1 155]
   [nil "2019-01-01T00:00:00Z" 1 452]
   ;; query 3 [0]: breakout on rating, pivot grouping
   [1 nil 2 20]
   [3 nil 2 43]
   [2 nil 2 48]
   [5 nil 2 182]
   [4 nil 2 314]
   ;; query 4 []: breakout on pivot grouping
   [nil nil 3 607]])

(deftest ^:parallel pivot-with-order-by-aggregation-test
  (testing "Pivot queries should allow ordering by aggregation (#22872)"
    (mt/dataset test-data
      (let  [query (mt/mbql-query reviews
                     {:breakout    [$rating [:field (mt/id :reviews :created_at) {:temporal-unit :year}]]
                      :aggregation [[:count]]
                      :order-by    [[:asc [:aggregation 0 nil]]]
                      :filter      [:between $created_at "2019-01-01" "2021-01-01"]})]
        (mt/with-native-query-testing-context query
          (let [results (qp.pivot/run-pivot-query query)]
            (is (= ["Rating" "Created At: Year" "pivot-grouping" "Count"]
                   (map :display_name (mt/cols results))))
            (is (= order-by-aggregation-expected-results
                   (mt/rows results)))))))))

(deftest ^:parallel mlv2-query-test
  (testing "Should be able to run a pivot query for an MLv2 query (#39024)"
    ;; this is literally the same query as [[pivot-with-order-by-aggregation-test]], just in MLv2, so it should return
    ;; the same exact results.
    (let [metadata-provider  (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          reviews            (lib.metadata/table metadata-provider (mt/id :reviews))
          reviews-rating     (lib.metadata/field metadata-provider (mt/id :reviews :rating))
          reviews-created-at (lib.metadata/field metadata-provider (mt/id :reviews :created_at))
          query              (as-> (lib/query metadata-provider reviews) query
                               (lib/breakout query reviews-rating)
                               (lib/breakout query (lib/with-temporal-bucket reviews-created-at :year))
                               (lib/aggregate query (lib/count))
                               (lib/order-by query (lib/aggregation-ref query 0))
                               (lib/filter query (lib/between reviews-created-at "2019-01-01" "2021-01-01")))]
      (mt/with-native-query-testing-context query
        (is (= order-by-aggregation-expected-results
               (mt/rows
                (qp.pivot/run-pivot-query query))))))))

(deftest ^:parallel fe-friendly-legacy-field-refs-test
  (testing "field_refs in the result metadata should match the 'traditional' legacy shape the FE expects, or it will break"
    ;; `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` will break if the `field_ref`s don't come
    ;; back in this EXACT shape =(, see [[metabase.query-processor.middleware.annotate/fe-friendly-legacy-ref]]
    (let [query (merge
                 (mt/mbql-query orders
                   {:aggregation  [[:count]]
                    :breakout     [!year.created_at
                                   $product_id->products.category
                                   $user_id->people.source]
                    :limit        1})
                 {:pivot_rows [0 1 2]
                  :pivot_cols []})]
      (is (= (mt/$ids orders
               [[:field %created_at {:temporal-unit :year}]
                [:field %products.category {:source-field %product_id}]
                [:field %people.source {:source-field %user_id}]
                [:expression "pivot-grouping"]
                [:aggregation 0]])
             (mapv :field_ref (mt/cols (qp.pivot/run-pivot-query query))))))))

(deftest ^:parallel fe-friendly-legacy-field-refs-test-2
  (testing "field_refs in the result metadata should preserve :base-type if it was specified for some reason, otherwise FE will break"
    ;; `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` will break if the `field_ref`s don't come
    ;; back in this EXACT shape =(, see [[metabase.query-processor.middleware.annotate/fe-friendly-legacy-ref]]
    (let [query (merge (mt/mbql-query orders
                         {:aggregation  [[:count]]
                          :breakout     [[:field
                                          (mt/id :products :category)
                                          {:source-field (mt/id :orders :product_id)
                                           :base-type    :type/Text}]
                                         [:field
                                          (mt/id :people :source)
                                          {:source-field (data/id :orders :user_id)
                                           :base-type    :type/Text}]]})
                       {:pivot_rows [0 1]
                        :pivot_cols []})]
      (is (= (mt/$ids orders
               [[:field %products.category {:source-field %product_id, :base-type :type/Text}]
                [:field %people.source {:source-field %user_id, :base-type :type/Text}]
                [:expression "pivot-grouping"]
                [:aggregation 0]])
             (mapv :field_ref (mt/cols (qp.pivot/run-pivot-query query))))))))

(deftest ^:parallel splice-in-remap-test
  (let [splice #'qp.pivot/splice-in-remap]
    (is (= []
           (splice [] {1 0, 4 3})))
    (is (= [0 1]
           (splice [0] {1 0, 4 3})))
    (is (= [2]
           (splice [1] {1 0, 4 3})))
    (is (= [0 1 2]
           (splice [0 1] {1 0, 4 3})))
    (is (= [0 1 3 4]
           (splice [0 2] {1 0, 4 3})))
    (testing "chained remapping"
      (is (= [1 2 3 5]
             (splice [1 2] {1 2, 2 5})))
      (is (= [1 2 3 4 5]
             (splice [1 2 3] {1 2, 2 5})))
      (is (= [1 2 3 5 6]
             (splice [1 2 4] {1 2, 2 5})))
      (is (= [1 2 3 5 7]
             (splice [1 2 5] {1 2, 2 5})))
      (is (= [1 2 3 5 8]
             (splice [1 2 6] {1 2, 2 5})))
      (is (= [1 2 3 5 8]
             (splice [1 2 6] {1 2, 2 5, 3 2}))))))

(deftest ^:parallel pivoting-same-name-breakouts-test
  (testing "Column names are deduplicated, therefore same `:name` cols are not missing from the results (#52769)"
    (let [mp meta/metadata-provider
          query (as-> (lib/query mp (meta/table-metadata :orders)) $
                  (lib/aggregate $ (lib/count))
                  (lib/breakout $ (meta/field-metadata :orders :id))
                  (lib/breakout $ (some (fn [{:keys [name lib/source] :as col}]
                                          (when (and (= name "ID") (= source :source/implicitly-joinable))
                                            col))
                                        (lib/breakoutable-columns $))))
          viz-settings {:column_settings {}
                        :pivot_table.column_split {:rows ["ID" "ID_2"], :columns [], :values ["count"]}
                        :pivot_table.collapsed_rows {:value [], :rows ["ID" "ID_2"]}
                        :pivot.show_row_totals true
                        :pivot.show_column_totals true
                        :pivot_table.column_widths {:leftHeaderWidths [80 99]
                                                    :totalLeftHeaderWidths 179
                                                    :valueHeaderWidths {}}
                        :table.column_formatting []
                        :table.columns nil}]
      ;; Without deduplication, :pivot-rows' value would be just [0].
      (is (= {:pivot-rows [0 1], :pivot-cols nil, :pivot-measures [2],
              :show-row-totals true, :show-column-totals true}
             (#'qp.pivot/column-name-pivot-options query viz-settings))))))
