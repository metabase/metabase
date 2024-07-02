(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.native :as lib-native]
   [metabase.models :refer [Card]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
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

(deftest ^:parallel template-tag-param-test
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
    (t2.with-temp/with-temp
      [Card {card-id :id} {:type          :model
                           :dataset_query (mt/native-query {:query "select * from checkins"})}]
      (let [q   (str "SELECT * FROM {{#" card-id "}} LIMIT 2")
            tt  (lib-native/extract-template-tags q)
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
(deftest ^:parallel field-filter-param-test
  (letfn [(is-count-= [expected-count table field value-type value]
            (let [query (field-filter-count-query table field value-type value)]
              (mt/with-native-query-testing-context query
                (is (= expected-count
                       (run-count-query query))))))]
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (testing "temporal field filters"
        ;; TIMEZONE FIXME — The excluded drivers don't have TIME types, so the `attempted-murders` dataset doesn't
        ;; currently work. We should use the closest equivalent types (e.g. `DATETIME` or `TIMESTAMP` so we can still
        ;; load the dataset and run tests using this dataset such as these, which doesn't even use the TIME type.
        (when (mt/supports-time-type? driver/*driver*)
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

(deftest ^:parallel filter-nested-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :nested-queries)
    (testing "We should be able to apply filters to queries that use native queries with parameters as their source (#9802)"
      (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query (mt/native-query (qp.compile/compile (mt/mbql-query checkins)))}]
        (let [query (assoc (mt/mbql-query nil
                             {:source-table (format "card__%d" card-id)})
                           :parameters [{:type   :date/all-options
                                         :target [:dimension (mt/$ids *checkins.date)] ; expands to appropriate field-literal form
                                         :value  "2014-01-06"}])]
          (is (= [[182 "2014-01-06T00:00:00Z" 5 31]]
                 (mt/formatted-rows :checkins
                   (qp/process-query query)))))))))

(deftest ^:parallel string-escape-test
  ;; test `:sql` drivers that support native parameters
  (mt/test-drivers (set (filter #(isa? driver/hierarchy % :sql) (mt/normal-drivers-with-feature :native-parameters)))
    (testing "Make sure field filter parameters are properly escaped"
      (let [query   (field-filter-count-query :venues :name :text "Tito's Tacos")
            results (qp/process-query query)]
        (is (= [[1]]
               (mt/formatted-rows [int] results)))))))

(deftest ^:parallel native-with-spliced-params-test
  (testing "Make sure we can convert a parameterized query to a native query with spliced params"
    (testing "Multiple values"
      (mt/dataset airports
        (is (= {:query  "SELECT NAME FROM COUNTRY WHERE \"PUBLIC\".\"COUNTRY\".\"NAME\" IN ('US', 'MX')"
                :params nil}
               (qp.compile/compile-and-splice-parameters
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
                               :value  ["US" "MX"]}]})))))))

(deftest ^:parallel native-with-param-options-different-than-tag-type-test
  (testing "Overriding the widget type in parameters should drop case-senstive option when incompatible"
    (mt/dataset airports
      (is (= {:query  "SELECT NAME FROM COUNTRY WHERE (\"PUBLIC\".\"COUNTRY\".\"NAME\" = 'US')"
              :params nil}
             (qp.compile/compile-and-splice-parameters
               {:type       :native
                :native     {:query         "SELECT NAME FROM COUNTRY WHERE {{country}}"
                             :template-tags {"country"
                                             {:name         "country"
                                              :display-name "Country"
                                              :type         :dimension
                                              :dimension    [:field (mt/id :country :name) nil]
                                              :options      {:case-sensitive false}
                                              :widget-type  :string/contains}}}
                :database   (mt/id)
                :parameters [{:type   :string/=
                              :target [:dimension [:template-tag "country"]]
                              :value  ["US"]}]})))))
  (testing "Overriding the widget type in parameters should not drop case-senstive option when compatible"
    (mt/dataset airports
      (is (= {:query  "SELECT NAME FROM COUNTRY WHERE (LOWER(\"PUBLIC\".\"COUNTRY\".\"NAME\") LIKE '%us')"
              :params nil}
             (qp.compile/compile-and-splice-parameters
               {:type       :native
                :native     {:query         "SELECT NAME FROM COUNTRY WHERE {{country}}"
                             :template-tags {"country"
                                             {:name         "country"
                                              :display-name "Country"
                                              :type         :dimension
                                              :dimension    [:field (mt/id :country :name) nil]
                                              :options      {:case-sensitive false}
                                              :widget-type  :string/contains}}}
                :database   (mt/id)
                :parameters [{:type   :string/ends-with
                              :target [:dimension [:template-tag "country"]]
                              :value  ["US"]}]}))))))

(deftest ^:parallel native-with-spliced-params-test-2
  (testing "Make sure we can convert a parameterized query to a native query with spliced params"
    (testing "Comma-separated numbers"
      (is (= {:query  "SELECT * FROM VENUES WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" IN (1, 2)"
              :params []}
             (qp.compile/compile-and-splice-parameters
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

(deftest ^:parallel native-with-spliced-params-test-3
  (testing "Make sure we can convert a parameterized query to a native query with spliced params"
    (testing "Comma-separated numbers in a number field"
      ;; this is an undocumented feature but lots of people rely on it, so we want it to continue working.
      (is (= {:query "SELECT * FROM VENUES WHERE price IN (1, 2, 3)"
              :params []}
             (qp.compile/compile-and-splice-parameters
              {:type :native
               :native {:query "SELECT * FROM VENUES WHERE price IN ({{number_comma}})"
                        :template-tags {"number_comma"
                                        {:name "number_comma"
                                         :display-name "Number Comma"
                                         :type :number}}}
               :database (mt/id)
               :parameters [{:type "number/="
                             :value ["1,2,3"]
                             :target [:variable [:template-tag "number_comma"]]}]}))))))

(deftest ^:parallel native-with-spliced-params-test-4
  (testing "Make sure we can convert a parameterized query to a native query with spliced params"
    (testing "Trailing commas do not cause errors"
      ;; this is an undocumented feature but lots of people rely on it, so we want it to continue working.
      (is (= {:query "SELECT * FROM VENUES WHERE price IN (1, 2)"
              :params []}
             (qp.compile/compile-and-splice-parameters
              {:type :native
               :native {:query "SELECT * FROM VENUES WHERE price IN ({{number_comma}})"
                        :template-tags {"number_comma"
                                        {:name "number_comma"
                                         :display-name "Number Comma"
                                         :type :number
                                         :dimension [:field (mt/id :venues :price) nil]}}}
               :database (mt/id)
               :parameters [{:type "number/="
                             :value ["1,2,"]
                             :target [:variable [:template-tag "number_comma"]]}]}))))))

(deftest ^:parallel params-in-comments-test
  (testing "Params in SQL comments are ignored"
    (testing "Single-line comments"
      (mt/dataset airports
                  (is (= {:query  "SELECT NAME FROM COUNTRY WHERE \"PUBLIC\".\"COUNTRY\".\"NAME\" IN ('US', 'MX') -- {{ignoreme}}"
                          :params nil}
                         (qp.compile/compile-and-splice-parameters
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
                                         :value  ["US" "MX"]}]})))))))

(deftest ^:parallel params-in-comments-test-2
  (testing "Params in SQL comments are ignored"
    (testing "Multi-line comments"
      (is (= {:query  "SELECT * FROM VENUES WHERE\n/*\n{{ignoreme}}\n*/ \"PUBLIC\".\"VENUES\".\"PRICE\" IN (1, 2)"
              :params []}
             (qp.compile/compile-and-splice-parameters
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

(deftest ^:parallel better-error-when-parameter-mismatch
  (mt/test-drivers (->> (mt/normal-drivers-with-feature :native-parameters)
                        (filter #(isa? driver/hierarchy % :sql))
                        ;; These do not support ParameterMetadata.getParameterCount
                        (remove #{:athena
                                  :bigquery-cloud-sdk
                                  :presto-jdbc
                                  :redshift
                                  :snowflake
                                  :sparksql
                                  :vertica}))
    (is (thrown-with-msg?
          Exception
          #"It looks like we got more parameters than we can handle, remember that parameters cannot be used in comments or as identifiers."
          (qp/process-query
            {:type       :native
             :native     {:query         "SELECT * FROM \n[[-- {{name}}]]\n VENUES [[WHERE {{name}} = price]]"
                          :template-tags {"name"
                                          {:name         "name"
                                           :display-name "Name"
                                           :type         :text}}}
             :database   (mt/id)
             :parameters [{:type   :category
                           :target [:variable [:template-tag "name"]]
                           :value "foobar"}]})))))

(deftest ^:parallel ignore-parameters-for-unparameterized-native-query-test
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

(deftest ^:parallel legacy-parameters-with-no-widget-type-test
  (testing "Legacy queries with parameters that don't specify `:widget-type` should still work (#20643)"
    (mt/dataset test-data
      (let [query (mt/native-query
                    {:query         "SELECT count(*) FROM products WHERE {{cat}};"
                     :template-tags {"cat" {:id           "__MY_CAT__"
                                            :name         "cat"
                                            :display-name "Cat"
                                            :type         :dimension
                                            :dimension    [:field (mt/id :products :category) nil]}}})]
        (is (= [200]
               (mt/first-row (qp/process-query query))))))))

(deftest ^:parallel date-parameter-for-native-query-with-nested-mbql-query-test
  (testing "Should be able to have a native query with a nested MBQL query and a date parameter (#21246)"
    (mt/dataset test-data
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

(deftest ^:parallel multiple-native-query-parameters-test
  (mt/dataset test-data
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

(deftest ^:parallel inlined-number-test
  (testing "Number parameters are inlined into the SQL query and not parameterized (#29690)"
    (mt/dataset test-data
      (is (= {:query  "SELECT NOW() - INTERVAL '30 DAYS'"
              :params []}
             (qp.compile/compile-and-splice-parameters
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

(deftest sql-permissions-but-no-card-permissions-template-tag-test
  (testing "If we have full SQL perms for a DW but no Card perms we shouldn't be able to include it with a ref or template tag"
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :nested-queries :native-parameter-card-reference)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection {collection-1-id :id} {}
                       :model/Collection {collection-2-id :id} {}

                       :model/Card
                       {card-1-id :id}
                       {:collection_id collection-1-id
                        :dataset_query (mt/mbql-query venues {:fields   [$id $name]
                                                              :order-by [[:asc $id]]
                                                              :limit    2})}

                       :model/Card
                       {card-2-id :id, :as card-2}
                       {:collection_id collection-2-id
                        :dataset_query (mt/native-query
                                         {:query         (mt/native-query-with-card-template-tag driver/*driver* "card")
                                          :template-tags {"card" {:name         "card"
                                                                  :display-name "card"
                                                                  :type         :card
                                                                  :card-id      card-1-id}}})}]
          (testing (format "\nCollection 1 ID = %d, Card 1 ID = %d; Collection 2 ID = %d, Card 2 ID = %d"
                           collection-1-id card-1-id collection-2-id card-2-id)
            (mt/with-test-user :rasta
              (testing "Sanity check: shouldn't be able to run Card as MBQL query"
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You do not have permissions to view Card \d+"
                     (qp/process-query {:database (mt/id), :type :query, :query {:source-table (format "card__%d" card-2-id)}}))))
              (testing "Sanity check: SHOULD be able to run a native query"
                (testing (str "COMPILED = \n" (u/pprint-to-str (qp.compile/compile (:dataset_query card-2))))
                  (is (= [[1 "Red Medicine"]
                          [2 "Stout Burgers & Beers"]]
                         (mt/formatted-rows
                          [int str]
                          (qp/process-query {:database (mt/id)
                                             :type     :native
                                             :native   (dissoc (qp.compile/compile (:dataset_query card-2))
                                                               :metabase.models.query.permissions/referenced-card-ids)}))))))
              (let [query (mt/native-query
                            {:query         (mt/native-query-with-card-template-tag driver/*driver* "card")
                             :template-tags {"card" {:name         "card"
                                                     :display-name "card"
                                                     :type         :card
                                                     :card-id      card-2-id}}})]
                (testing "SHOULD NOT be able to run native query with Card ID template tag"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"\QYou do not have permissions to run this query.\E"
                       (qp/process-query query))))
                (testing "Exception should NOT include the compiled native query"
                  (try
                    (qp/process-query query)
                    (is (not ::here?)
                        "Should never get here, query should throw an Exception")
                    (catch Throwable e
                      (doseq [data (keep ex-data (u/full-exception-chain e))]
                        (walk/postwalk
                         (fn [form]
                           (when (string? form)
                             (is (not (re-find #"SELECT" form))))
                           form)
                         data)))))
                (testing (str "If we have permissions for Card 2's Collection (but not Card 1's) we should be able to"
                              " run a native query referencing Card 2, even tho it references Card 1 (#15131)")
                  (perms/grant-collection-read-permissions! (perms-group/all-users) collection-2-id)
                  ;; need to call [[mt/with-test-user]] again so [[metabase.api.common/*current-user-permissions-set*]]
                  ;; gets rebound with the updated permissions. This will be fixed in #45001
                  (mt/with-test-user :rasta
                    (is (= [[1 "Red Medicine"]
                            [2 "Stout Burgers & Beers"]]
                           (mt/formatted-rows
                            [int str]
                            (qp/process-query query))))))))))))))
