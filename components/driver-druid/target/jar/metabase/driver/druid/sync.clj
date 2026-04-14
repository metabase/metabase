(ns metabase.driver.druid.sync
  (:refer-clojure :exclude [select-keys])
  (:require
   [medley.core :as m]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.druid.client :as druid.client]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel :as ssh]
   [metabase.util.performance :refer [select-keys]]))

(defn- do-segment-metadata-query [details datasource]
  {:pre [(map? details) (string? datasource)]}
  (druid.client/do-query details {"queryType"     :segmentMetadata
                                  "dataSource"    datasource
                                  "intervals"     ["1999-01-01/2114-01-01"]
                                  "analysisTypes" [:aggregators]
                                  "merge"         true}))

(defn- druid-type->base-type [field-type]
  (case field-type
    "STRING"      :type/Text
    "FLOAT"       :type/Float
    "DOUBLE"      :type/Float
    "LONG"        :type/Integer
    "hyperUnique" :type/DruidHyperUnique
    :type/Float))

(defn describe-table
  "Impl of `driver/describe-table` for Druid."
  [database table]
  {:pre [(map? database) (map? table)]}
  (ssh/with-ssh-tunnel [details-with-tunnel (driver.conn/effective-details database)]
    (let [{:keys [columns aggregators]} (first (do-segment-metadata-query details-with-tunnel (:name table)))
          metric-column-names           (set (keys aggregators))]
      {:schema nil
       :name   (:name table)
       :fields (set (cons
                     ;; every Druid table is an event stream w/ a timestamp field
                     {:name              "timestamp"
                      :database-type     "timestamp"
                      :base-type         :type/Instant
                      :pk?               false
                      :database-position 0}
                     (for [[idx [field-name {field-type :type}]] (m/indexed (dissoc columns :__time))
                           :let                                  [metric? (contains? metric-column-names field-name)]]
                       {:name              (name field-name)
                        :base-type         (druid-type->base-type field-type)
                        :database-type     (if metric?
                                             (format "%s [metric]" field-type)
                                             field-type)
                        :database-position (inc idx)})))})))

(defn describe-database
  "Impl of `driver/describe-database` for Druid."
  [database]
  {:pre [(map? (:details database))]}
  (let [details (driver.conn/effective-details database)]
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (let [druid-datasources (druid.client/GET (druid.client/details->url details-with-tunnel "/druid/v2/datasources")
                                                :auth-enabled (:auth-enabled details)
                                                :auth-username (:auth-username details)
                                                :auth-token-value (driver-api/secret-value-as-string :druid details "auth-token"))]
        {:tables (set (for [table-name druid-datasources]
                        {:schema nil, :name table-name}))}))))

(defn dbms-version
  "Impl of `driver/dbms-version` for Druid."
  [database]
  {:pre [(map? (:details database))]}
  (let [details (driver.conn/effective-details database)]
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (-> (druid.client/GET (druid.client/details->url details-with-tunnel "/status")
                            :auth-enabled (:auth-enabled details)
                            :auth-username (:auth-username details)
                            :auth-token-value (driver-api/secret-value-as-string :druid details "auth-token"))
          (select-keys [:version])))))
