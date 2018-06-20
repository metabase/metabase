(ns metabase.driver.google
  "Shared logic for various Google drivers, including BigQuery and Google Analytics."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [ring.util.codec :as codec]
            [toucan.db :as db])
  (:import [com.google.api.client.googleapis.auth.oauth2 GoogleAuthorizationCodeFlow GoogleAuthorizationCodeFlow$Builder
            GoogleCredential GoogleCredential$Builder GoogleTokenResponse]
           com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
           [com.google.api.client.googleapis.json GoogleJsonError GoogleJsonResponseException]
           com.google.api.client.googleapis.services.AbstractGoogleClientRequest
           com.google.api.client.http.HttpTransport
           com.google.api.client.json.jackson2.JacksonFactory
           com.google.api.client.json.JsonFactory
           com.google.api.services.bigquery.BigqueryScopes
           java.util.Collections))

(driver/register! :google, :abstract? true)

(def ^HttpTransport http-transport
  "`HttpTransport` for use with Google drivers."
  (GoogleNetHttpTransport/newTrustedTransport))

(def ^JsonFactory json-factory
  "`JsonFactory` for use with Google drivers."
  (JacksonFactory/getDefaultInstance))

(def ^:private ^:const ^String redirect-uri "urn:ietf:wg:oauth:2.0:oob")

(defn execute-no-auto-retry
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is throws, converting them to `ExceptionInfo` and
  rethrowing them."
  [^AbstractGoogleClientRequest request]
  (try (.execute request)
       (catch GoogleJsonResponseException e
         (let [^GoogleJsonError error (.getDetails e)]
           (throw (ex-info (or (.getMessage error)
                               (.getStatusMessage e))
                           (into {} error)))))))

(defn execute
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is throws, converting them to `ExceptionInfo` and
  rethrowing them.

  This automatically retries any failed requests up to 2 times."
  [^AbstractGoogleClientRequest request]
  (u/auto-retry 2
    (execute-no-auto-retry request)))

(defn- create-application-name
  "Creates the application name string, separated out from the `def` below so it's testable with different values"
  [{:keys [tag ^String hash branch]}]
  (let [encoded-hash (some-> hash (.getBytes "UTF-8") codec/base64-encode)]
    (format "Metabase/%s (GPN:Metabse; %s %s)"
            (or tag "?")
            (or encoded-hash "?")
            (or branch "?"))))

(def ^:const ^String application-name
  "The application name we should use for Google drivers. Requested by Google themselves -- see #2627"
  (create-application-name config/mb-version-info))


(defn database->credential
  "Get a `GoogleCredential` for a `DatabaseInstance`."
  ^com.google.api.client.googleapis.auth.oauth2.GoogleCredential [scopes database-or-id]
  (.createScoped (GoogleCredential/getApplicationDefault) (Collections/singleton BigqueryScopes/BIGQUERY)))

(defn -init-driver
  "Nothing to init as this is code used by the google drivers, but is not a driver itself"
  []
  true)
