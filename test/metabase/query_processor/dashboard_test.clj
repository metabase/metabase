(ns metabase.query-processor.dashboard-test
  "There are more e2e tests in [[metabase.api.dashboard-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.api.dashboard-test :as api.dashboard-test]
   [metabase.models
    :refer [Card Dashboard DashboardCard DashboardCardSeries]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card-test :as qp.card-test]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.test :as mt]))

;; there are more tests in [[metabase.api.dashboard-test]]

(defn- run-query-for-dashcard [dashboard-id card-id dashcard-id & options]
  ;; TODO -- we shouldn't do the perms checks if there is no current User context. It seems like API-level perms check
  ;; stuff doesn't belong in the Dashboard QP namespace
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (apply qp.dashboard/process-query-for-dashcard
           :dashboard-id dashboard-id
           :card-id      card-id
           :dashcard-id  dashcard-id
           :make-run     (constantly
                           (fn run [query info]
                             (qp/process-query (assoc query :info info))))
           options)))

(deftest resolve-parameters-validation-test
  (api.dashboard-test/with-chain-filter-fixtures [{{dashboard-id :id} :dashboard
                                                   {card-id :id}      :card
                                                   {dashcard-id :id}  :dashcard}]
    (letfn [(resolve-params [params]
              (#'qp.dashboard/resolve-params-for-query dashboard-id card-id dashcard-id params))]
      (testing "Valid parameters"
        (is (= [{:type   :category
                 :id     "_PRICE_"
                 :value  4
                 :target [:dimension [:field (mt/id :venues :price) nil]]}]
               (resolve-params [{:id "_PRICE_", :value 4}]))))
      (testing "Should error if parameter doesn't exist"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Dashboard does not have a parameter with ID \"_THIS_PARAMETER_DOES_NOT_EXIST_\".*"
             (resolve-params [{:id "_THIS_PARAMETER_DOES_NOT_EXIST_", :value 3}]))))
      (testing "Should error if parameter is of a different type"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid parameter type :number/!= for parameter \"_PRICE_\".*"
             (resolve-params [{:id "_PRICE_", :value 4, :type :number/!=}]))))))
  (testing "Resolves new operator type arguments without error (#25031)"
    (mt/dataset test-data
      (let [query (mt/native-query {:query         "select COUNT(*) from \"ORDERS\" where true [[AND quantity={{qty_locked}}]]"
                                    :template-tags {"qty_locked"
                                                    {:id           "_query_id_"
                                                     :name         "qty_locked"
                                                     :display-name "quantity locked"
                                                     :type         :number
                                                     :default      nil}}})]
        (mt/with-temp [Card {card-id :id} {:dataset_query query}
                       Dashboard {dashboard-id :id} {:parameters [{:name "param"
                                                                   :slug "param"
                                                                   :id   "_dash_id_"
                                                                   :type :number/=}]}
                       DashboardCard {dashcard-id :id} {:parameter_mappings [{:parameter_id "_dash_id_"
                                                                              :card_id card-id
                                                                              :target [:variable [:template-tag "qty_locked"]]}]
                                                        :card_id card-id
                                                        :visualization_settings {}
                                                        :dashboard_id dashboard-id}]
          (let [params [{:id "_dash_id_" :value 4}]]
            (is (= [{:id "_dash_id_"
                     :type :number/=
                     :value [4]
                     :target [:variable [:template-tag "qty_locked"]]}]
                   (#'qp.dashboard/resolve-params-for-query dashboard-id card-id dashcard-id params)))
            ;; test the full query with two different values to ensure it is actually used
            (is (= [[2391]]
                   (mt/rows
                    (run-query-for-dashcard dashboard-id card-id dashcard-id
                                            {:parameters params}))))
            (is (= [[2738]]
                   (mt/rows
                    (run-query-for-dashcard dashboard-id card-id dashcard-id
                                            {:parameters (assoc-in params [0 :value] 3)}))))))))))

(deftest card-and-dashcard-id-validation-test
  (mt/with-temp [Dashboard     {dashboard-id :id} {:parameters []}
                 Card          {card-id-1 :id} {:dataset_query (mt/mbql-query venues)}
                 Card          {card-id-2 :id} {:dataset_query (mt/mbql-query venues)}
                 Card          {card-id-3 :id} {:dataset_query (mt/mbql-query venues)}
                 DashboardCard {dashcard-id-1 :id} {:card_id card-id-1 :dashboard_id dashboard-id}
                 DashboardCard {dashcard-id-2 :id} {:card_id card-id-2 :dashboard_id dashboard-id}
                 DashboardCard {dashcard-id-3 :id} {:card_id card-id-3 :dashboard_id dashboard-id}
                 DashboardCardSeries _ {:dashboardcard_id dashcard-id-3 :card_id card-id-3}]
    (testing "Sanity check that a valid combination card, dashcard and dashboard IDs executes successfully"
      (is (= 100 (count (mt/rows (run-query-for-dashcard dashboard-id card-id-1 dashcard-id-1))))))

    (testing "A 404 error should be thrown if the card-id is not valid for the dashboard"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Not found"
                              (run-query-for-dashcard dashboard-id (* card-id-1 2) dashcard-id-1))))

    (testing "A 404 error should be thrown if the dashcard-id is not valid for the dashboard"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Not found"
                              (run-query-for-dashcard dashboard-id card-id-1 (* dashcard-id-1 2)))))

    (testing "A 404 error should be thrown if the dashcard-id is not valid for the card"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Not found"
                              (run-query-for-dashcard dashboard-id card-id-1 dashcard-id-2))))

    (testing "Sanity check that a card-id in a dashboard card series executes successfully"
      (is (= 100 (count (mt/rows (run-query-for-dashcard dashboard-id card-id-3 dashcard-id-3))))))

    (testing "A 404 error should be thrown if the card-id is not valid for the dashcard series"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Not found"
                              (run-query-for-dashcard dashboard-id card-id-2 dashcard-id-3))))))

