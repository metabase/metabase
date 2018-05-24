(ns metabase.driver.google
  "Shared logic for various Google drivers, including BigQuery and Google Analytics."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [ring.util.codec :as codec]
            [toucan.db :as db])
  (:import [com.google.api.client.googleapis.auth.oauth2 GoogleAuthorizationCodeFlow
            GoogleAuthorizationCodeFlow$Builder GoogleCredential GoogleCredential$Builder GoogleTokenResponse]
           com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
           [com.google.api.client.googleapis.json GoogleJsonError GoogleJsonResponseException]
           com.google.api.client.googleapis.services.AbstractGoogleClientRequest
           com.google.api.client.http.HttpTransport
           com.google.api.client.json.jackson2.JacksonFactory
           com.google.api.client.json.JsonFactory))

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

(def ^:const ^String application-name
  "The application name we should use for Google drivers. Requested by Google themselves -- see #2627"
  (let [{:keys [tag ^String hash branch]} config/mb-version-info
        encoded-hash                      (-> hash (.getBytes "UTF-8") codec/base64-encode)]
    (format "Metabase/%s (GPN:Metabse; %s %s)" tag encoded-hash branch)))


(defn- fetch-access-and-refresh-tokens* [scopes, ^String client-id, ^String client-secret, ^String auth-code]
  {:pre  [(seq client-id) (seq client-secret) (seq auth-code)]
   :post [(seq (:access-token %)) (seq (:refresh-token %))]}
  (log/info (u/format-color 'magenta "Fetching Google access/refresh tokens with auth-code '%s'..." auth-code))
  (let [^GoogleAuthorizationCodeFlow flow (.build (doto (GoogleAuthorizationCodeFlow$Builder. http-transport json-factory client-id client-secret scopes)
                                                    (.setAccessType "offline")))
        ^GoogleTokenResponse response     (.execute (doto (.newTokenRequest flow auth-code) ; don't use `execute` here because this is a *different* type of Google request
                                                      (.setRedirectUri redirect-uri)))]
    {:access-token (.getAccessToken response), :refresh-token (.getRefreshToken response)}))

(def ^{:arglists '([scopes client-id client-secret auth-code])} fetch-access-and-refresh-tokens
  "Fetch Google access and refresh tokens. This function is memoized because you're only allowed to redeem an
  auth-code once. This way we can redeem it the first time when `can-connect?` checks to see if the DB details are
  viable; then the second time we go to redeem it we can save the access token and refresh token with the newly
  created `Database` <3"
  (memoize fetch-access-and-refresh-tokens*))


(defn database->credential
  "Get a `GoogleCredential` for a `DatabaseInstance`."
  {:arglists '([scopes database])}
  ^com.google.api.client.googleapis.auth.oauth2.GoogleCredential
  [scopes, {{:keys [^String client-id, ^String client-secret, ^String auth-code, ^String access-token, ^String refresh-token], :as details} :details, id :id, :as db}]
  {:pre [(map? db) (seq client-id) (seq client-secret) (or (seq auth-code)
                                                           (and (seq access-token) (seq refresh-token)))]}
  (if-not (and (seq access-token)
               (seq refresh-token))
    ;; If Database doesn't have access/refresh tokens fetch them and try again
    (let [details (-> (merge details (fetch-access-and-refresh-tokens scopes client-id client-secret auth-code))
                      (dissoc :auth-code))]
      (when id
        (db/update! Database id, :details details))
      (recur scopes (assoc db :details details)))
    ;; Otherwise return credential as normal
    (doto (.build (doto (GoogleCredential$Builder.)
                    (.setClientSecrets client-id client-secret)
                    (.setJsonFactory json-factory)
                    (.setTransport http-transport)))
      (.setAccessToken  access-token)
      (.setRefreshToken refresh-token))))

(defn -init-driver
  "Nothing to init as this is code used by the google drivers, but is not a driver itself"
  []
  true)
