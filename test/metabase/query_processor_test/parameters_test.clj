(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.models :refer [Card]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util :as u]))

(defn- run-count-query [query]
  (or (ffirst
       (mt/formatted-rows [int]
         (qp/process-query query)))
      ;; HACK (!) Mongo returns `nil` count instead of 0 — (#5419) — workaround until this is fixed
      0))

(defn- query-with-default-parameter-value [query param-name param-value]
  (assoc-in query [:native :template-tags (name param-name) :default] param-value))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Template Tag Params                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- template-tag-count-query
  "Generate a native query for the current driver for count of `table` with a template-tag parameter for `field`:

    (template-tag-count-query :venues :name :text \"In-N-Out Burger\" nil)
    ;; ->
    {:database   2671
     :type       :native
     :native     {:query         \"SELECT count(*) AS \"count\" FROM \"PUBLIC\".\"VENUES\" WHERE \"PUBLIC\".\"VENUES\".\"NAME\" = {{name}}\"
                  :template-tags {\"name\" {:name \"name\", :display-name \"name\", :type \"text\"}}}
     :parameters [{:type :text, :target [:variable [:template-tag \"name\"]], :value \"Tempest\"}]}"
  [table field param-type param-value {:keys [defaults?]}]
  (let [query (mt/native-query
                (assoc (mt/count-with-template-tag-query driver/*driver* table field param-type)
                       :template-tags {(name field) {:name         (name field)
                                                     :display-name (name field)
                                                     :type         (or (namespace param-type)
                                                                       (name param-type))}}))]
    (if defaults?
      (query-with-default-parameter-value query field param-value)
      (assoc query :parameters [{:type   param-type
                                 :target [:variable [:template-tag (name field)]]
                                 :value  param-value}]))))

(deftest template-tag-param-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (letfn [(count-with-params [table param-name param-type value & [options]]
              (run-count-query
               (template-tag-count-query table param-name param-type value options)))]
      (doseq [[message options] {"Query with all supplied parameters" nil
                                 "Query using default values"         {:defaults? true}}]
        (testing message
          (testing "text params"
            (is (= 1
                   (count-with-params :venues :name :text "In-N-Out Burger" options))))
          (testing "number params"
            (is (= 22
                   (count-with-params :venues :price :number "1" options))))
          ;; FIXME — This is not currently working on SQLite, probably because SQLite's implementation of temporal types
          ;; is wacko.
          (when (not= driver/*driver* :sqlite)
            (testing "date params"
              (is (= 1
                     (count-with-params :users :last_login :date/single "2014-08-02T09:30Z" options))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Field Filter Params                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- field-filter-count-query [table field value-type value]
  {:database   (mt/id)
   :type       :native
   :native     (assoc (mt/count-with-field-filter-query driver/*driver* table field)
                      :template-tags {(name field) {:name         (name field)
                                                    :display-name (name field)
                                                    :type         :dimension
                                                    :dimension    [:field-id (mt/id table field)]}})
   :parameters [{:type   value-type
                 :name   (name field)
                 :target [:dimension [:template-tag (name field)]]
                 :value  value}]})

;; this isn't a complete test for all possible field filter types, but it covers mostly everything
(deftest field-filter-param-test
  (letfn [(is-count-= [expected-count table field value-type value]
            (let [query (field-filter-count-query table field value-type value)]
              (testing (format "\nquery = \n%s" (u/pprint-to-str 'cyan query))
                (is (= expected-count
                       (run-count-query query))))))]
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (testing "temporal field filters"
        ;; TIMEZONE FIXME — The excluded drivers below don't have TIME types, so the `attempted-murders` dataset doesn't
        ;; currently work. We should use the closest equivalent types (e.g. `DATETIME` or `TIMESTAMP` so we can still
        ;; load the dataset and run tests using this dataset such as these, which doesn't even use the TIME type.
        (when-not (#{:oracle :presto :redshift :sparksql :snowflake} driver/*driver*)
          (mt/dataset attempted-murders
            (doseq [field
                    [:datetime
                     :date
                     :datetime_tz]

                    [value-type value expected-count]
                    [[:date/relative     "past30days" 0]
                     [:date/range        "2019-11-01~2020-01-09" 20]
                     [:date/single       "2019-11-12" 1]
                     [:date/quarter-year "Q4-2019" 20]
                     [:date/month-year   "2019-11" 20]]]
              (testing (format "\nField filter with %s Field" field)
                (testing (format "\nfiltering against %s value '%s'" value-type value)
                  (is-count-= expected-count
                              :attempts field value-type value)))))))
      ;; FIXME — Field Filters don't seem to be working correctly for SparkSQL
      (when-not (= driver/*driver* :sparksql)
        (testing "text params"
          (is-count-= 1
                      :venues :name :text "In-N-Out Burger"))
        (testing "number params"
          (is-count-= 22
                      :venues :price :number "1"))
        (testing "boolean params"
          (mt/dataset places-cam-likes
            (is-count-= 2
                        :places :liked :boolean true)))))))

(deftest filter-nested-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :nested-queries)
    (testing "We should be able to apply filters to queries that use native queries with parameters as their source (#9802)"
      (mt/with-temp Card [{card-id :id} {:dataset_query (mt/native-query (qp/query->native (mt/mbql-query checkins)))}]
        (let [query (assoc (mt/mbql-query nil
                             {:source-table (format "card__%d" card-id)})
                           :parameters [{:type   :date/all-options
                                         :target [:dimension (mt/$ids *checkins.date)] ; expands to appropriate field-literal form
                                         :value  "2014-01-06"}])]
          (is (= [[182 "2014-01-06T00:00:00Z" 5 31]]
                 (mt/formatted-rows :checkins
                   (qp/process-query query)))))))))

(deftest string-escape-test
  ;; test `:sql` drivers that support native parameters
  (mt/test-drivers (set (filter #(isa? driver/hierarchy % :sql) (mt/normal-drivers-with-feature :native-parameters)))
    (testing "Make sure field filter parameters are properly escaped"
      (let [query   (field-filter-count-query :venues :name :text "Tito's Tacos")
            results (qp/process-query query)]
        (is (= [[1]]
               (mt/formatted-rows [int] results)))))))

(deftest native-with-spliced-params-test
  (testing "Make sure we can convert a parameterized query to a native query with spliced params"
    (testing "Multiple values"
      (mt/dataset airports
        (is (= {:query  "SELECT NAME FROM COUNTRY WHERE \"PUBLIC\".\"COUNTRY\".\"NAME\" IN ('US', 'MX')"
                :params nil}
               (qp/query->native-with-spliced-params
                {:type       :native
                 :native     {:query         "SELECT NAME FROM COUNTRY WHERE {{country}}"
                              :template-tags {"country"
                                              {:name         "country"
                                               :display-name "Country"
                                               :type         :dimension
                                               :dimension    [:field-id (mt/id :country :name)]
                                               :widget-type  :category}}}
                 :database   (mt/id)
                 :parameters [{:type   :location/country
                               :target [:dimension [:template-tag "country"]]
                               :value  ["US" "MX"]}]})))))

    (testing "Comma-separated numbers"
      (is (= {:query  "SELECT * FROM VENUES WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" IN (1, 2)"
              :params []}
             (qp/query->native-with-spliced-params
              {:type       :native
               :native     {:query         "SELECT * FROM VENUES WHERE {{price}}"
                            :template-tags {"price"
                                            {:name         "price"
                                             :display-name "Price"
                                             :type         :dimension
                                             :dimension    [:field-id (mt/id :venues :price)]
                                             :widget-type  :category}}}
               :database   (mt/id)
               :parameters [{:type   :category
                             :target [:dimension [:template-tag "price"]]
                             :value  [1 2]}]}))))))

(deftest ignore-parameters-for-unparameterized-native-query-test
  (testing "Parameters passed for unparameterized queries should get ignored"
    (let [query {:database (mt/id)
                 :type     :native
                 :native   {:query "select 111 as my_number, 'foo' as my_string"}}]
      (is (= (-> (qp/process-query query)
                 (m/dissoc-in [:data :results_metadata :checksum]))
             (-> (qp/process-query (assoc query :parameters [{:type   "category"
                                                              :value  [:param-value]
                                                              :target [:dimension
                                                                       [:field
                                                                        (mt/id :categories :id)
                                                                        {:source-field (mt/id :venues :category_id)}]]}]))
                 (m/dissoc-in [:data :native_form :params])
                 (m/dissoc-in [:data :results_metadata :checksum])))))))