(deftest ^:parallel default-value-precedence-test-field-filters
  (testing "If both Dashboard and Card have default values for a Field filter parameter, Card defaults should take precedence\n"
    (mt/dataset test-data
      (mt/with-temp
        [Card {card-id :id} {:dataset_query {:database (mt/id)
                                             :type     :native
                                             :native   {:query (str "SELECT distinct category "
                                                                    "FROM products "
                                                                    "WHERE {{filter}} "
                                                                    "ORDER BY category ASC")
                                                        :template-tags
                                                        {"filter"
                                                         {:id           "xyz456"
                                                          :name         "filter"
                                                          :display-name "Filter"
                                                          :type         :dimension
                                                          :dimension    [:field (mt/id :products :category) nil]
                                                          :widget-type  :category
                                                          :default      ["Gizmo" "Gadget"]
                                                          :required     false}}}}}
         Dashboard {dashboard-id :id} {:parameters [{:name    "category"
                                                     :slug    "category"
                                                     :id      "abc123"
                                                     :type    "string/="
                                                     :default ["Widget"]}]}
         DashboardCard {dashcard-id :id} {:dashboard_id       dashboard-id
                                          :card_id            card-id
                                          :parameter_mappings [{:parameter_id "abc123"
                                                                :card_id      card-id
                                                                :target       [:dimension [:template-tag "filter"]]}]}]
        (testing "Sanity check: running Card query should use Card defaults"
          (is (= [["Gadget"] ["Gizmo"]]
                 (mt/rows (qp.card-test/run-query-for-card card-id)))))
        (testing "No value specified: should prefer Card defaults"
          (is (= [["Gadget"] ["Gizmo"]]
                 (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id)))))
        (testing "Specifying a value should override both defaults."
          (is (= [["Doohickey"]]
                 (mt/rows (run-query-for-dashcard
                           dashboard-id card-id dashcard-id
                           :parameters [{:id    "abc123"
                                         :value ["Doohickey"]}])))))
        (testing "Specifying a nil value should override both defaults and not apply the filter."
          (is (= [["Doohickey"] ["Gadget"] ["Gizmo"] ["Widget"]]
                 (mt/rows (run-query-for-dashcard
                           dashboard-id card-id dashcard-id
                           :parameters [{:id    "abc123"
                                         :value nil}])))))))))

