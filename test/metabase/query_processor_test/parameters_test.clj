(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require [cheshire.core :as json]
            [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.tools.logging :as log]
            [cheshire.generate :as json.generate]
            [metabase
             [driver :as driver]
             [models :refer [Field]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]])
  (:import com.fasterxml.jackson.core.JsonGenerator))

(defmulti native-count-query
  "Generate a native query for the count of rows in `table` matching a set of conditions defined by `field->type+value`,
  which looks like

    {field-name [param-type param-value]}

  e.g.

    (native-count-query :mongo :venues {:price [:number 2]})"
  ^{:arglists '([driver table field->type+value])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

;; TODO - these should go in test extensions namespaces, not here

(defmethod native-count-query :sql
  [driver table field->type+value]
  (driver/with-driver driver
    (let [mbql-query      (mt/mbql-query nil
                            {:source-table (mt/id table)
                             :aggregation  [[:count]]
                             :filter       (into [:and]
                                                 (for [[i [field]] (map-indexed vector field->type+value)]
                                                   [:= (mt/id table field) i]))})
          {:keys [query]} (qp/query->native mbql-query)
          query           (reduce
                           (fn [query [i [field]]]
                             (str/replace query (re-pattern (format "= %d" i)) (format "= {{%s}}" (name field))))
                           query
                           (map-indexed vector field->type+value))]
      (log/tracef "%s\n->\n%s\n->\n%s"
                  (pr-str (list 'native-count-query driver table field->type+value))
                  (pr-str mbql-query)
                  query)
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

(defmethod native-count-query :mongo
  [driver table field->type+value]
  (driver/with-driver driver
    {:projections [:count]
     :query       (json/generate-string
                   [{:$match (into {} (for [[field [param-type]] field->type+value
                                            :let                 [base-type (:base_type (Field (mt/id table field)))]]
                                        [(name field) (json-raw (format "{{%s}}" (name field)))]))}
                    {:$group {"_id" nil, "count" {:$sum 1}}}
                    {:$sort {"_id" 1}}
                    {:$project {"_id" false, "count" true}}])
     :collection  (name table)}))

(defn- count-query [table field->type+value]
  {:database   (mt/id)
   :type       :native
   :native     (assoc (native-count-query driver/*driver* table field->type+value)
                      :template-tags (into {} (for [[field [param-type]] field->type+value]
                                                [field {:name         (name field)
                                                        :display-name (name field)
                                                        :type         (or (namespace param-type)
                                                                          (name param-type))}])))
   :parameters (for [[field [param-type v]] field->type+value]
                 {:type   param-type
                  :target [:variable [:template-tag (name field)]]
                  :value  v})})

(defn- count= [expected table field->type+value]
  (let [query (count-query table field->type+value)]
    (testing (str "\nquery =\n" (u/pprint-to-str query))
      (is (= expected
             (ffirst
              (mt/formatted-rows [int]
                (qp/process-query query))))
          (format "count with of %s with %s should be %d"
                  (name table)
                  (str/join " and " (for [[field [_ v]] field->type+value]
                                      (format "%s = %s" (name field) v)))
                  expected)))))

(deftest param-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (testing "text params"
      (count= 1
              :venues {:name [:text "In-N-Out Burger"]}))
    (testing "number params"
      (count= 22
              :venues {:price [:number "1"]}))
    ;; FIXME — This is not currently working on SQLite, probably because SQLite's implementation of temporal types is
    ;; wacko.
    (when-not (= driver/*driver* :sqlite)
      (testing "date params"
        (count= 1
                :users {:last_login [:date/single "2014-08-02T09:30Z"]})))))

;; TODO - tests for optional params

;; TODO - field-filter params, only for drivers that support `:native-parameters-field-filters`. Currently, this is
;; only SQL, and this feature is tested elsewhere. But we should add some tests here too.
