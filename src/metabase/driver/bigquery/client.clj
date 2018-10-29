(ns metabase.driver.bigquery.client
  "Low-level code for making requests against the BigQuery API."
  (:require [clojure.string :as str]
            [metabase.driver.google :as google])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           com.google.api.client.http.HttpRequestInitializer
           [com.google.api.services.bigquery Bigquery Bigquery$Builder BigqueryScopes]
           [com.google.api.services.bigquery.model QueryRequest QueryResponse]
           java.util.Collections))

(defn- ^Bigquery credential->client [^GoogleCredential credential]
  (.build (doto (Bigquery$Builder.
                 google/http-transport
                 google/json-factory
                 (reify HttpRequestInitializer
                   (initialize [this httpRequest]
                     (.initialize credential httpRequest)
                     (.setConnectTimeout httpRequest 0)
                     (.setReadTimeout httpRequest 0))))
            (.setApplicationName google/application-name))))

(def ^:private ^{:arglists '([database])} ^GoogleCredential database->credential
  (partial google/database->credential (Collections/singleton BigqueryScopes/BIGQUERY)))

(def ^{:arglists '([database])} ^Bigquery database->client
  "Given a Metabase Database object return a `Bigquery` client object for making requests against."
  (comp credential->client database->credential))

(defn- details->client ^Bigquery [details]
  (database->client {:details details}))

(defn can-connect?
  "Can we successfully connect to a BigQuery database using `details`?"
  [{:keys [project-id dataset-id], :as details}]
  {:pre [(map? details) (string? project-id) (string? dataset-id)]}
  ;; check whether we can connect by just fetching the first page of tables for the database. If that succeeds we're
  ;; g2g
  (boolean (google/execute (.list (.tables (details->client details))
                                  ^String project-id
                                  ^String dataset-id))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Executing Queries                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(def query-timeout-seconds
  "Max timeout to wait for BigQuery API to return results when running a query."
  60)

(defn ^QueryResponse execute-bigquery
  "Execute a BigQuery query."
  ([{{:keys [project-id]} :details, :as database} query-string]
   (execute-bigquery (database->client database) project-id query-string))

  ([^Bigquery client, ^String project-id, ^String query-string]
   {:pre [client (seq project-id) (seq query-string)]}
   (let [request (doto (QueryRequest.)
                   (.setTimeoutMs (* query-timeout-seconds 1000))
                   ;; if the query contains a `#legacySQL` directive then use legacy SQL instead of standard SQL
                   (.setUseLegacySql (str/includes? (str/lower-case query-string) "#legacysql"))
                   (.setQuery query-string))]
     (google/execute (.query (.jobs client) project-id request)))))