(deftest default-value-precedence-test-raw-values
  (testing "If both Dashboard and Card have default values for a raw value parameter, Card defaults should take precedence\n"
    (mt/dataset test-data
      (mt/with-temp
        [Card {card-id :id} {:dataset_query {:database (mt/id)
                                             :type     :native
                                             :native   {:query "SELECT {{filter}}"
                                                        :template-tags
                                                        {"filter"
                                                         {:id           "f0774ef5-a14a-e181-f557-2d4bb1fc94ae"
                                                          :name         "filter"
                                                          :display-name "Filter"
                                                          :type         "text"
                                                          :required     true
                                                          :default      "Foo"}}}}}
         Dashboard {dashboard-id :id} {:parameters [{:name    "Text"
                                                     :slug    "text"
                                                     :id      "5791ff38"
                                                     :type    "string/="
                                                     :default "Bar"}]}
         DashboardCard {dashcard-id :id} {:dashboard_id       dashboard-id
                                          :card_id            card-id
                                          :parameter_mappings [{:parameter_id "5791ff38"
                                                                :card_id      card-id
                                                                :target       [:variable [:template-tag "filter"]]}]}]
        (testing "Sanity check: running Card query should use Card defaults"
          (is (= [["Foo"]]
                 (mt/rows (qp.card-test/run-query-for-card card-id)))))
        (testing "No value specified: should prefer Card defaults"
          (is (= [["Foo"]]
                 (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id)))))
        (testing "Specifying a value should override both defaults."
          (is (= [["Something Else"]]
                 (mt/rows (run-query-for-dashcard
                           dashboard-id card-id dashcard-id
                           :parameters [{:id    "5791ff38"
                                         :value ["Something Else"]}])))))
        (testing "Providing a nil value should override both defaults and produce an error"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You'll need to pick a value for 'Filter' before this query can run."
               (run-query-for-dashcard
                dashboard-id card-id dashcard-id
                :parameters [{:id    "5791ff38"
                              :value nil}]))))))))

(deftest do-not-apply-unconnected-filters-for-same-card-test
  (testing (str "If the same Card is added to a Dashboard multiple times but with different filters, only apply the "
                "filters for the DashCard we're running a query for (#19494)")
    (mt/dataset test-data
      (mt/with-temp
        [Card      {card-id :id}      {:dataset_query (mt/mbql-query products {:aggregation [[:count]]})}
         Dashboard {dashboard-id :id} {:parameters [{:name "Category (DashCard 1)"
                                                     :slug "category_1"
                                                     :id   "CATEGORY_1"
                                                     :type "string/="}
                                                    {:name    "Category (DashCard 2)"
                                                     :slug    "category_2"
                                                     :id      "CATEGORY_2"
                                                     :type    "string/="}]}
         DashboardCard {dashcard-1-id :id} {:card_id            card-id
                                            :dashboard_id       dashboard-id
                                            :parameter_mappings [{:parameter_id "CATEGORY_1"
                                                                  :card_id      card-id
                                                                  :target       [:dimension (mt/$ids $products.category)]}]}
         DashboardCard {dashcard-2-id :id} {:card_id            card-id
                                            :dashboard_id       dashboard-id
                                            :parameter_mappings [{:parameter_id "CATEGORY_2"
                                                                  :card_id      card-id
                                                                  :target       [:dimension (mt/$ids $products.category)]}]}]
        (testing "DashCard 1 (Category = Doohickey)"
          (is (= [[42]]
                 (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-1-id
                                                  :parameters [{:id    "CATEGORY_1"
                                                                :value ["Doohickey"]}]))))
          (testing "DashCard 2 should ignore DashCard 1 params"
            (is (= [[200]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-2-id
                                                    :parameters [{:id    "CATEGORY_1"
                                                                  :value ["Doohickey"]}]))))))
        (testing "DashCard 2 (Category = Gadget)"
          (is (= [[53]]
                 (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-2-id
                                                  :parameters [{:id    "CATEGORY_2"
                                                                :value ["Gadget"]}]))))
          (testing "DashCard 1 should ignore DashCard 2 params"
            (is (= [[200]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-1-id
                                                    :parameters [{:id    "CATEGORY_2"
                                                                  :value ["Gadget"]}]))))))))))

