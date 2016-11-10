(ns metabase.test.data.impala
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [environ.core :refer [env]]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :as datasets]
                                [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u])
  (:import metabase.driver.impala.ImpalaDriver))

;; 
;; Setup Impala test database: The easiest way is to download the Cloudera Quickstart image.
;; This image contains CentOs with Cloudera Hadoop pre-installed.
;; download at: www.cloudera.com/downloads/quickstart_vms.html
;;
;; Impala does not support: constraints of any kind
;; Do not create primary or foreign keys
;; see: https://www.cloudera.com/documentation/enterprise/5-3-x/topics/impala_porting.html

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "TIMESTAMP"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INT"
   :type/Text       "STRING"})


(defn- get-db-env-var
  " Look up the relevant connection param from corresponding env var or throw an exception if it's not set.

     (get-db-env-var :user) ; Look up `MB_IMPALA_USER`"
  [env-var & [default]]
  (or (env (keyword (format "mb-impala-%s" (name env-var))))
      default
      (throw (Exception. (format "In order to test Impala, you must specify the env var MB_IMPALA_%s."
                                 (s/upper-case (name env-var)))))))


(def ^:private db-connection-details
  (delay {:host     (get-db-env-var :host)
          :port     (Integer/parseInt (get-db-env-var :port "21050"))
          :db       (get-db-env-var :db)
          :user     (get-db-env-var :user)
          :password (get-db-env-var :password)}))


;; Impala is tested remotely, which means we need to support multiple tests happening against the same remote host at the same time.
(defonce ^:const session-schema-number
  (rand-int 500)) 

(defonce ^:const session-schema-name
  (str "schema_" session-schema-number))

(defn- qualified-name-components
  ([_ db-name]
   [db-name])
  ([_ _ table-name]
   [session-schema-name table-name])
  ([_ _ table-name field-name]
   [session-schema-name table-name field-name]))

(defn- quote-name [_ nm]
  (str \` nm \`))

(defn default-create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial quote-name driver)
        pk-field-name (quot (generic/pk-field-name driver))]
    (format "CREATE TABLE %s (%s,%s %s);"
            (generic/qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (base-type field-base-type->sql-type))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (generic/pk-sql-type driver))))


(defn- default-drop-table-if-exists-sql [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s;" (generic/qualify+quote-name driver database-name table-name)))


(u/strict-extend ImpalaDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:create-db-sql             (constantly nil)
          :create-table-sql          default-create-table-sql
          :drop-db-if-exists-sql     (constantly nil)
          :drop-table-if-exists-sql  default-drop-table-if-exists-sql                ;; No support for cascade
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :pk-sql-type               (constantly "INT")
          :add-fk-sql                (constantly nil)
          :load-data!                (generic/make-load-data-fn generic/load-data-add-ids)  ;; Impala has no autoincrement like generator for PK values.
          :execute-sql!              generic/sequentially-execute-sql!               ;; Driver does not support mutiple statements
          :qualified-name-components qualified-name-components
          :quote-name                quote-name})

  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details (fn [& _]
                                          @db-connection-details)
          :default-schema               (constantly session-schema-name)
          :engine                       (constantly :impala)}))


;;; Create + destroy the schema used for this test session

(defn- execute-when-testing-impala! [format-str & args]
  (generic/execute-when-testing! :impala
    (fn [] (sql/connection-details->spec (ImpalaDriver.) @db-connection-details))
    (apply format format-str args)))

(defn- create-session-schema!
  {:expectations-options :before-run}
  []
  (execute-when-testing-impala! "DROP SCHEMA IF EXISTS %s CASCADE;" session-schema-name session-schema-name)
  (execute-when-testing-impala! "CREATE SCHEMA %s;" session-schema-name session-schema-name))

(defn- destroy-session-schema!
  {:expectations-options :after-run}
  []
  (execute-when-testing-impala! "DROP SCHEMA IF EXISTS %s CASCADE;" session-schema-name))


