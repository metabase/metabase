(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require [cheshire
             [core :as json]
             [generate :as json.generate]]
            [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.tools.logging :as log]
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
                                                   [:= [:field-id (mt/id table field)] i]))})
          {:keys [query]} (qp/query->native mbql-query)
          query           (reduce
                           (fn [query [field]]
                             ;; TODO — currently only supports one field
                             (str/replace query (re-pattern #"= .*") (format "= {{%s}}" (name field))))
                           query
                           field->type+value)]
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

(defn- count-query [table field->type+value {:keys [defaults?]}]
  {:database   (mt/id)
   :type       :native
   :native     (assoc (native-count-query driver/*driver* table field->type+value)
                      :template-tags (into {} (for [[field [param-type v]] field->type+value]
                                                [field (cond-> {:name         (name field)
                                                                :display-name (name field)
                                                                :type         (or (namespace param-type)
                                                                                  (name param-type))}
                                                         defaults? (assoc :default v))])))
   :parameters (when-not defaults?
                 (for [[field [param-type v]] field->type+value]
                   {:type   param-type
                    :target [:variable [:template-tag (name field)]]
                    :value  v}))})

(deftest param-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (doseq [[message {:keys [expected-count table param-name param-type value exclude-drivers]}]
            {"text params"   {:expected-count 1
                              :table          :venues
                              :param-name     :name
                              :param-type     :text
                              :value          "In-N-Out Burger"}
             "number params" {:expected-count 22
                              :table          :venues
                              :param-name     :price
                              :param-type     :number
                              :value          "1"}
             "date params"   {:expected-count  1
                              ;; FIXME — This is not currently working on SQLite, probably because SQLite's
                              ;; implementation of temporal types is wacko.
                              :exclude-drivers #{:sqlite}
                              :table           :users
                              :param-name      :last_login
                              :param-type      :date/single
                              :value           "2014-08-02T09:30Z"}}
            :when (not (contains? exclude-drivers driver/*driver*))]
      (testing (str "\n" message)
        (doseq [[message options] {"Query with all supplied parameters" nil
                                   "Query using default values"         {:defaults? true}}]
          (testing (str "\n" message)
            (let [query (count-query table {param-name [param-type value]} options)]
              (testing (str "\nquery =\n" (u/pprint-to-str query))
                (is (= expected-count
                       (ffirst
                        (mt/formatted-rows [int]
                          (qp/process-query query))))
                    (format "count with of %s with %s = %s should be %d"
                            (name table)
                            (name param-name)
                            value
                            expected-count))))))))))