(deftest field-filters-should-work-if-no-value-is-specified-test
  (testing "Field Filters should not apply if no value is specified (metabase#20493)"
    (mt/dataset test-data
      (let [query (mt/native-query {:query         "SELECT COUNT(*) FROM \"PRODUCTS\" WHERE {{cat}}"
                                    :template-tags {"cat" {:id           "__cat__"
                                                           :name         "cat"
                                                           :display-name "Cat"
                                                           :type         :dimension
                                                           :dimension    [:field (mt/id :products :category) nil]
                                                           :widget-type  :string/=
                                                           :default      nil}}})]
        (mt/with-native-query-testing-context query
          (is (= [[200]]
                 (mt/rows (qp/process-query query)))))
        (mt/with-temp [Card          {card-id :id} {:dataset_query query}
                       Dashboard     {dashboard-id :id} {:parameters [{:name      "Text"
                                                                       :slug      "text"
                                                                       :id        "_TEXT_"
                                                                       :type      "string/="
                                                                       :sectionId "string"
                                                                       :default   ["Doohickey"]}]}
                       DashboardCard {dashcard-id :id} {:parameter_mappings     [{:parameter_id "_TEXT_"
                                                                                  :card_id      card-id
                                                                                  :target       [:dimension [:template-tag "cat"]]}]
                                                        :card_id                card-id
                                                        :visualization_settings {}
                                                        :dashboard_id           dashboard-id}]
          (testing "if the parameter is not specified"
            (is (= [[200]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id)))))
          (testing "if the parameter value is specified but has a nil value"
            (is (= [[200]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id
                                                    :parameters [{:name    "Text"
                                                                  :slug    "text"
                                                                  :id      "_TEXT_"
                                                                  :type    "string/="
                                                                  :value   nil
                                                                  :default ["Doohickey"]}]))))))
        (testing "if the dashboard doesn't have a parameter mapped to the card parameter"
          (mt/with-temp [Card          {card-id :id} {:dataset_query query}
                         Dashboard     {dashboard-id :id} {:parameters []}
                         DashboardCard {dashcard-id :id} {:parameter_mappings     []
                                                          :card_id                card-id
                                                          :visualization_settings {}
                                                          :dashboard_id           dashboard-id}]
            (is (= [[200]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id))))))))))

