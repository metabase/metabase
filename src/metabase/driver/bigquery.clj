(ns metabase.driver.bigquery
  (:require [clojure.set :as set]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.bigquery
             [client :as bq.client]
             [sync :as bq.sync]
             [query-processor :as bq.qp]]
            [metabase.driver.generic-sql :as sql]
            [metabase.util.i18n :refer [tru]])
  (:import metabase.driver.bigquery.BigQueryDriver))

;; BigQuery doesn't return a timezone with it's time strings as it's always UTC, JodaTime parsing also defaults to UTC
(def ^:private bigquery-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSS"))
(def ^:private bigquery-db-time-query "select CAST(CURRENT_TIMESTAMP() AS STRING)")

(u/strict-extend BigQueryDriver
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-breakout            bq.qp/apply-breakout
          :apply-source-table        (u/drop-first-arg bq.qp/apply-source-table)
          :apply-join-tables         (u/drop-first-arg bq.qp/apply-join-tables)
          :apply-order-by            bq.qp/apply-order-by
          ;; these two are actually not applicable since we don't use JDBC
          :column->base-type         (constantly nil)
          :connection-details->spec  (constantly nil)
          :current-datetime-fn       (constantly :%current_timestamp)
          :date                      (u/drop-first-arg bq.qp/date)
          :field->alias              (u/drop-first-arg bq.qp/field->alias)
          :field->identifier         (u/drop-first-arg bq.qp/field->identifier)
          :quote-style               (constantly :mysql)
          :string-length-fn          (u/drop-first-arg bq.qp/string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg bq.qp/unix-timestamp->timestamp)})

  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?             (u/drop-first-arg bq.client/can-connect?)
          :date-interval            bq.qp/date-interval
          :describe-database        (u/drop-first-arg bq.sync/describe-database)
          :describe-table           (u/drop-first-arg bq.sync/describe-table)
          :details-fields           (constantly [{:name         "project-id"
                                                  :display-name (tru "Project ID")
                                                  :placeholder  (tru "praxis-beacon-120871")
                                                  :required     true}
                                                 {:name         "dataset-id"
                                                  :display-name (tru "Dataset ID")
                                                  :placeholder  (tru "toucanSightings")
                                                  :required     true}
                                                 {:name         "client-id"
                                                  :display-name (tru "Client ID")
                                                  :placeholder  "1201327674725-y6ferb0feo1hfssr7t40o4aikqll46d4.apps.googleusercontent.com"
                                                  :required     true}
                                                 {:name         "client-secret"
                                                  :display-name (tru "Client Secret")
                                                  :placeholder  "dJNi4utWgMzyIFo2JbnsK6Np"
                                                  :required     true}
                                                 {:name         "auth-code"
                                                  :display-name (tru "Auth Code")
                                                  :placeholder  "4/HSk-KtxkSzTt61j5zcbee2Rmm5JHkRFbL5gD5lgkXek"
                                                  :required     true}
                                                 {:name         "use-jvm-timezone"
                                                  :display-name (tru "Use JVM Time Zone")
                                                  :default      "false"
                                                  :type         :boolean}])
          :execute-query            (u/drop-first-arg bq.qp/execute-query)
          ;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins
          ;; are still allowed, which puts us in a weird position, however; people can manually specifiy "foreign key"
          ;; relationships in admin and everything should work correctly. Since we can't infer any "FK" relationships
          ;; during sync our normal FK tests are not appropriate for BigQuery, so they're disabled for the time being.
          ;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set
          ;; up these FK relationships for FK tables
          :features                 (constantly (set/union #{:basic-aggregations
                                                             :standard-deviation-aggregations
                                                             :native-parameters
                                                             :expression-aggregations
                                                             :binning
                                                             :native-query-params}
                                                           (when-not config/is-test?
                                                             ;; during unit tests don't treat bigquery as having FK
                                                             ;; support
                                                             #{:foreign-keys})))
          :format-custom-field-name (u/drop-first-arg bq.qp/format-custom-field-name)
          :mbql->native             (u/drop-first-arg bq.qp/mbql->native)
          :current-db-time          (driver/make-current-db-time-fn bigquery-db-time-query bigquery-date-formatters)}))

(defn -init-driver
  "Register the BigQuery driver"
  []
  (driver/register-driver! :bigquery (BigQueryDriver.)))
