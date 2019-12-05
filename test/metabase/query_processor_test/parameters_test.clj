(ns metabase.query-processor-test.parameters-test
  "Tests for support for parameterized queries in drivers that support it. (There are other tests for parameter support
  in various places; these are mainly for high-level verification that parameters are working.)"
  (:require [clojure.test :refer :all]
            [honeysql.format :as h.format]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test.data :as data]
            [metabase.test.data.sql :as sql.tx]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]))

;; ;; either a Field filter e.g. {{field}} that expands to <field = value> or a basic param e.g. {{field}} that expands
;; ;; to <value>
(p.types/defrecord+ Param [param-name])

(defn- param [param-name]
  (Param. param-name))

(p.types/defrecord+ FieldName [table-name field-name])

(defn- field [table-name field-name]
  (FieldName. table-name field-name))

;; ;; ;; wraps one or more params as well as query fragments strings. If *all* params are present the params should any
;; ;; ;; any fragments should get spliced in. Otherwise nothing should be spliced in.
;; (p.types/defrecord+ Optional [xs])

;; (defn- param->str [param]
;;   (condp instance? param
;;     Param
;;     (format "{{%s}}" (:field-name param))

;;     Optional
;;     (str "[["
;;          (str/join (for [x (:xs param)]
;;                      (param->str x)))
;;          "]]")

;;     param))

(defmulti native-count-query
  ^{:arglists '([driver table-name mbql-filter-clause])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- table-identifier [table-key]
  (let [table-name (db/select-one-field :name Table, :id (data/id table-key))]
    (apply hx/identifier :table (sql.tx/qualified-name-components driver/*driver* (:name (data/db)) table-name))))

(defn- field-identifier [table-key field-key]
  (let [table-name (db/select-one-field :name Table, :id (data/id table-key))
        field-name (db/select-one-field :name Field, :id (data/id table-key field-key))]
    (apply hx/identifier :field (sql.tx/qualified-name-components driver/*driver* (:name (data/db)) table-name field-name))))

(defn- honeysql->sql [honeysql]
  (first (sql.qp/format-honeysql driver/*driver* honeysql)))

(extend-protocol h.format/ToSql
  Param
  (to-sql [{:keys [param-name]}]
    (format "{{%s}}" (name param-name)))

  FieldName
  (to-sql [{:keys [table-name field-name]}]
    (h.format/to-sql (field-identifier table-name field-name))))

(defmethod native-count-query :sql
  [driver table-name filter-clause]
  (driver/with-driver driver
    {:query (honeysql->sql
             {:select [[:%count.* :count]]
              :from   [(table-identifier table-name)]
              :where  filter-clause})}))

(defmethod native-count-query :mongo
  [driver table-name filter-clause]
  (driver/with-driver driver
    (qp/query->native
      (mt/mbql-query nil
        {:source-table (data/id table-name)
         :aggregation  [[:count]]
         :filter       (mbql.u/replace filter-clause
                         (p :guard (partial instance? Param))
                         (format "{{%s}}" (name (:param-name p)))

                         (f :guard (partial instance? FieldName))
                         [:field-literal (name (:field-name f)) :type/*])}))))

(deftest param-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (testing "number params"
      (is (= 22
             (ffirst
              (mt/formatted-rows [int]
                (qp/process-query
                  {:database   (data/id)
                   :type       :native
                   :native     (assoc (native-count-query driver/*driver* :venues [:= (field :venues :price) (param :price)])
                                      :template-tags {:price {:name "price", :display-name "Price", :type :number}})
                   :parameters [{:type   :number
                                 :target [:variable [:template-tag "price"]]
                                 :value  "1"}]}))))))))

;; TODO - type = text

;; TODO - date filters

;; TODO - field filters (type = dimension)
#_{:native     {:query
                sql
                :template-tags {"date" {:name         "date"
                                        :display-name "Checkin Date"
                                        :type         :dimension
                                        :dimension    [:field-id (data/id :checkins :date)]}}}
   :parameters (when field-filter-param
                 [(merge {:target [:dimension [:template-tag "date"]]}
                         field-filter-param)])}
