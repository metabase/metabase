(ns metabase.driver.http
  "HTTP API driver."
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.driver :as driver]
            [metabase.util :as u]
            [clj-http.client :as client])
  (:import [com.jayway.jsonpath JsonPath Predicate]))

(defrecord HTTPAPIDriver []
  clojure.lang.Named
  (getName [_] "HTTP"))

(declare compile-expression compile-function)

(defn find-first
  [f coll]
  (first (filter f coll)))

(defn- database->definitions
  [database]
  (json/parse-string (:definitions (:details database)) keyword))

(defn- database->table-defs
  [database]
  (or (:tables (database->definitions database)) []))

(defn- database->table-def
  [database name]
  (first (filter #(= (:name %) name) (database->table-defs database))))

(defn table-def->field
  [table-def name]
  (find-first #(= (:name %) name) (:fields table-def)))

(defn json-path
  [query body]
  (JsonPath/read body query (into-array Predicate [])))

(defn compile-function
  [[operator & arguments]]
  (case (keyword operator)
    :count count
    :sum   #(reduce + (map (compile-expression (first arguments)) %))
    :float #(Float/parseFloat ((compile-expression (first arguments)) %))
           (throw (Exception. (str "Unknown operator: " operator)))))

(defn compile-expression
  [expr]
  (cond
    (string? expr)  (partial json-path expr)
    (number? expr)  (constantly expr)
    (vector? expr)  (compile-function expr)
    :else           (throw (Exception. (str "Unknown expression: " expr)))))

(defn aggregate
  [rows metrics breakouts]
  (let [breakouts-fns (map compile-expression breakouts)
        breakout-fn   (fn [row] (for [breakout breakouts-fns] (breakout row)))
        metrics-fns   (map compile-expression metrics)]
    (for [[breakout-key breakout-rows] (group-by breakout-fn rows)]
      (concat breakout-key (for [metrics-fn metrics-fns]
                             (metrics-fn breakout-rows))))))

(defn extract-fields
  [rows fields]
  (let [fields-fns (map compile-expression fields)]
    (for [row rows]
      (for [field-fn fields-fns]
        (field-fn row)))))

(defn field-names
  [fields]
  (for [field fields]
    (keyword (if (string? field)
               field
               (json/generate-string field)))))

(defn execute-query
  [query]
  (let [query         (if (string? (:query (:native query)))
                        (json/parse-string (:query (:native query)) keyword)
                        (:query (:native query)))
        result        (client/request {:method  (or (:method query) :get)
                                       :url     (:url query)
                                       :headers (:headers query)
                                       :accept  :json
                                       :as      :json})
        rows-path     (or (:path (:result query)) "$")
        rows          (json-path rows-path (walk/stringify-keys (:body result)))
        fields        (or (:fields (:result query)) (keys (first rows)))
        aggregations  (or (:aggregation (:result query)) [])
        breakouts     (or (:breakout (:result query)) [])
        raw           (and (= (count breakouts) 0) (= (count aggregations) 0))]
    {:columns (if raw
                (field-names fields)
                (field-names (concat breakouts aggregations)))
     :rows    (if raw
                (extract-fields rows fields)
                (aggregate rows aggregations breakouts))}))

(defn mbql-field->expression
  [table-def expr]
  (let [field (table-def->field table-def (:field-name expr))]
    (or (:expression field) (:name field))))

(defn mbql-aggregation->aggregation
  [table-def mbql-aggregation]
  (if (:field mbql-aggregation)
    [(:aggregation-type mbql-aggregation)
     (mbql-field->expression table-def (:field mbql-aggregation))]
    [(:aggregation-type mbql-aggregation)]))

(defn- mbql->native
  [query]
  (let [table       (:source-table (:query query))
        table-def   (database->table-def (:database query) (:name table))
        breakout    (map (partial mbql-field->expression table-def) (:breakout (:query query)))
        aggregation (map (partial mbql-aggregation->aggregation table-def) (:aggregation (:query query)))]
    {:query (merge (select-keys table-def [:method :url :headers])
                   {:result (merge (:result table-def)
                                   {:breakout     breakout
                                    :aggregation  aggregation})})
     :mbql? true}))

(defn- describe-database
  [database]
  (let [table-defs (database->table-defs database)]
    {:tables (set (for [table-def table-defs]
                    {:name   (:name table-def)
                     :schema (:schema table-def)}))}))

(def json-type->base-type
  {:string  :type/Text
   :number  :type/Float
   :boolean :type/Boolean})

(defn- describe-table
  [database table]
  (let [table-def  (database->table-def database (:name table))]
    {:name   (:name table-def)
     :schema (:schema table-def)
     :fields (set (for [field (:fields table-def)]
                    {:name          (:name field)
                     :database-type (:type field)
                     :base-type     (or (:base_type field)
                                        (json-type->base-type (keyword (:type field))))}))}))

(u/strict-extend HTTPAPIDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
          {:can-connect?          (constantly true)
           :describe-database     (fn [_ database]       (describe-database database))
           :describe-table        (fn [_ database table] (describe-table    database table))
           :details-fields        (constantly [{:name         "definitions"
                                                :display-name "Table Definitions"
                                                :type         :json
                                                :default      "{\n  \"tables\": [\n  ]\n}"}])
           :features              (constantly #{:basic-aggregations :expression-aggregations})
           :mbql->native          (fn [_ query] (mbql->native query))
           :execute-query         (fn [_ query] (execute-query query))}))

(defn -init-driver
  "Register the HTTP driver"
  []
  (driver/register-driver! :http (HTTPAPIDriver.)))
