(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require
    [clojure.string :as str]
    [clojure.test :refer :all]
    [java-time :as t]
    [medley.core :as m]
    [metabase.driver :as driver]
    [metabase.lib.native :as lib-native]
    [metabase.models :refer [Card]]
    [metabase.query-processor :as qp]
    [metabase.test :as mt]
    [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.tools.with-temp :as t2.with-temp]))

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

(deftest template-tag-generation-test
  (testing "Generating template tags produces correct types for running process-query (#31252)"
    (mt/with-temp* [Card [{card-id :id}]]
      (let [q   (str "SELECT * FROM {{#" card-id "}} LIMIT 2")
            tt  (lib-native/template-tags q)
            res (qp/process-query
                  {:database (mt/id)
                   :type     :native
                   :native   {:query         q
                              :template-tags tt}})]
        (is (some? res))))))

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
                                                    :widget-type  value-type
                                                    :dimension    [:field (mt/id table field) nil]}})
   :parameters [{:type   value-type
                 :name   (name field)
                 :target [:dimension [:template-tag (name field)]]
                 :value  value}]})

;; TODO: fix this test for Presto JDBC (detailed explanation follows)
;; Spent a few hours and need to move on. Here is the query being generated for the failing case
;;  SELECT count(*) AS "count" FROM "default"."attempts"
;;    WHERE date_trunc('day', "default"."attempts"."datetime_tz") = date '2019-11-12';
;; And here is what it *SHOULD* be to pass the test
;;  SELECT count(*) AS "count" FROM "default"."attempts"
;;    WHERE date_trunc('day', "default"."attempts"."datetime_tz" AT TIME ZONE 'UTC') = date '2019-11-12';
;; Notice the AT TIME ZONE 'UTC' part. In this case, the test does not set a report timezone, so a fallback of UTC
;; should (evidently) be applied.
;; We need the type information, that the datetime_tz is `timestamp with time zone`, to be available to
;; (defmethod sql.qp/date [:presto-jdbc :day]
;; However, it is not available there. The expression's HSQL type-info and db-type are both nil. Somehow need to tell
;; the query processor (or something else?) to *include* that type information when running this test, because it's
;; clearly known (i.e. if you sync the DB and then query the `metabase_field`, it is there and is correct.
;; Tried manually syncing the DB (with attempted-murders dataset), and storing it to an initialized QP, to no avail.

;; this isn't a complete test for all possible field filter types, but it covers mostly everything
(deftest field-filter-param-test
  (letfn [(is-count-= [expected-count table field value-type value]
            (let [query (field-filter-count-query table field value-type value)]
              (testing (format "\nquery = \n%s" (u/pprint-to-str 'cyan query))
                (is (= expected-count
                       (run-count-query query))))))]
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (testing "temporal field filters"
        ;; TIMEZONE FIXME — The excluded drivers don't have TIME types, so the `attempted-murders` dataset doesn't
        ;; currently work. We should use the closest equivalent types (e.g. `DATETIME` or `TIMESTAMP` so we can still
        ;; load the dataset and run tests using this dataset such as these, which doesn't even use the TIME type.
        (when (and (mt/supports-time-type? driver/*driver*)
                   ;; Not sure why it's failing for Snowflake, we'll have to investigate.
                   (not (= :snowflake driver/*driver*)))
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
      (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (mt/native-query (qp/compile (mt/mbql-query checkins)))}]
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
               (qp/compile-and-splice-parameters
                {:type       :native
                 :native     {:query         "SELECT NAME FROM COUNTRY WHERE {{country}}"
                              :template-tags {"country"
                                              {:name         "country"
                                               :display-name "Country"
                                               :type         :dimension
                                               :dimension    [:field (mt/id :country :name) nil]
                                               :widget-type  :category}}}
                 :database   (mt/id)
                 :parameters [{:type   :location/country
                               :target [:dimension [:template-tag "country"]]
                               :value  ["US" "MX"]}]})))))

    (testing "Comma-separated numbers"
      (is (= {:query  "SELECT * FROM VENUES WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" IN (1, 2)"
              :params []}
             (qp/compile-and-splice-parameters
              {:type       :native
               :native     {:query         "SELECT * FROM VENUES WHERE {{price}}"
                            :template-tags {"price"
                                            {:name         "price"
                                             :display-name "Price"
                                             :type         :dimension
                                             :dimension    [:field (mt/id :venues :price) nil]
                                             :widget-type  :category}}}
               :database   (mt/id)
               :parameters [{:type   :category
                             :target [:dimension [:template-tag "price"]]
                             :value  [1 2]}]}))))))

(deftest params-in-comments-test
  (testing "Params in SQL comments are ignored"
    (testing "Single-line comments"
      (mt/dataset airports
                  (is (= {:query  "SELECT NAME FROM COUNTRY WHERE \"PUBLIC\".\"COUNTRY\".\"NAME\" IN ('US', 'MX') -- {{ignoreme}}"
                          :params nil}
                         (qp/compile-and-splice-parameters
                          {:type       :native
                           :native     {:query         "SELECT NAME FROM COUNTRY WHERE {{country}} -- {{ignoreme}}"
                                        :template-tags {"country"
                                                        {:name         "country"
                                                         :display-name "Country"
                                                         :type         :dimension
                                                         :dimension    [:field (mt/id :country :name) nil]
                                                         :widget-type  :category}}}
                           :database   (mt/id)
                           :parameters [{:type   :location/country
                                         :target [:dimension [:template-tag "country"]]
                                         :value  ["US" "MX"]}]})))))

    (testing "Multi-line comments"
      (is (= {:query  "SELECT * FROM VENUES WHERE\n/*\n{{ignoreme}}\n*/ \"PUBLIC\".\"VENUES\".\"PRICE\" IN (1, 2)"
              :params []}
             (qp/compile-and-splice-parameters
              {:type       :native
               :native     {:query         "SELECT * FROM VENUES WHERE\n/*\n{{ignoreme}}\n*/ {{price}}"
                            :template-tags {"price"
                                            {:name         "price"
                                             :display-name "Price"
                                             :type         :dimension
                                             :dimension    [:field (mt/id :venues :price) nil]
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

(deftest legacy-parameters-with-no-widget-type-test
  (testing "Legacy queries with parameters that don't specify `:widget-type` should still work (#20643)"
    (mt/dataset sample-dataset
      (let [query (mt/native-query
                    {:query         "SELECT count(*) FROM products WHERE {{cat}};"
                     :template-tags {"cat" {:id           "__MY_CAT__"
                                            :name         "cat"
                                            :display-name "Cat"
                                            :type         :dimension
                                            :dimension    [:field (mt/id :products :category) nil]}}})]
        (is (= [200]
               (mt/first-row (qp/process-query query))))))))

(deftest date-parameter-for-native-query-with-nested-mbql-query-test
  (testing "Should be able to have a native query with a nested MBQL query and a date parameter (#21246)"
    (mt/dataset sample-dataset
      (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (mt/mbql-query products)}]
        (let [param-name (format "#%d" card-id)
              query      (mt/native-query
                           {:query         (str/join \newline
                                                     [(format "WITH exclude_products AS {{%s}}" param-name)
                                                      "SELECT count(*)"
                                                      "FROM orders"
                                                      "[[WHERE {{created_at}}]]"])
                            :template-tags {param-name   {:type         :card
                                                          :card-id      card-id
                                                          :display-name param-name
                                                          :id           "__source__"
                                                          :name         param-name}
                                            "created_at" {:type         :dimension
                                                          :default      nil
                                                          :dimension    [:field (mt/id :orders :created_at) nil]
                                                          :display-name "Created At"
                                                          :id           "__created_at__"
                                                          :name         "created_at"
                                                          :widget-type  :date/all-options}}})]
          (testing "With no parameters"
            (mt/with-native-query-testing-context query
              (is (= [[18760]]
                     (mt/rows (qp/process-query query))))))
          (testing "With parameters (#21246)"
            (let [query (assoc query :parameters [{:type   :date/all-options
                                                   :value  "2022-04-20"
                                                   :target [:dimension [:template-tag "created_at"]]}])]
              (mt/with-native-query-testing-context query
                (is (= [[0]]
                       (mt/rows (qp/process-query query))))))))))))

(deftest multiple-native-query-parameters-test
  (mt/dataset sample-dataset
    (let [sql   (str/join
                 \newline
                 ["SELECT orders.id, orders.created_at, people.state, people.name, people.source"
                  "FROM orders LEFT JOIN people ON orders.user_id = people.id"
                  "WHERE true"
                  "  [[AND {{created_at}}]]"
                  "  [[AND {{state}}]]"
                  "  AND [[people.source = {{source}}]]"
                  "  ORDER BY orders.id ASC"
                  "  LIMIT 15;"])
          query {:database (mt/id)
                 :type     :native
                 :native   {:query         sql
                            :type          :native
                            :template-tags {"created_at" {:id           "a21ca6d2-f742-a94a-da71-75adf379069c"
                                                          :name         "created_at"
                                                          :display-name "Created At"
                                                          :type         :dimension
                                                          :dimension    [:field (mt/id :orders :created_at) nil]
                                                          :widget-type  :date/quarter-year
                                                          :default      nil}
                                            "source"     {:id           "44038e73-f909-1bed-0974-2a42ce8979e8"
                                                          :name         "source"
                                                          :display-name "Source"
                                                          :type         :text}
                                            "state"      {:id           "88057a9e-91bd-4b2e-9327-afd92c259dc8"
                                                          :name         "state"
                                                          :display-name "State"
                                                          :type         :dimension
                                                          :dimension    [:field (mt/id :people :state) nil]
                                                          :widget-type  :string/!=
                                                          :default      nil}}
                            :parameters    [{:type   :date/quarter-year
                                             :target [:dimension [:template-tag "created_at"]]
                                             :slug   "created_at"
                                             :value  "Q2-2019"}
                                            {:type   :category
                                             :target [:variable [:template-tag "source"]]
                                             :slug   "source"
                                             :value  "Organic"}
                                            {:type   :string/!=
                                             :target [:dimension [:template-tag "state"]]
                                             :slug   "state"
                                             :value  ["OR"]}]}}]
      (mt/with-native-query-testing-context query
        (let [rows (mt/rows (qp/process-query query))]
          (testing (format "Results =\n%s" (u/pprint-to-str rows))
            (doseq [[_orders-id orders-created-at people-state _people-name people-source :as row] rows]
              (testing (format "Row =\n%s" (u/pprint-to-str row))
                (testing "created_at = Q2-2019"
                  (is (t/after?  (u.date/parse orders-created-at) #t "2019-04-01T00:00:00-00:00"))
                  (is (t/before? (u.date/parse orders-created-at) #t "2019-07-01T00:00:00-00:00")))
                (testing "source = Organic"
                  (is (= people-source "Organic")))
                (testing "state != OR"
                  (is (not= people-state "OR")))))
            (testing "Should contain row with 'Emilie Goyette'"
              (is (some (fn [[_orders-id _orders-created-at _people-state people-name _people-source :as _row]]
                          (= people-name "Emilie Goyette"))
                        rows)))))))))

(deftest inlined-number-test
  (testing "Number parameters are inlined into the SQL query and not parameterized (#29690)"
    (mt/dataset sample-dataset
      (is (= {:query  "SELECT NOW() - INTERVAL '30 DAYS'"
              :params []}
             (qp/compile-and-splice-parameters
              {:type       :native
               :native     {:query         "SELECT NOW() - INTERVAL '{{n}} DAYS'"
                            :template-tags {"n"
                                            {:name         "n"
                                             :display-name "n"
                                             :type         :number}}}
               :database   (mt/id)
               :parameters [{:type :number
                             :target [:variable [:template-tag "n"]]
                             :slug "n"
                             :value "30"}]}))))))
