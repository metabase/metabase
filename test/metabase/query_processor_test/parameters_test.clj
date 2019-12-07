(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [honeysql
             [core :as hsql]
             [format :as h.format]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test.data.sql :as sql.tx]
            [metabase.util.honeysql-extensions :as hx]
            [cheshire.core :as json]
            [toucan.db :as db]))

(defn- table-identifier [table-key]
  (let [table-name (db/select-one-field :name Table, :id (mt/id table-key))]
    (apply hx/identifier :table (sql.tx/qualified-name-components driver/*driver* (:name (mt/db)) table-name))))

(defn- field-identifier [table-key field-key]
  (let [table-name (db/select-one-field :name Table, :id (mt/id table-key))
        field-name (db/select-one-field :name Field, :id (mt/id table-key field-key))]
    (apply hx/identifier :field (sql.tx/qualified-name-components driver/*driver* (:name (mt/db)) table-name field-name))))

(defn- honeysql->sql [honeysql]
  (first (sql.qp/format-honeysql driver/*driver* honeysql)))

(extend-protocol h.format/ToSql
  Param
  (to-sql [{:keys [param-name]}]
    (format "{{%s}}" (name param-name)))

  FieldName
  (to-sql [{:keys [table-name field-name]}]
    (h.format/to-sql (field-identifier table-name field-name))))

(defmulti native-count-query
  ^{:arglists '([driver table field->type+value])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

;; TODO - these should go in test extensions namespaces, not here

(defmethod native-count-query :sql
  [driver table field->type+value]
  (driver/with-driver driver
    {:query (honeysql->sql
             {:select [[:%count.* :count]]
              :from   [(table-identifier table)]
              :where  (into [:and] (for [[field] field->type+value]
                                     [:= (field-identifier table field) (hsql/raw (format "{{%s}}" (name field)))]))})}))

(defmethod native-count-query :mongo
  [_ table field->type+value]
  {:projections [:count]
   :query       (json/generate-string
                 [{:$match (into {} (for [[field [param-type]] field->type+value
                                          :let                 [base-type (:base_type (Field (mt/id table field)))
                                                                xform     (case param-type
                                                                            :number      (fn [k] {:$numberInt k})
                                                                            :text        identity
                                                                            :date/single (fn [k] {:$date k}))]]
                                      [(name field) (xform (format "{{%s}}" (name field)))]))}
                  {:$group {"_id" nil, "count" {:$sum 1}}}
                  {:$sort {"_id" 1}}
                  {:$project {"_id" false, "count" true}}])
   :collection  (name table)})

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
    (testing "date params"
      (count= 1
              :users {:last_login [:date/single "2014-08-02T09:30Z"]}))
    (testing "optional params"
      ;; TODO
      )))
