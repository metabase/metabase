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
  (getName [_] "HTTP API"))

(defn json-path
  [body query]
  (JsonPath/read body query (into-array Predicate [])))

(defn execute-query
  [query]
  (let [query         (if (string? (:query (:native query)))
                        (json/parse-string (:query (:native query)) keyword)
                        (:query (:native query)))
        url           (:url query)
        result        (client/get url {:accept :json, :as :json})
        items-path    (or (:path (:result query)) "$")
        items         (json-path (walk/stringify-keys (:body result)) items-path)
        fields-paths  (or (:fields (:result query)) (keys (first items)))]
    {:columns (for [fields-path fields-paths] (keyword fields-path))
     :rows    (for [item items]
                (for [fields-path fields-paths]
                  (json-path item fields-path)))}))

(defn- mbql->native
  [query]
  (let [table     (:source-table (:query query))
        table-def (database->table-def (:database query) (:name table))]
    {:query (dissoc table-def :name)
     :mbql? true}))

(defn- database->definitions
  [database]
  (json/parse-string (:definitions (:details database)) keyword))

(defn- database->table-defs
  [database]
  (or (:tables (database->definitions database)) []))

(defn- database->table-def
  [database name]
  (first (filter #(= (:name %) name) (database->table-defs database))))

(defn- describe-database
  [database]
  (let [table-defs (database->table-defs database)]
    {:tables (set (for [table-def table-defs]
                    {:name   (:name table-def)
                     :schema (:schema table-def)}))}))

(defn- describe-table
  [database table]
  (let [table-def  (database->table-def database (:name table))]
    {:name   (:name table-def)
     :schema (:schema table-def)
     :fields (set [])})) ; {:name "height", :base-type :type/Integer, :database-type "number"}

(u/strict-extend HTTPAPIDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
          {:can-connect?          (constantly true)
           :describe-database     (fn [_ database]       (describe-database database))
           :describe-table        (fn [_ database table] (describe-table    database table))
           :details-fields        (constantly [{:name         "definitions"
                                                :display-name "Table Definitions"}])
           :mbql->native          (fn [_ query] (mbql->native query))
           :execute-query         (fn [_ query] (execute-query query))}))

(defn -init-driver
  "Register the BigQuery driver"
  []
  (driver/register-driver! :http (HTTPAPIDriver.)))
