(ns metabase.agent-api.parameter-values-test
  "The v2 `get_parameter_values` tool. The chain-filter engine the app's filter widget reads, behind a target/id/
   parameter_id triple: list, prefix-search, and — on a dashboard — narrow by the values already chosen."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- values!
  ([body] (values! :rasta 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/parameter-values" body)))

(defn- refusal!
  ([body] (refusal! 400 body))
  ([status body]
   (let [response (values! :rasta status body)]
     (if (string? response) response (pr-str response)))))

(defn- flat [response]
  (set (map first (:values response))))

(def ^:private category-param
  {:name "Category" :slug "category" :id "cat" :type "string/="})

(def ^:private price-param
  {:name "Price" :slug "price" :id "price" :type "number/="})

(defn- with-venues-dashboard
  "Run `f` with a dashboard whose Category and Price filters are both wired to a Venues card, so Category's values
   chain-filter under a chosen Price."
  [f]
  (mt/with-temp [:model/Card      card {:name          "AgentV2 Venues"
                                        :dataset_query (mt/mbql-query venues)}
                 :model/Dashboard dash {:parameters [category-param price-param]}
                 :model/DashboardCard _ {:dashboard_id       (:id dash)
                                         :card_id            (:id card)
                                         :parameter_mappings [{:parameter_id "cat"
                                                               :card_id      (:id card)
                                                               :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                              {:parameter_id "price"
                                                               :card_id      (:id card)
                                                               :target       [:dimension (mt/$ids venues $price)]}]}]
    (f dash)))

;;; ──────────────────────────────────────────────────────────────────
;;; Dashboards
;;; ──────────────────────────────────────────────────────────────────

(deftest dashboard-values-test
  (with-venues-dashboard
    (fn [dashboard]
      (let [response (values! {:target "dashboard" :id (:id dashboard) :parameter_id "cat"})]
        (testing "the values are the field's own, in the REST shape"
          (is (contains? (flat response) "African"))
          (is (false? (:has_more_values response))))
        (testing "and the response carries nothing else"
          (is (= #{:values :has_more_values} (set (keys response)))))))))

(deftest dashboard-values-search-test
  (with-venues-dashboard
    (fn [dashboard]
      (testing "`query` searches the values rather than listing them"
        (let [response (values! {:target "dashboard" :id (:id dashboard) :parameter_id "cat" :query "Afr"})]
          (is (= #{"African"} (flat response))))))))

(deftest dashboard-values-constraints-test
  (with-venues-dashboard
    (fn [dashboard]
      (testing "`constraints` chain-filters the parameter to what is reachable under the values already chosen"
        (let [all        (flat (values! {:target "dashboard" :id (:id dashboard) :parameter_id "cat"}))
              under-four (flat (values! {:target       "dashboard"
                                         :id           (:id dashboard)
                                         :parameter_id "cat"
                                         :constraints  {"price" 4}}))]
          (is (seq under-four))
          (is (< (count under-four) (count all))))))))

(deftest unknown-parameter-teaches-where-the-ids-come-from-test
  (with-venues-dashboard
    (fn [dashboard]
      (let [message (refusal! {:target "dashboard" :id (:id dashboard) :parameter_id "nope"})]
        (is (re-find #"get_content" message))
        (is (re-find #"parameters" message))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Questions
;;; ──────────────────────────────────────────────────────────────────

(deftest question-values-test
  (mt/with-temp [:model/Card card {:name          "AgentV2 Param Question"
                                   :dataset_query (mt/native-query
                                                   {:query         "SELECT * FROM CATEGORIES WHERE {{cat}}"
                                                    :template-tags {"cat" {:id           "cat"
                                                                           :name         "cat"
                                                                           :display-name "Cat"
                                                                           :type         :dimension
                                                                           :dimension    [:field (mt/id :categories :name) nil]
                                                                           :widget-type  :string/=}}})
                                   :parameters    [{:id "cat" :type "string/=" :name "Cat" :slug "cat"
                                                    :target [:dimension [:template-tag "cat"]]}]}]
    (testing "a question's parameter values come back without any constraints"
      (is (contains? (flat (values! {:target "question" :id (:id card) :parameter_id "cat"}))
                     "African")))
    (testing "and `constraints` is refused, naming what does chain-filter"
      (is (re-find #"chain-filter the parameters of a dashboard"
                   (refusal! {:target       "question"
                              :id           (:id card)
                              :parameter_id "cat"
                              :constraints  {"price" 4}}))))))
