(ns metabase.test.data.athena
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as s]
            [environ.core :refer [env]]
            [metabase.db.spec :as dbspec]
            [metabase.test.data
             [dataset-definitions :as defs]
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.athena.AthenaDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "bigint"
   :type/Boolean    "boolean"
   :type/Date       "date"
   :type/DateTime   "timestamp"
   :type/Decimal    "decimal"
   :type/Float      "float"
   :type/Integer    "int"
   :type/Text       "string"})

(defn- get-db-env-var
  "Look up the relevant env var for AWS connection details or throw an exception if it's not set.

     (get-db-env-var :user) ; Look up `MB_ATHENA_USER`"
  [env-var & [default]]
  (or (env (keyword (format "mb-athena-%s" (name env-var))))
      default
      (throw (Exception. (format "In order to test Athena, you must specify the env var MB_ATHENA_%s."
                                 (s/upper-case (name env-var)))))))

(def ^:private db-connection-details
  (delay {:log_path         (get-db-env-var :log_path "/tmp/athena.log")
          :schema           (get-db-env-var :schema)
          :s3_staging_dir   (get-db-env-var :s3-staging-dir)
          :region           (get-db-env-var :region "us-east-1")
          :url              (get-db-env-var :url "jdbc:awsathena://athena.us-east-1.amazonaws.com:443")
          :user             (get-db-env-var :user)
          :password         (get-db-env-var :password)}))

(u/strict-extend AthenaDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:add-fk-sql                (constantly nil)
          :create-db-sql             (constantly nil)
          :create-table-sql          (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :drop-table-if-exists-sql  (constantly nil)
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                (constantly nil)
          :pk-sql-type               (constantly nil)})

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (fn [& _]
                                          @db-connection-details)
          :default-schema               (constantly (:schema @db-connection-details))
          :engine                       (constantly :athena)}))


;;; Helper for generating Athena data

;; It's a copy from metabase.test.data.druid, I don't know the good place to put it in. metabase.test.data.interface ?
(defn- write-dbdef-to-json [dbdef filename]
  (io/delete-file filename :silently)
  (let [rows dbdef]
    (with-open [writer (io/writer filename)]
      (doseq [row rows]
        (json/generate-stream row writer {:date-format "yyyy-MM-dd HH:mm:ss"})
        (.append writer \newline)))))

(defn table->maps [dbdef table-name]
  (let [db (i/flatten-dbdef dbdef table-name)
        {:keys [field-definitions rows]} (i/get-tabledef dbdef table-name)
        ks (map :field-name field-definitions)
        rows-maps (map #(zipmap ks %) rows)
        rows-ids (map-indexed (fn [i e] (assoc e :id (inc i))) rows-maps)]
    rows-ids))

(defn dataset->json! [root-path dbdef]
  (let [tables (i/gettables dbdef)]
    (doseq [table tables]
      (write-dbdef-to-json
       (table->maps dbdef table)
       (str root-path "/" table ".json")))))

; (dataset->json! "/tmp/test" defs/test-data)
; (dataset->json! "/tmp/tupac" defs/tupac-sightings)
; (dataset->json! "/tmp/toucan" defs/sad-toucan-incidents)
; (dataset->json! "/tmp/urls" defs/half-valid-urls)
; (dataset->json! "/tmp/places" defs/places-cam-likes)
