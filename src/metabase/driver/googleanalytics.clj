(ns metabase.driver.googleanalytics
  ;; TODO - probably makes to call this namespace `google-analytics`
  (:require (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.google :as google]
            (metabase.driver.googleanalytics [query-processor :as qp])
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :as table])
            [metabase.sync-database.analyze :as analyze]
            metabase.query-processor.interface
            [metabase.util :as u])
  (:import (java.util Collections Date List)
           (com.google.api.client.googleapis.auth.oauth2 GoogleCredential GoogleCredential$Builder GoogleAuthorizationCodeFlow GoogleAuthorizationCodeFlow$Builder GoogleTokenResponse)
           com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
           (com.google.api.client.googleapis.json GoogleJsonError GoogleJsonResponseException)
           com.google.api.client.googleapis.services.AbstractGoogleClientRequest
           com.google.api.client.http.HttpTransport
           com.google.api.client.json.JsonFactory
           com.google.api.client.json.jackson2.JacksonFactory
           (com.google.api.services.analytics Analytics Analytics$Builder AnalyticsScopes)
           (com.google.api.services.analytics.model Account Accounts Columns Column Profile Profiles Webproperty Webproperties)))

(set! *warn-on-reflection* true) ; NOCOMMIT

;;; ------------------------------------------------------------ Client ------------------------------------------------------------

(defn- ^Analytics credential->client [^GoogleCredential credential]
  (.build (doto (Analytics$Builder. google/http-transport google/json-factory credential)
            (.setApplicationName google/application-name))))

(def ^:private ^{:arglists '([database])} ^GoogleCredential database->credential
  (partial google/database->credential (Collections/singleton AnalyticsScopes/ANALYTICS_READONLY)))

(def ^:private ^{:arglists '([database])} ^Analytics database->client
  (comp credential->client database->credential))


;;; ------------------------------------------------------------ (Currently Unused) ------------------------------------------------------------

;; TODO - is this being used?
#_(defn- get-accounts
  "Returns a `List<Account>`."
  ^List [^Analytics client]
  (.getItems ^Accounts (google/execute (.list (.accounts (.management client))))))

#_(defn- property-profile->name
  "Format a table name for a GA property and GA profile"
  [property profile]
  (let [property-name (s/replace (.getName property) #"^https?://" "")
        profile-name  (s/replace (.getName profile)  #"^https?://" "")]
    ;; don't include the profile if it's the same as property-name or is the default "All Web Site Data"
    (if (or (.contains property-name profile-name) (= profile-name "All Web Site Data"))
      property-name
      (str property-name " (" profile-name ")"))))

;;; ------------------------------------------------------------ describe-database ------------------------------------------------------------

(defn- fetch-properties
  ^Webproperties [^Analytics client, ^String account-id]
  (google/execute (.list (.webproperties (.management client)) account-id)))

(defn- fetch-profiles
  ^Profiles [^Analytics client, ^String account-id, ^String property-id]
  (google/execute (.list (.profiles (.management client)) account-id property-id)))

(defn- fetch-tables
  [{{:keys [account-id]} :details, :as database}]
  (let [client (database->client database)]
    (set (for [^Webproperty property (.getItems (fetch-properties client account-id))
               ^Profile     profile  (.getItems (fetch-profiles client account-id (.getId property)))]
           {:name   (.getId profile)
            ;; :display-name (property-profile->name property profile)
            :schema nil}))))

(defn- describe-database [database]
  {:tables (fetch-tables database)})


;;; ------------------------------------------------------------ describe-table ------------------------------------------------------------

(defn- fetch-columns
  ^Columns [^Analytics client]
  (google/execute (.list (.columns (.metadata client)) "ga")))

(defn- get-columns
  [{{:keys [project-id]} :details, :as database}]
  (for [^Column column (.getItems (fetch-columns (database->client database)))
        :let           [attrs (.getAttributes column)]
        :when          (and (= (get attrs "status") "PUBLIC")
                            (= (get attrs "type") "DIMENSION"))]
    {:name      (.getId column)
     ;;  :display-name (get attrs "uiName")
     ;;  :description  (get attrs "description")
     :base-type (if (= (.getId column) "ga:date")
                  :type/Date
                  (qp/ga-type->base-type (get attrs "dataType")))}))

(defn- describe-table [database table]
  {:name   (:name table)
   :schema (:schema table)
   :fields (set (get-columns database))})


;;; ------------------------------------------------------------ can-connect? ------------------------------------------------------------

(defn- can-connect? [details-map]
  {:pre [(map? details-map)]}
  (boolean (fetch-tables {:details details-map})))


;;; ------------------------------------------------------------ execute-query ------------------------------------------------------------

(defn- do-query
  [{{:keys [query]} :native, database :database}]
  (let [query   (if (string? query)
                  (json/parse-string query keyword)
                  query)
        client  (database->client database)
        request (.get (.ga (.data client))
                      (:ids query)
                      (:start-date query)
                      (:end-date query)
                      (:metrics query))]
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
    (google/execute request)))


;;; ------------------------------------------------------------ Driver ------------------------------------------------------------

(defrecord GoogleAnalyticsDriver []
  clojure.lang.Named
  (getName [_] "Google Analytics"))

(u/strict-extend GoogleAnalyticsDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
          {:can-connect?          (u/drop-first-arg can-connect?)
           :describe-database     (u/drop-first-arg describe-database)
           :describe-table        (u/drop-first-arg describe-table)
           :field-values-lazy-seq (constantly [])
           :details-fields        (constantly [{:name         "account-id"
                                                :display-name "Google Analytics Account ID"
                                                :placeholder  "1234567"
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
           :mbql->native             (u/drop-first-arg qp/mbql->native)
           :execute-query            (u/drop-first-arg (partial qp/execute-query do-query))}))


(driver/register-driver! :googleanalytics (GoogleAnalyticsDriver.))
