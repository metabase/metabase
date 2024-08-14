(ns metabase.driver.druid.sync
  (:require
   [medley.core :as m]
   [metabase.driver.druid.client :as druid.client]
   [metabase.models.secret :as secret]
   [metabase.util.ssh :as ssh]))

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
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
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
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [druid-datasources (druid.client/GET (druid.client/details->url details-with-tunnel "/druid/v2/datasources")
                             :auth-enabled     (-> database :details :auth-enabled)
                             :auth-username    (-> database :details :auth-username)
                             :auth-token-value (-> (:details database)
                                                   (secret/db-details-prop->secret-map "auth-token")
                                                   secret/value->string))]
      {:tables (set (for [table-name druid-datasources]
                      {:schema nil, :name table-name}))})))

(defn dbms-version
  "Impl of `driver/dbms-version` for Druid."
  [database]
  {:pre [(map? (:details database))]}
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (-> (druid.client/GET (druid.client/details->url details-with-tunnel "/status")
          :auth-enabled     (-> database :details :auth-enabled)
          :auth-username    (-> database :details :auth-username)
          :auth-token-value (-> (:details database)
                                (secret/db-details-prop->secret-map "auth-token")
                                secret/value->string))
        (select-keys [:version]))))
