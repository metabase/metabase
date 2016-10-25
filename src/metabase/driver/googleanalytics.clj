(ns metabase.driver.googleanalytics
  (:require (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.driver.googleanalytics [query-processor :as qp])
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :as table])
            [metabase.sync-database.analyze :as analyze]
            metabase.query-processor.interface
            [metabase.util :as u])
  (:import (java.util Collections Date)
           (com.google.api.client.googleapis.auth.oauth2 GoogleCredential GoogleCredential$Builder GoogleAuthorizationCodeFlow GoogleAuthorizationCodeFlow$Builder GoogleTokenResponse)
           com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
           (com.google.api.client.googleapis.json GoogleJsonError GoogleJsonResponseException)
           com.google.api.client.googleapis.services.AbstractGoogleClientRequest
           com.google.api.client.http.HttpTransport
           com.google.api.client.json.JsonFactory
           com.google.api.client.json.jackson2.JacksonFactory
           (com.google.api.services.analytics Analytics Analytics$Builder AnalyticsScopes)))

; START DUPLICATED CODE FROM BIGQUERY DRIVER
; TODO: extra most of this into a shared module
(def ^:private ^HttpTransport http-transport (GoogleNetHttpTransport/newTrustedTransport))
(def ^:private ^JsonFactory   json-factory   (JacksonFactory/getDefaultInstance))

(def ^:private ^:const ^String redirect-uri "urn:ietf:wg:oauth:2.0:oob")

(defn- execute-no-auto-retry
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is
  throws, converting them to `ExceptionInfo` and rethrowing them."
  [^AbstractGoogleClientRequest request]
  (try (.execute request)
       (catch GoogleJsonResponseException e
         (let [^GoogleJsonError error (.getDetails e)]
           (throw (ex-info (or (.getMessage error)
                               (.getStatusMessage e))
                           (into {} error)))))))

(defn- execute
  "`execute` REQUEST, and catch any `GoogleJsonResponseException` is
  throws, converting them to `ExceptionInfo` and rethrowing them.

  This automatically retries any failed requests up to 2 times."
  [^AbstractGoogleClientRequest request]
  (u/auto-retry 2
    (execute-no-auto-retry request)))

;; This specific format was request by Google themselves -- see #2627
(def ^:private ^:const ^String application-name
  (let [{:keys [tag hash branch]} config/mb-version-info]
    (format "Metabase/%s (GPN:Metabse; %s %s)" tag hash branch)))

(defn- ^Analytics credential->client [^GoogleCredential credential]
  (.build (doto (Analytics$Builder. http-transport json-factory credential)
            (.setApplicationName application-name))))

