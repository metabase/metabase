(ns metabase.query-processor.pivot-test
  "Tests for pivot table actions for the query processor"
  (:require
   [clj-time.core :as time]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.api.pivot-test-util :as api.pivot-test-util]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card Collection]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.pivot.impl.common :as qp.pivot.impl.common]
   [metabase.query-processor.pivot.impl.legacy :as qp.pivot.impl.legacy]
   [metabase.query-processor.pivot.impl.new :as qp.pivot.impl.new]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest ^:parallel pivot-options-test
  (testing "`pivot-options` correctly generates pivot-rows and pivot-cols from a card's viz settings"
    (let [viz-settings  (:visualization_settings (api.pivot-test-util/pivot-card))
          query         (-> (api.pivot-test-util/pivot-query false)
                            (assoc-in [:info :visualization-settings] viz-settings))]
      (is (= {:pivot-rows [1 0], :pivot-cols [2]}
             (#'qp.pivot/pivot-options query))))))

(deftest ^:parallel ignore-bad-pivot-options-test
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
        query         (assoc-in query [:info :visualization-settings] viz-settings)]
    (is (= {:pivot-rows [], :pivot-cols []}
           (#'qp.pivot/pivot-options query)))))

(defn- do-identical-results-between-impls-test [query]
  (let [query             (lib/query
                           (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                            query)
        pivot-options     (#'qp.pivot/pivot-options query)
        num-breakouts     (count (lib/breakouts query))
        pivot-rows        (:pivot-rows pivot-options)
        pivot-cols        (:pivot-cols pivot-options)
        breakout-combos   (qp.pivot.impl.common/breakout-combinations num-breakouts pivot-rows pivot-cols)
        bitmasks          (mapv (partial qp.pivot.impl.common/group-bitmask num-breakouts) breakout-combos)
        legacy-subqueries (#'qp.pivot.impl.legacy/generate-queries query pivot-options)
        new-subqueries    (#'qp.pivot.impl.new/generate-queries query pivot-options)
        legacy-result     (binding [qp.pivot/*impl-override* :qp.pivot.impl/legacy]
                            (qp.pivot/run-pivot-query query))
        legacy-rows       (mt/rows legacy-result)
        new-result        (binding [qp.pivot/*impl-override* :qp.pivot.impl/new]
                            (qp.pivot/run-pivot-query query))
        new-rows          (mt/rows new-result)
        ;; bitmask column always added after the existing breakouts
        bitmask-index     num-breakouts]
    (testing (format "options = %s\n" (pr-str pivot-options))
      (testing "should generate identical number of queries"
        (is (= (count legacy-subqueries)
               (count new-subqueries))))
      (testing "should return identical columns"
        (is (= (mapv :name (get-in legacy-result [:data :cols]))
               (mapv :name (get-in new-result [:data :cols])))))
      (testing "legacy rows and new rows should have same set of group bitmasks. Rows should be ordered by bitmask\n"
        (letfn [(group-bitmasks [rows]
                  (into []
                        (comp (map #(nth % bitmask-index))
                              (m/dedupe-by identity))
                        rows))]
          (testing "legacy impl"
            (is (= bitmasks
                   (group-bitmasks legacy-rows))))
          (testing "new impl"
            (is (= bitmasks
                   (group-bitmasks new-rows))))))
      (doseq [i    (range (count legacy-subqueries))
              :let [breakout-combo       (nth breakout-combos i)
                    bitmask              (nth bitmasks i)
                    group-row?           (fn [row]
                                           (= (nth row bitmask-index) bitmask))
                    legacy-subquery-rows (filterv group-row? legacy-rows)
                    new-subquery-rows    (filterv group-row? new-rows)]]
        (testing (format "\nSubquery #%d\nBreakout combinations = %s\nBitmask = %s\n" i breakout-combo bitmask)
          (testing "\n++++ LEGACY SUBQUERY ++++\n"
            (mt/with-native-query-testing-context (nth legacy-subqueries i)
              (testing "\n++++ NEW SUBQUERY ++++\n"
                (mt/with-native-query-testing-context (nth new-subqueries i)
                  (testing "Should return the same number of rows"
                    (is (= (count legacy-subquery-rows)
                           (count new-subquery-rows))))
                  (testing "Should return identical rows"
                    (is (= legacy-subquery-rows
                           new-subquery-rows))))))))))))

(defn- identical-results-between-impls-test-drivers []
  (->> (api.pivot-test-util/applicable-drivers)
       ;; only test drivers using the new implementation by default
       (filter (fn [driver]
                 (= (#'qp.pivot/impl driver) :qp.pivot.impl/new)))))

;;; same test as below, but this query does not include `:pivot-rows` and `:pivot-cols` options
(deftest ^:parallel identical-results-between-impls-no-options-test
  (testing "legacy and new impls should return identical results for the different subqueries"
    (mt/test-drivers (identical-results-between-impls-test-drivers)
      (do-identical-results-between-impls-test (api.pivot-test-util/pivot-query #_include-options false)))))

(deftest ^:parallel identical-results-between-impls-test
  (testing "legacy and new impls should return identical results for the different subqueries"
    (mt/test-drivers (identical-results-between-impls-test-drivers)
      (do-identical-results-between-impls-test (api.pivot-test-util/pivot-query #_include-options true)))))

(deftest ^:parallel identical-results-between-impls-filter-test
  (testing "legacy and new impls should return identical results for the different subqueries"
    (mt/test-drivers (identical-results-between-impls-test-drivers)
      (do-identical-results-between-impls-test (api.pivot-test-util/filters-query)))))

(defn test-query []
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
     :pivot-cols []}))

(defn- -test-both-impls [thunk]
  (doseq [impl-name [:qp.pivot.impl/new
                     :qp.pivot.impl/legacy]]
    (testing (format "\nimpl = %s\n" impl-name)
      (binding [qp.pivot/*impl-override* :qp.pivot.impl/new]
        (thunk)))))

(defmacro ^:private test-both-impls
  "Run tests with both the legacy implementation and the new implementation."
  {:style/indent 0}
  [& body]
  `(-test-both-impls (fn [] ~@body)))

(deftest ^:parallel allow-snake-case-test
  (testing "make sure the stuff works with either normal lisp-case keys or snake_case"
    (test-both-impls
      (is (= (mt/rows (qp.pivot/run-pivot-query (test-query)))
             (mt/rows (qp.pivot/run-pivot-query (set/rename-keys (test-query)
                                                                 {:pivot-rows :pivot_rows, :pivot-cols :pivot_cols}))))))))

(deftest ^:parallel nested-question-pivot-options-test
  (testing "#35025"
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
        (let [viz-settings (mt/$ids products
                             {:pivot_table.column_split
                              {:rows    [$category]
                               :columns [$created_at]}})
              query         (assoc-in query [:info :visualization-settings] viz-settings)]
          (is (= {:pivot-rows [0], :pivot-cols [1]}
                 (#'qp.pivot/pivot-options query)))
          (test-both-impls
            (is (=? {:status    :completed
                     :row_count 156}
                    (qp.pivot/run-pivot-query (assoc query :info {:visualization-settings viz-settings}))))))))))

(deftest ^:parallel nested-question-pivot-aggregation-names-test
  (testing "#43993"
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
            viz-settings (mt/$ids orders {:pivot_table.column_split
                                          {:columns     [[:field "ID" {:base-type :type/Number}]]}})]
        (testing "for a regular query"
          (is (=? {:status :completed}
                  (qp/process-query query))))
        (test-both-impls
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
      (mt/with-temp [Card card {:dataset_query model, :type :model}]
        (testing "Column aliasing needs to work even with aggregations over a model"
          (let [query        (mt/mbql-query
                               orders {:source-table (str "card__" (u/the-id card))
                                       :aggregation  [[:sum [:field "sum" {:base-type :type/Number}]]]
                                       :breakout     [[:field "ID" {:base-type :type/Number}]]})
                viz-settings (mt/$ids orders {:pivot_table.column_split
                                              {:columns     [[:field "ID" {:base-type :type/Number}]]}})]
            (testing "for a regular query"
              (is (=? {:status :completed}
                      (qp/process-query query))))
            (test-both-impls
              (testing "and a pivot query"
                (is (=? {:status    :completed
                         :row_count 1747}
                        (-> query
                            (assoc :info {:visualization-settings viz-settings})
                            qp.pivot/run-pivot-query)))))))))))

(deftest nested-models-with-expressions-pivot-breakout-names-test
  (testing "#43993 again - breakouts on an expression from the inner model should pass"
    (mt/with-temp [Card model1 {:type :model
                                :dataset_query
                                (mt/mbql-query products
                                  {:source-table $$products
                                   :expressions  {"Rating Bucket" [:floor $products.rating]}})}
                   Card model2 {:type :model
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
              viz-settings (mt/$ids orders {:pivot_table.column_split
                                            {:columns     [[:field "Rating Bucket"
                                                            {:base-type  :type/Number
                                                             :join-alias "model A - Product"}]]}})]
          (testing "for a regular query"
            (is (=? {:status :completed}
                    (qp/process-query query))))
          (test-both-impls
            (testing "and a pivot query"
              (is (=? {:status    :completed
                       :row_count 6}
                      (-> query
                          (assoc :info {:visualization-settings viz-settings})
                          qp.pivot/run-pivot-query))))))))))

(deftest ^:parallel dont-return-too-many-rows-test
  (testing "Make sure pivot queries don't return too many rows (#14329)"
    (test-both-impls
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
               rows))))))

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
  (test-both-impls
    (let [results (qp.pivot/run-pivot-query (api.pivot-test-util/pivot-query))
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
                   (let [validator (mc/validator Row)]
                     (fn [_ row]
                       (testing (pr-str row)
                         (if (validator row)
                           {:status :success}
                           (reduced {:status :fail, :bad-row row})))))
                   nil
                   rows))
              "all rows match the Row schema above"))))))

(deftest ^:parallel allow-other-rfs-test
  (letfn [(rff [_]
            (fn
              ([] 0)
              ([acc] acc)
              ([acc _] (inc acc))))]
    (test-both-impls
      (is (= (count (mt/rows (qp.pivot/run-pivot-query (api.pivot-test-util/pivot-query))))
             (qp.pivot/run-pivot-query (api.pivot-test-util/pivot-query) rff))))))

(deftest ^:parallel parameters-query-test
  (test-both-impls
    (is (=? {:status    :completed
             :row_count 137}
            (qp.pivot/run-pivot-query (api.pivot-test-util/parameters-query))))))

(deftest ^:parallel pivots-should-not-return-expressions-test
  (testing (str "Pivots should not return expression columns in the results if they are not explicitly included in "
                "`:fields` (#14604)")
    (let [query (assoc (mt/mbql-query orders
                         {:aggregation [[:count]]
                          :breakout    [$user_id->people.source $product_id->products.category]})
                       :pivot-rows [0]
                       :pivot-cols [1])]
      (test-both-impls
        (is (= (-> (qp.pivot/run-pivot-query query)
                   (dissoc :running_time :started_at :json_query)
                   (m/dissoc-in [:data :results_metadata :checksum])
                   (m/dissoc-in [:data :native_form]))
               (-> (qp.pivot/run-pivot-query (assoc-in query [:query :expressions] {"Don't include me pls" [:+ 1 1]}))
                   (dissoc :running_time :started_at :json_query)
                   (m/dissoc-in [:data :results_metadata :checksum])
                   (m/dissoc-in [:data :native_form]))))))))

(deftest ^:parallel pivots-should-not-return-expressions-test-2
  (let [query (assoc (mt/mbql-query orders
                       {:aggregation [[:count]]
                        :breakout    [$user_id->people.source $product_id->products.category]
                        :fields      [[:expression "test-expr"]]
                        :expressions {"test-expr" [:ltrim "wheeee"]}})
                     :pivot-rows [0]
                     :pivot-cols [1])]
    (testing "If the expression is *explicitly* included in `:fields`, then return it, I guess (#14604)"
      ;; I'm not sure this behavior makes sense -- it seems liable to result in a query the FE can't handle
      ;; correctly, like #14604. The difference here is that #14064 was including expressions that weren't in
      ;; `:fields` at all, which was a clear bug -- while returning expressions that are referenced in `:fields` is
      ;; how the QP normally works in non-pivot-mode.
      ;;
      ;; I do not think there are any situations where the frontend actually explicitly specifies `:fields` in a
      ;; pivot query, so we can revisit this behavior at a later date if needed.
      (test-both-impls
        (let [results (qp.pivot/run-pivot-query query)]
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
  (testing "We should still be able to use expressions inside the aggregations"
    (test-both-impls
      (is (=? {:status :completed}
              (qp.pivot/run-pivot-query
               (mt/mbql-query orders
                 {:expressions {"Product Rating + 1" [:+ $product_id->products.rating 1]}
                  :aggregation [[:count]]
                  :breakout    [$user_id->people.source [:expression "Product Rating + 1"]]})))))))

(deftest pivot-query-should-work-without-data-permissions-test
  (testing "Pivot queries should work if the current user only has permissions to view the Card -- no data perms (#14989)"
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
            (mt/with-temp [Collection collection {}
                           Card       card {:collection_id (u/the-id collection), :dataset_query query}]
              (is (=? {:status "completed"}
                      (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))))
              (test-both-impls
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
    (let [query (mt/mbql-query products
                  {:breakout    [$category]
                   :aggregation [[:count]]
                   :order-by    [[:asc $category]]})]
      (test-both-impls
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
  [
   ;; query 1 [0 1]: breakout on rating, year(created-at), pivot-grouping
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
    (let [query (mt/mbql-query reviews
                  {:breakout    [$rating [:field (mt/id :reviews :created_at) {:temporal-unit :year}]]
                   :aggregation [[:count]]
                   :order-by    [[:asc [:aggregation 0 nil]]]
                   :filter      [:between $created_at "2019-01-01" "2021-01-01"]})]
      (mt/with-native-query-testing-context query
        (test-both-impls
          (let [results (qp.pivot/run-pivot-query query)]
            (is (= ["Rating" "Created At" "pivot-grouping" "Count"]
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
        (test-both-impls
          (is (= order-by-aggregation-expected-results
                 (mt/rows
                  (qp.pivot/run-pivot-query query)))))))))

(deftest ^:parallel fe-friendly-legacy-field-refs-test
  (testing "field_refs in the result metadata should match the 'traditional' legacy shape the FE expects, or it will break"
    ;; `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` will break if the `field_ref`s don't come
    ;; back in this EXACT shape =(, see [[metabase.query-processor.middleware.annotate/fe-friendly-legacy-ref]]
    (let [query (mt/$ids orders
                  {:database   (mt/id)
                   :type       :query
                   :query      {:source-table $$orders
                                :aggregation  [[:count]]
                                :breakout     [!year.created_at
                                               $product_id->products.category
                                               $user_id->people.source]
                                :limit        1}
                   :pivot_rows [0 1 2]
                   :pivot_cols []})]
      (test-both-impls
        (is (= (mt/$ids orders
                 [[:field %created_at {:temporal-unit :year}]
                  [:field %products.category {:source-field %product_id}]
                  [:field %people.source {:source-field %user_id}]
                  [:expression "pivot-grouping"]
                  [:aggregation 0]])
               (mapv :field_ref (mt/cols (qp.pivot/run-pivot-query query)))))))))

(deftest ^:parallel fe-friendly-legacy-field-refs-test-2
  (testing "field_refs in the result metadata should preserve :base-type if it was specified for some reason, otherwise FE will break"
    ;; `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` will break if the `field_ref`s don't come
    ;; back in this EXACT shape =(, see [[metabase.query-processor.middleware.annotate/fe-friendly-legacy-ref]]
    (let [query (mt/$ids orders
                  {:database   (mt/id)
                   :type       :query
                   :query      {:source-table $$orders
                                :aggregation  [[:count]]
                                :breakout     [[:field
                                                (mt/id :products :category)
                                                {:source-field (mt/id :orders :product_id)
                                                 :base-type    :type/Text}]
                                               [:field
                                                (mt/id :people :source)
                                                {:source-field (data/id :orders :user_id)
                                                 :base-type    :type/Text}]]}
                   :pivot_rows [0 1]
                   :pivot_cols []})]
      (test-both-impls
        (is (=? (mt/$ids orders
                  [{:field_ref [:field %products.category {:source-field %product_id, :base-type :type/Text}]}
                   {:field_ref [:field %people.source {:source-field %user_id, :base-type :type/Text}]}
                   {:field_ref [:expression "pivot-grouping"]}
                   {:field_ref [:aggregation 0]}])
                (mt/cols (qp.pivot/run-pivot-query query))))))))

(defn drivers-test-expected-rows [driver]
  (->> [["Twitter" nil      0 401.51]
        ["Twitter" "Widget" 0 498.59]
        [nil       nil      1 401.51]
        [nil       "Widget" 1 498.59]
        ["Twitter" nil      2 900.1]
        [nil       nil      3 900.1]]
       (sort-by (let [nil-first? (mt/sorts-nil-first? driver :type/Text)
                      sort-str   (fn [s]
                                   (cond
                                     (some? s)  s
                                     nil-first? "A"
                                     :else      "Z"))]
                  (fn [[x y group]]
                    [group (sort-str x) (sort-str y)])))))

;;; This test is basically the same
;;; as [[metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions-test/pivot-query-test]] but with
;;; the query we would see post-sandboxing
(deftest ^:parallel drivers-test
  (mt/test-drivers (set/intersection (api.pivot-test-util/applicable-drivers)
                                     (mt/normal-drivers-with-feature :left-join))
    (let [query (mt/mbql-query orders
                  {:source-query {:source-table $$orders
                                  :filter       [:= $user_id 1]}
                   :joins        [{:source-table $$people
                                   :fields       :all
                                   :condition    [:= $user_id &People.people.id]
                                   :alias        "People"}
                                  {:source-query {:source-table $$products
                                                  :filter       [:= $products.category "Widget"]}
                                   :fields       :all
                                   :condition    [:=
                                                  $product_id
                                                  &Products.id]
                                   :alias        "Products"
                                   :fk-field-id  %product_id}]
                   :aggregation  [[:sum $total]]
                   :breakout     [&People.people.source
                                  &Products.products.category]
                   :limit        10})]
      (is (= (drivers-test-expected-rows driver/*driver*)
             (mt/formatted-rows
              [str str int 2.0]
              (qp.pivot/run-pivot-query query)))))))
