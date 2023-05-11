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
(ns metabase.test.data.starburst
  "Starburst driver test extensions."
  (:require [clojure.string :as str]
            [metabase.config :as config]
            [metabase.connection-pool :as connection-pool]
            [metabase.driver :as driver]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.test.data.sql-jdbc.load-data :as load-data]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util :as u])
  (:import [java.sql Connection DriverManager PreparedStatement]))

;; JDBC SQL
(sql-jdbc.tx/add-test-extensions! :starburst)

(def ^:private test-catalog-name "test_data")

(defmethod tx/sorts-nil-first? :starburst [_ _] false)

;; during unit tests don't treat Trino as having FK support
(defmethod driver/supports? [:starburst :foreign-keys] [_ _] (not config/is-test?))

(doseq [[base-type db-type] {:type/BigInteger             "BIGINT"
                             :type/Boolean                "BOOLEAN"
                             :type/Date                   "DATE"
                             :type/DateTime               "TIMESTAMP"
                             :type/DateTimeWithTZ         "TIMESTAMP WITH TIME ZONE"
                             :type/DateTimeWithZoneID     "TIMESTAMP WITH TIME ZONE"
                             :type/DateTimeWithZoneOffset "TIMESTAMP WITH TIME ZONE"
                             :type/Decimal                "DECIMAL"
                             :type/Float                  "DOUBLE"
                             :type/Integer                "INTEGER"
                             :type/Text                   "VARCHAR"
                             :type/Time                   "TIME"
                             :type/TimeWithTZ             "TIME WITH TIME ZONE"}]
  (defmethod sql.tx/field-base-type->sql-type [:starburst base-type] [_ _] db-type))

(defmethod tx/dbdef->connection-details :starburst
  [_ _ {:keys [_database-name]}]
  {:host                               (tx/db-test-env-var-or-throw :starburst :host "localhost")
   :port                               (tx/db-test-env-var :starburst :port "8082")
   :user                               (tx/db-test-env-var-or-throw :starburst :user "metabase")
   :additional-options                 (tx/db-test-env-var :starburst :additional-options nil)
   :ssl                                (tx/db-test-env-var :starburst :ssl "false")
   :kerberos                           (tx/db-test-env-var :starburst :kerberos "false")
   :kerberos-principal                 (tx/db-test-env-var :starburst :kerberos-principal nil)
   :kerberos-remote-service-name       (tx/db-test-env-var :starburst :kerberos-remote-service-name nil)
   :kerberos-use-canonical-hostname    (tx/db-test-env-var :starburst :kerberos-use-canonical-hostname nil)
   :kerberos-credential-cache-path     (tx/db-test-env-var :starburst :kerberos-credential-cache-path nil)
   :kerberos-keytab-path               (tx/db-test-env-var :starburst :kerberos-keytab-path nil)
   :kerberos-config-path               (tx/db-test-env-var :starburst :kerberos-config-path nil)
   :kerberos-service-principal-pattern (tx/db-test-env-var :starburst :kerberos-service-principal-pattern nil)
   :catalog                            test-catalog-name
   :schema                             (tx/db-test-env-var :starburst :schema nil)})

(defmethod execute/execute-sql! :starburst
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defn- load-data [dbdef tabledef]
  ;; the JDBC driver statements fail with a cryptic status 500 error if there are too many
  ;; parameters being set in a single statement; these numbers were arrived at empirically
  (let [chunk-size (case (:table-name tabledef)
                     "people" 30
                     "reviews" 40
                     "orders" 30
                     "venues" 50
                     "products" 50
                     "cities" 50
                     "sightings" 50
                     "incidents" 50
                     "checkins" 25
                     "airport" 50
                     100)
        load-fn    (load-data/make-load-data-fn load-data/load-data-add-ids
                                                (partial load-data/load-data-chunked pmap chunk-size))]
    (load-fn :starburst dbdef tabledef)))

(defmethod load-data/load-data! :starburst
  [_ dbdef tabledef]
  (load-data dbdef tabledef))

(defn- jdbc-spec->connection
  "This is to work around some weird interplay between clojure.java.jdbc caching behavior of connections based on URL,
  combined with the fact that the Trino driver apparently closes the connection when it closes a prepare statement.
  Therefore, create a fresh connection from the DriverManager."
  ^Connection [jdbc-spec]
  (DriverManager/getConnection (format "jdbc:%s:%s" (:subprotocol jdbc-spec) (:subname jdbc-spec))
                               (connection-pool/map->properties (select-keys jdbc-spec [:user :SSL]))))

(defmethod load-data/do-insert! :starburst
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    (with-open [conn (jdbc-spec->connection spec)]
      (doseq [[^String sql & params] statements]
        (try
          (with-open [^PreparedStatement stmt (.prepareStatement conn sql)]
            (sql-jdbc.execute/set-parameters! driver stmt params)
            (let [tbl-nm        ((comp last :components) (into {} table-identifier))
                  rows-affected (.executeUpdate stmt)]
              (println (format "[%s] Inserted %d rows into starburst table %s." driver rows-affected tbl-nm))))
          (catch Throwable e
            (throw (ex-info (format "[%s] Error executing SQL: %s" driver (ex-message e))
                            {:driver driver, :sql sql, :params params}
                            e))))))))

(defmethod sql.tx/drop-db-if-exists-sql :starburst [_ _] nil)
(defmethod sql.tx/create-db-sql         :starburst [_ _] nil)

(defmethod sql.tx/qualified-name-components :starburst
  ;; use the default schema from the in-memory connector
  ([_ _db-name]                      [test-catalog-name "default"])
  ([_ db-name table-name]            [test-catalog-name "default" (tx/db-qualified-table-name db-name table-name)])
  ([_ db-name table-name field-name] [test-catalog-name "default" (tx/db-qualified-table-name db-name table-name) field-name]))


(defmethod sql.tx/pk-sql-type :starburst
  [_]
  "INTEGER")

(defmethod sql.tx/create-table-sql :starburst
  [driver dbdef tabledef]
  ;; strip out the PRIMARY KEY stuff from the CREATE TABLE statement
  (let [sql ((get-method sql.tx/create-table-sql :sql/test-extensions) driver dbdef tabledef)]
    (str/replace sql #", PRIMARY KEY \([^)]+\)|NOT NULL" "")))

(defmethod ddl.i/format-name :starburst [_ table-or-field-name]
  (u/snake-key table-or-field-name))

;; Trino doesn't support FKs, at least not adding them via DDL
(defmethod sql.tx/add-fk-sql :starburst
  [_ _ _ _]
  nil)

;; TODO: FIXME?
#_(defmethod tx/has-questionable-timezone-support? :starburst [_] true)