(deftest field-filters-with-default-if-no-value-is-specified-test
  (testing "Field Filters work differently if a default on the card parameter is specified"
    (mt/dataset test-data
      (let [query (mt/native-query {:query         "SELECT COUNT(*) FROM \"PRODUCTS\" WHERE {{cat}}"
                                    :template-tags {"cat" {:id           "__cat__"
                                                           :name         "cat"
                                                           :display-name "Cat"
                                                           :type         :dimension
                                                           :dimension    [:field (mt/id :products :category) nil]
                                                           :widget-type  :string/=
                                                           :default      ["Gizmo"]}}})]
        (mt/with-native-query-testing-context query
          (is (= [[51]]
                 (mt/rows (qp/process-query query)))))
        (mt/with-temp [Card          {card-id :id} {:dataset_query query}
                       Dashboard     {dashboard-id :id} {:parameters [{:name      "Text"
                                                                       :slug      "text"
                                                                       :id        "_text_"
                                                                       :type      "string/="
                                                                       :sectionId "string"
                                                                       :default   ["Doohickey"]}]}
                       DashboardCard {dashcard-id :id} {:parameter_mappings     [{:parameter_id "_text_"
                                                                                  :card_id      card-id
                                                                                  :target       [:dimension [:template-tag "cat"]]}]
                                                        :card_id                card-id
                                                        :visualization_settings {}
                                                        :dashboard_id           dashboard-id}]
          (testing "should apply the default if the parameter is not specified"
            (is (= [[51]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id)))))
          (testing "shouldn't apply the default if the parameter value is specified but with a nil value"
            (is (= [[200]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id
                                                    :parameters [{:name    "Text"
                                                                  :slug    "text"
                                                                  :id      "_text_"
                                                                  :type    "string/="
                                                                  :value   nil
                                                                  :default ["Doohickey"]}]))))))
        (testing "should apply the default if the dashboard parameter is not mapped to the card parameter"
          (mt/with-temp [Card          {card-id :id} {:dataset_query query}
                         Dashboard     {dashboard-id :id} {:parameters []}
                         DashboardCard {dashcard-id :id} {:parameter_mappings     []
                                                          :card_id                card-id
                                                          :visualization_settings {}
                                                          :dashboard_id           dashboard-id}]
            (is (= [[51]]
                   (mt/rows (run-query-for-dashcard dashboard-id card-id dashcard-id))))))))))

(deftest ignore-default-values-in-request-parameters-test
  (testing "Parameters passed in from the request with only default values (but no actual values) should get ignored (#20516)"
    (mt/dataset test-data
      (mt/with-temp [Card {card-id :id} {:name          "Orders"
                                         :dataset_query (mt/mbql-query products
                                                                       {:fields   [$id $title $category]
                                                                        :order-by [[:asc $id]]
                                                                        :limit    2})}
                     Dashboard {dashboard-id :id} {:name       "20516 Dashboard"
                                                   :parameters [{:name    "Category"
                                                                 :slug    "category"
                                                                 :id      "_CATEGORY_"
                                                                 :type    "category"
                                                                 :default ["Doohickey"]}]}
                     DashboardCard {dashcard-id :id} {:parameter_mappings [{:parameter_id "_CATEGORY_"
                                                                            :card_id      card-id
                                                                            :target       [:dimension [:field (mt/id :products :category) nil]]}]
                                                      :card_id            card-id
                                                      :dashboard_id       dashboard-id}]
        (testing "No parameters -- ignore Dashboard default (#20493, #20503)"
          ;; [[metabase.query-processor.middleware.large-int-id]] middleware is converting the IDs to strings I guess
          (is (= [["1" "Rustic Paper Wallet" "Gizmo"]
                  ["2" "Small Marble Shoes" "Doohickey"]]
                 (mt/rows
                  (run-query-for-dashcard dashboard-id card-id dashcard-id)))))
        (testing "Request parameters with :default -- ignore these as well (#20516)"
          (is (= [["1" "Rustic Paper Wallet" "Gizmo"]
                  ["2" "Small Marble Shoes" "Doohickey"]]
                 (mt/rows
                  (run-query-for-dashcard dashboard-id card-id dashcard-id
                                          :parameters [{:name    "Category"
                                                        :slug    "category"
                                                        :id      "_CATEGORY_"
                                                        :type    "category"
                                                        :default ["Gizmo"]}])))))
        (testing "Request parameters with :default and nil value"
          (is (= [["1" "Rustic Paper Wallet" "Gizmo"]
                  ["2" "Small Marble Shoes" "Doohickey"]]
                 (mt/rows
                  (run-query-for-dashcard dashboard-id card-id dashcard-id
                                          :parameters [{:name    "Category"
                                                        :slug    "category"
                                                        :id      "_CATEGORY_"
                                                        :type    "category"
                                                        :value   nil
                                                        :default ["Gizmo"]}])))))))))
