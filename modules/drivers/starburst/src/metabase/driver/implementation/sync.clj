;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at

;;     http://www.apache.org/licenses/LICENSE-2.0

;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;;
(ns metabase.driver.implementation.sync
  "Sync implementation for Starburst driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
            [metabase.driver.sql.util :as sql.u]
            [metabase.util.log :as log]))

(def starburst-type->base-type
  "Function that returns a `base-type` for the given `straburst-type` (can be a keyword or string)."
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"(?i)boolean"                    :type/Boolean]
    [#"(?i)tinyint"                    :type/Integer]
    [#"(?i)smallint"                   :type/Integer]
    [#"(?i)integer"                    :type/Integer]
    [#"(?i)bigint"                     :type/BigInteger]
    [#"(?i)real"                       :type/Float]
    [#"(?i)double"                     :type/Float]
    [#"(?i)decimal.*"                  :type/Decimal]
    [#"(?i)varchar.*"                  :type/Text]
    [#"(?i)char.*"                     :type/Text]
    [#"(?i)varbinary.*"                :type/*]
    [#"(?i)json"                       :type/Text]
    [#"(?i)date"                       :type/Date]
    [#"(?i)^timestamp$"                :type/DateTime]
    [#"(?i)^timestamp\(\d+\)$"         :type/DateTime]
    [#"(?i)^timestamp with time zone$" :type/DateTimeWithTZ]
    [#"(?i)^timestamp with time zone\(\d+\)$" :type/DateTimeWithTZ]
    [#"(?i)^timestamp\(\d+\) with time zone$" :type/DateTimeWithTZ]
    [#"(?i)^time$"                     :type/Time]
    [#"(?i)^time\(\d+\)$"              :type/Time]
    [#"(?i)^time with time zone$"      :type/TimeWithTZ]
    [#"(?i)^time with time zone\(\d+\)$"  :type/TimeWithTZ]
    [#"(?i)^time\(\d+\) with time zone$"  :type/TimeWithTZ]
    [#"(?i)array"                      :type/Array]
    [#"(?i)map"                        :type/Dictionary]
    [#"(?i)row.*"                      :type/*]
    [#".*"                             :type/*]]))

(defn describe-catalog-sql
  "The SHOW SCHEMAS statement that will list all schemas for the given `catalog`."
  {:added "0.39.0"}
  [driver catalog]
  (str "SHOW SCHEMAS FROM " (sql.u/quote-name driver :database catalog)))

(defn describe-schema-sql
  "The SHOW TABLES statement that will list all tables for the given `catalog` and `schema`."
  {:added "0.39.0"}
  [driver catalog schema]
  (str "SHOW TABLES FROM " (sql.u/quote-name driver :schema catalog schema)))

(defn describe-table-sql
  "The DESCRIBE  statement that will list information about the given `table`, in the given `catalog` and schema`."
  {:added "0.39.0"}
  [driver catalog schema table]
  (str "DESCRIBE " (sql.u/quote-name driver :table catalog schema table)))

(def excluded-schemas
  "The set of schemas that should be excluded when querying all schemas."
  #{"information_schema"})

(defmethod sql-jdbc.sync/database-type->base-type :starburst
  [_ field-type]
  (let [base-type (starburst-type->base-type field-type)]
    (log/debugf "database-type->base-type %s -> %s" field-type base-type)
    base-type))

(defn- have-select-privilege?
  "Checks whether the connected user has permission to select from the given `table-name`, in the given `schema`."
  [driver conn schema table-name]
  (try
    (let [sql (sql-jdbc.describe-database/simple-select-probe-query driver schema table-name)]
        ;; if the query completes without throwing an Exception, we can SELECT from this table
      (jdbc/reducible-query {:connection conn} sql)
      true)
    (catch Throwable _
      false)))

(defn- describe-schema
  "Gets a set of maps for all tables in the given `catalog` and `schema`."
  [driver conn catalog schema]
  (with-open [stmt (.createStatement conn)]
    (let [sql (describe-schema-sql driver catalog schema)
          rs (sql-jdbc.execute/execute-statement! driver stmt sql)]
      (into
       #{}
       (comp (filter (fn [{table-name :table}]
                                (have-select-privilege? driver conn schema table-name)))
                      (map (fn [{table-name :table}]
                             {:name        table-name
                              :schema      schema})))
       (jdbc/reducible-result-set rs {})))))

(defn- all-schemas
  "Gets a set of maps for all tables in all schemas in the given `catalog`."
  [driver conn catalog]
  (with-open [stmt (.createStatement conn)]
    (let [sql (describe-catalog-sql driver catalog)
          rs (sql-jdbc.execute/execute-statement! driver stmt sql)]
      (into []
            (map (fn [{:keys [schema] :as full}]
                   (when-not (contains? excluded-schemas schema)
                     (describe-schema driver conn catalog schema))))
            (jdbc/reducible-result-set rs {})))))

(defmethod driver/describe-database :starburst
  [driver {{:keys [catalog schema] :as details} :details :as database}]
  (with-open [conn (-> (sql-jdbc.conn/db->pooled-connection-spec database)
                       jdbc/get-connection)]
    (let [schemas (if schema #{(describe-schema driver conn catalog schema)}
                      (all-schemas driver conn catalog))]
      {:tables (reduce set/union schemas)})))

(defmethod driver/describe-table :starburst
  [driver {{:keys [catalog] :as details} :details :as database} {schema :schema, table-name :name}]
  (with-open [conn (-> (sql-jdbc.conn/db->pooled-connection-spec database)
                       jdbc/get-connection)
              stmt (.createStatement conn)]
    (let [sql (describe-table-sql driver catalog schema table-name)
          rs (sql-jdbc.execute/execute-statement! driver stmt sql)]
      {:schema schema
       :name   table-name
       :fields (into
                #{}
                (map-indexed (fn [idx {:keys [column type] :as col}]
                               {:name column
                                :database-type type
                                :base-type         (starburst-type->base-type type)
                                :database-position idx}))
                (jdbc/reducible-result-set rs {}))})))

(defmethod driver/db-default-timezone :starburst
  [driver {{:keys [catalog] :as details} :details :as database}]
  (with-open [conn (-> (sql-jdbc.conn/db->pooled-connection-spec database)
                       jdbc/get-connection)
              stmt (.createStatement conn)]
    (let [rs (sql-jdbc.execute/execute-statement! driver stmt "SELECT current_timezone() as \"time-zone\"")
          [{:keys [time-zone]}] (jdbc/result-set-seq rs)]
      time-zone)))