(defn- fetch-access-and-refresh-tokens* [^String client-id, ^String client-secret, ^String auth-code]
  {:pre  [(seq client-id) (seq client-secret) (seq auth-code)]
   :post [(seq (:access-token %)) (seq (:refresh-token %))]}
  (log/info (u/format-color 'magenta "Fetching Google access/refresh tokens with auth-code '%s'..." auth-code))
  (let [^GoogleAuthorizationCodeFlow flow (.build (doto (GoogleAuthorizationCodeFlow$Builder. http-transport json-factory client-id client-secret (Collections/singleton AnalyticsScopes/ANALYTICS_READONLY))
                                                    (.setAccessType "offline")))
        ^GoogleTokenResponse response     (.execute (doto (.newTokenRequest flow auth-code) ; don't use `execute` here because this is a *different* type of Google request
                                                      (.setRedirectUri redirect-uri)))]
    {:access-token (.getAccessToken response), :refresh-token (.getRefreshToken response)}))

;; Memoize this function because you're only allowed to redeem an auth-code once. This way we can redeem it the first time when `can-connect?` checks to see if the DB details are
;; viable; then the second time we go to redeem it we can save the access token and refresh token with the newly created `Database` <3
(def ^:private ^{:arglists '([client-id client-secret auth-code])} fetch-access-and-refresh-tokens (memoize fetch-access-and-refresh-tokens*))

(defn- database->credential
  "Get a `GoogleCredential` for a `DatabaseInstance`."
  {:arglists '([database])}
  ^GoogleCredential [{{:keys [^String client-id, ^String client-secret, ^String auth-code, ^String access-token, ^String refresh-token], :as details} :details, id :id, :as db}]
  {:pre [(seq client-id) (seq client-secret) (or (seq auth-code)
                                                 (and (seq access-token) (seq refresh-token)))]}
  (if-not (and (seq access-token)
               (seq refresh-token))
    ;; If Database doesn't have access/refresh tokens fetch them and try again
    (let [details (-> (merge details (fetch-access-and-refresh-tokens client-id client-secret auth-code))
                      (dissoc :auth-code))]
      (when id
        (db/update! Database id, :details details))
      (recur (assoc db :details details)))
    ;; Otherwise return credential as normal
    (doto (.build (doto (GoogleCredential$Builder.)
                    (.setClientSecrets client-id client-secret)
                    (.setJsonFactory json-factory)
                    (.setTransport http-transport)))
      (.setAccessToken  access-token)
      (.setRefreshToken refresh-token))))

(def ^:private ^{:arglists '([database])} ^Analytics database->client (comp credential->client database->credential))
; END DUPLICATED CODE FROM BIGQUERY DRIVER

(defn- get-accounts
  [client]
  (.getItems (execute (.list (.accounts (.management client))))))

(defn- get-properties
  [client account-id]
  (.getItems (execute (.list (.webproperties (.management client)) account-id))))

(defn- get-profiles
  [client account-id property-id]
  (.getItems (execute (.list (.profiles (.management client)) account-id property-id))))

(defn- property-profile->name
  "Format a table name for a GA property and GA profile"
  [property profile]
  (let [property-name (s/replace (.getName property) #"^https?://" "")
        profile-name (s/replace (.getName profile) #"^https?://" "")]
    ;; don't include the profile if it's the same as property-name or is the default "All Web Site Data"
    (if (or (.contains property-name profile-name) (= profile-name "All Web Site Data"))
      property-name
      (str property-name " (" profile-name ")"))))


(defn- get-tables
  [{{:keys [project-id]} :details, :as database}]
  (let [client     (database->client database)
        account-id (.getId (first (get-accounts client)))]
    (set (apply concat (for [property (get-properties client account-id)]
                         (for [profile (get-profiles client account-id (.getId property))]
                           {:name (.getId profile)
                            ; :display-name (property-profile->name property profile)
                            :schema nil}))))))

(defn- get-columns
  [{{:keys [project-id]} :details, :as database}]
  (let [client   (database->client database)
        response (execute (.list (.columns (.metadata client)) "ga"))]
    (for [column (.getItems response)
          :let [attrs (.getAttributes column)]
          :when (and (= (get attrs "status") "PUBLIC") (= (get attrs "type") "DIMENSION"))]
      {:name         (.getId column)
      ;  :display-name (get attrs "uiName")
      ;  :description  (get attrs "description")
       :base-type    (if (= (.getId column) "ga:date")
                       :type/Date
                       (qp/ga-type->base-type (get attrs "dataType")))})))

(defn- can-connect? [details-map]
  {:pre [(map? details-map)]}
  (boolean (get-tables {:details details-map})))

(defn- process-query-in-context [qp]
  (fn [query]
    (qp (qp/transform-query query))))

(defn- do-query
  [{{:keys [query]} :native, database :database}]
  (let [query   (if (string? query)
                    (json/parse-string query keyword)
                    query)
        client  (database->client database)
        request (doto (.get (.ga (.data client))
                  (:ids query)
                  (:start-date query)
                  (:end-date query)
                  (:metrics query)))]
    (when-not (s/blank? (:dimensions query))
      (.setDimensions request (:dimensions query)))
    (when-not (s/blank? (:sort query))
      (.setSort request (:sort query)))
    (when-not (s/blank? (:filters query))
      (.setFilters request (:filters query)))
    (when-not (s/blank? (:segment query))
      (.setSegment request (:segment query)))
    (when-not (nil? (:max-results query))
      (.setMaxResults request (:max-results query)))
    (when-not (nil? (:include-empty-rows query))
      (.setIncludeEmptyRows request (:include-empty-rows query)))
    (execute request)))

(defrecord GoogleAnalyticsDriver []
  clojure.lang.Named
  (getName [_] "Google Analytics"))

(u/strict-extend GoogleAnalyticsDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
          {:can-connect?          (u/drop-first-arg can-connect?)
           :describe-database     (fn [_ database]
                                    {:tables (get-tables database)})
           :describe-table        (fn [_ database table]
                                    {:name   (:name table)
                                     :schema (:schema table)
                                     :fields (set (get-columns database))})
           :field-values-lazy-seq (constantly [])
           :details-fields        (constantly [{:name         "ids"
                                                :display-name "Project ID"
                                                :placeholder  "ga:12345678"
                                                :required     true}
                                               {:name         "client-id"
                                                :display-name "Client ID"
                                                :placeholder  "1201327674725-y6ferb0feo1hfssr7t40o4aikqll46d4.apps.googleusercontent.com"
                                                :required     true}
                                               {:name         "client-secret"
                                                :display-name "Client Secret"
                                                :placeholder  "dJNi4utWgMzyIFo2JbnsK6Np"
                                                :required     true}
                                               {:name         "auth-code"
                                                :display-name "Auth Code"
                                                :placeholder  "4/HSk-KtxkSzTt61j5zcbee2Rmm5JHkRFbL5gD5lgkXek"
                                                :required     true}])
           :process-query-in-context (u/drop-first-arg process-query-in-context)
           :mbql->native             (u/drop-first-arg qp/mbql->native)
           :execute-query            (fn [_ query] (qp/execute-query do-query query))}))

(driver/register-driver! :googleanalytics (GoogleAnalyticsDriver.))
