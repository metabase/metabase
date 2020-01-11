(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require [cheshire
             [core :as json]
             [generate :as json.generate]]
            [clojure
             [string :as str]
             [test :refer :all]]
            [metabase
             [driver :as driver]
             [models :refer [Field]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]])
  (:import com.fasterxml.jackson.core.JsonGenerator))

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

(defmulti ^:private count-with-template-tag-query
  "Generate a native query for the count of rows in `table` matching a set of conditions where `field-name` is equal to
  a param `value`."
  ^{:arglists '([driver table-name field-name param-type])}
  mt/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod count-with-template-tag-query :sql
  [driver table field param-type]
  (driver/with-driver driver
    (let [mbql-query      (mt/mbql-query nil
                            {:source-table (mt/id table)
                             :aggregation  [[:count]]
                             :filter       [:= [:field-id (mt/id table field)] 1]})
          {:keys [query]} (qp/query->native mbql-query)
          query           (str/replace query (re-pattern #"= .*") (format "= {{%s}}" (name field)))]
      {:query query})))

(defn- json-raw
  "Wrap a string so it will be spliced directly into resulting JSON as-is. Analogous to HoneySQL `raw`."
  [^String s]
  (reify json.generate/JSONable
    (to-json [_ generator]
      (.writeRawValue ^JsonGenerator generator s))))

(deftest json-raw-test
  (testing "Make sure the `json-raw` util fn actually works the way we expect it to"
    (is (= "{\"x\":{{param}}}"
           (json/generate-string {:x (json-raw "{{param}}")})))))

(defmethod count-with-template-tag-query :mongo
  [driver table-name field-name param-type]
  (let [{base-type :base_type} (Field (driver/with-driver driver (mt/id table-name field-name)))]
    {:projections [:count]
     :query       (json/generate-string
                   [{:$match {(name field-name) (json-raw (format "{{%s}}" (name field-name)))}}
                    {:$group {"_id" nil, "count" {:$sum 1}}}
                    {:$sort {"_id" 1}}
                    {:$project {"_id" false, "count" true}}])
     :collection  (name table-name)}))

(defn- template-tag-count-query [table field param-type param-value {:keys [defaults?]}]
  (let [query {:database (mt/id)
               :type     :native
               :native   (assoc (count-with-template-tag-query driver/*driver* table field param-type)
                                :template-tags {(name field) {:name         (name field)
                                                              :display-name (name field)
                                                              :type         (or (namespace param-type)
                                                                                (name param-type))}})}]
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

(defmulti ^:private count-with-field-filter-query
  ^{:arglists '([driver table-name field-name])}
  mt/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod count-with-field-filter-query :sql
  [driver table field]
  (driver/with-driver driver
    (let [mbql-query      (mt/mbql-query nil
                            {:source-table (mt/id table)
                             :aggregation  [[:count]]
                             :filter       [:= [:field-id (mt/id table field)] 1]})
          {:keys [query]} (qp/query->native mbql-query)
          query           (str/replace query (re-pattern #"WHERE .* = .*") (format "WHERE {{%s}}" (name field)))]
      {:query query})))

(defmethod count-with-field-filter-query :mongo
  [driver table-name field-name]
  (let [{base-type :base_type} (Field (driver/with-driver driver (mt/id table-name field-name)))]
    {:projections [:count]
     :query       (json/generate-string
                   [{:$match (json-raw (format "{{%s}}" (name field-name)))}
                    {:$group {"_id" nil, "count" {:$sum 1}}}
                    {:$sort {"_id" 1}}
                    {:$project {"_id" false, "count" true}}])
     :collection  (name table-name)}))

(defn- field-filter-count-query [table field value-type value]
  {:database   (mt/id)
   :type       :native
   :native     (assoc (count-with-field-filter-query driver/*driver* table field)
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
