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
  (:import (java.util Collections Date List Map)
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


;;; ------------------------------------------------------------ describe-database ------------------------------------------------------------

(defn- fetch-properties
  ^Webproperties [^Analytics client, ^String account-id]
  (google/execute (.list (.webproperties (.management client)) account-id)))

(defn- fetch-profiles
  ^Profiles [^Analytics client, ^String account-id, ^String property-id]
  (google/execute (.list (.profiles (.management client)) account-id property-id)))

(defn- properties+profiles
  "Return a set of tuples of `Webproperty` and `Profile` for DATABASE."
  [{{:keys [account-id]} :details, :as database}]
  (let [client (database->client database)]
    (set (for [^Webproperty property (.getItems (fetch-properties client account-id))
               ^Profile     profile  (.getItems (fetch-profiles client account-id (.getId property)))]
           [property profile]))))

(defn- profile-ids
  "Return a set of all numeric IDs for different profiles available to this account."
  [database]
  (set (for [[_, ^Profile profile] (properties+profiles database)]
         (.getId profile))))

(defn- describe-database [database]
  {:tables (set (for [table-id (cons "_metabase_metadata" (profile-ids database))]
                  {:name   table-id
                   :schema nil}))})


;;; ------------------------------------------------------------ describe-table ------------------------------------------------------------

(defn- fetch-columns
  ^Columns [^Analytics client]
  (google/execute (.list (.columns (.metadata client)) "ga")))

(defn- column-attribute
  "Get the value of ATTRIBUTE-NAME for COLUMN."
  [^Column column, attribute-name]
  (get (.getAttributes column) (name attribute-name)))

(defn- column-has-attributes? ^Boolean [^Column column, ^Map attributes-map]
  (reduce #(and %1 %2) (for [[k v] attributes-map]
                         (= (column-attribute column k) v))))

(defn- columns
  "Return a set of `Column`s for this database. Each table in a Google Analytics database has the same columns."
  ([database]
   (columns database {:status "PUBLIC", :type "DIMENSION"}))
  ([database attributes]
   (set (for [^Column column (.getItems (fetch-columns (database->client database)))
              :when          (column-has-attributes? column attributes)]
          column))))

(defn- describe-columns [database]
  (set (for [^Column column (columns database)]
         {:name      (.getId column)
          :base-type (if (= (.getId column) "ga:date")
                       :type/Date
                       (qp/ga-type->base-type (column-attribute column :dataType)))})))

(defn- describe-table [database table]
  {:name   (:name table)
   :schema (:schema table)
   :fields (describe-columns database)})


;;; ------------------------------------------------------------ _metabase_metadata ------------------------------------------------------------

(defn- property+profile->display-name
  "Format a table name for a GA property and GA profile"
  [^Webproperty property, ^Profile profile]
  (let [property-name (s/replace (.getName property) #"^https?://" "")
        profile-name  (s/replace (.getName profile)  #"^https?://" "")]
    ;; don't include the profile if it's the same as property-name or is the default "All Web Site Data"
    (if (or (.contains property-name profile-name)
            (= profile-name "All Web Site Data"))
      property-name
      (str property-name " (" profile-name ")"))))

(defn- table-rows-seq [database table]
  ;; this method is only supposed to be called for _metabase_metadata, make sure that's the case
  {:pre [(= (:name table) "_metabase_metadata")]}
  ;; now build a giant sequence of all the things we want to set
  (apply concat
         ;; set display_name for all the tables
         (for [[^Webproperty property, ^Profile profile] (properties+profiles database)]
           (cons {:keypath (str (.getId profile) ".display_name")
                  :value   (property+profile->display-name property profile)}
                 ;; set display_name and description for each column for this table
                 (apply concat (for [^Column column (columns database)]
                                 [{:keypath (str (.getId profile) \. (.getId column) ".display_name")
                                   :value   (column-attribute column :uiName)}
                                  {:keypath (str (.getId profile) \. (.getId column) ".description")
                                   :value   (column-attribute column :description)}]))))))


;;; ------------------------------------------------------------ can-connect? ------------------------------------------------------------

(defn- can-connect? [details-map]
  {:pre [(map? details-map)]}
  (boolean (profile-ids {:details details-map})))


;;; ------------------------------------------------------------ execute-query ------------------------------------------------------------

;; memoize this because the display names aren't going to change and fetching this info from GA can take around half a second
(def ^:private ^{:arglists '([database-id metric-id])} built-in-metric-name->display-name
  "Given a DATABASE-ID and a METRIC-ID like `ga:users`, return an appropriate `:display_name` like `Users`."
  (memoize
   (fn [database-id metric-id]
     (some (fn [^Column column]
             (when (= (.getId column) metric-id)
               (column-attribute column :uiName)))
           (columns (Database (u/get-id database-id))
                    {:type "METRIC", :status "PUBLIC"})))))

(defn- with-column-display-names [qp query]
  (let [results              (qp query)
        built-in-metric-name (name (get-in query [:ga :metrics]))]
    (if-not built-in-metric-name
      results
      (update-in results [:data :cols] (fn [cols]
                                         (for [col cols]
                                           (if-not (= (name (:name col)) built-in-metric-name)
                                             col
                                             (assoc col :display_name (built-in-metric-name->display-name (:database query) built-in-metric-name)))))))))

(defn- process-query-in-context [qp]
  (comp (partial with-column-display-names qp)
        qp/transform-query))

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
         {:can-connect?             (u/drop-first-arg can-connect?)
          :describe-database        (u/drop-first-arg describe-database)
          :describe-table           (u/drop-first-arg describe-table)
          :details-fields           (constantly [{:name         "account-id"
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
          :execute-query            (u/drop-first-arg (partial qp/execute-query do-query))
          :field-values-lazy-seq    (constantly [])
          :process-query-in-context (u/drop-first-arg process-query-in-context)
          :mbql->native             (u/drop-first-arg qp/mbql->native)
          :table-rows-seq           (u/drop-first-arg table-rows-seq)}))


(driver/register-driver! :googleanalytics (GoogleAnalyticsDriver.))
