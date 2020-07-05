(ns metabase.driver.googleanalytics
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.google :as google]
            [metabase.driver.googleanalytics
             [client :as client]
             [execute :as execute]
             [metadata :as metadata]
             [query-processor :as qp]]
            [metabase.util.i18n :refer [tru]])
  (:import [com.google.api.services.analytics Analytics Analytics$Data$Ga$Get]
           [com.google.api.services.analytics.model Column Profile Profiles Webproperties Webproperty]
           java.util.Date))

(driver/register! :googleanalytics, :parent :google)

(defmethod driver/supports? [:googleanalytics :basic-aggregations] [_ _] false)


;;; ----------------------------------------------- describe-database ------------------------------------------------

(defn- fetch-properties
  ^Webproperties [^Analytics client, ^String account-id]
  (google/execute (.list (.webproperties (.management client)) account-id)))

(defn- fetch-profiles
  ^Profiles [^Analytics client, ^String account-id, ^String property-id]
  (google/execute (.list (.profiles (.management client)) account-id property-id)))

(defn- properties+profiles
  "Return a set of tuples of `Webproperty` and `Profile` for `database`."
  [{{:keys [account-id]} :details, :as database}]
  (let [client (client/database->client database)]
    (set (for [^Webproperty property (.getItems (fetch-properties client account-id))
               ^Profile     profile  (.getItems (fetch-profiles client account-id (.getId property)))]
           [property profile]))))

(defn- profile-ids
  "Return a set of all numeric IDs for different profiles available to this account."
  [database]
  (set (for [[_, ^Profile profile] (properties+profiles database)]
         (.getId profile))))

(defmethod driver/describe-database :googleanalytics
  [_ database]
  ;; Include a `_metabase_metadata` table in the list of Tables so we can provide custom metadata. See below.
  {:tables (set (for [table-id (cons "_metabase_metadata" (profile-ids database))]
                  {:name   table-id
                   :schema nil}))})


;;; ------------------------------------------------- describe-table -------------------------------------------------

(defn- describe-columns [database]
  (set (for [[idx ^Column column] (m/indexed (metadata/columns database))
             :let [ga-type (metadata/column-attribute column :dataType)]]
         {:name              (.getId column)
          :base-type         (if (= (.getId column) "ga:date")
                               :type/Date
                               (execute/ga-type->base-type ga-type))
          :database-type     ga-type
          :database-position idx})))

(defmethod driver/describe-table :googleanalytics
  [_ database table]
  {:name   (:name table)
   :schema (:schema table)
   :fields (describe-columns database)})


;;; ----------------------------------------------- _metabase_metadata -----------------------------------------------

;; The following is provided so we can specify custom display_names for Tables and Fields since there's not yet a way
;; to do it directly in `describe-database` or `describe-table`. Just fake results for the Table in `table-rows-seq`
;; (rows in `_metabase_metadata` are just property -> value, e.g. `<table>.display_name` -> `<display-name>`.)

(defn- property+profile->display-name
  "Format a table name for a GA property and GA profile"
  [^Webproperty property, ^Profile profile]
  (let [property-name (str/replace (.getName property) #"^https?://" "")
        profile-name  (str/replace (.getName profile)  #"^https?://" "")]
    ;; don't include the profile if it's the same as property-name or is the default "All Web Site Data"
    (if (or (.contains property-name profile-name)
            (= profile-name "All Web Site Data"))
      property-name
      (str property-name " (" profile-name ")"))))

(defmethod driver/table-rows-seq :googleanalytics
  [_ database table]
  ;; this method is only supposed to be called for _metabase_metadata, make sure that's the case
  {:pre [(= (:name table) "_metabase_metadata")]}
  ;; now build a giant sequence of all the things we want to set
  (apply concat
         ;; set display_name for all the tables
         (for [[^Webproperty property, ^Profile profile] (properties+profiles database)]
           (cons {:keypath (str (.getId profile) ".display_name")
                  :value   (property+profile->display-name property profile)}
                 ;; set display_name and description for each column for this table
                 (apply concat (for [^Column column (metadata/columns database)]
                                 [{:keypath (str (.getId profile) \. (.getId column) ".display_name")
                                   :value   (metadata/column-attribute column :uiName)}
                                  {:keypath (str (.getId profile) \. (.getId column) ".description")
                                   :value   (metadata/column-attribute column :description)}]))))))

(defmethod driver/can-connect? :googleanalytics
  [_ details-map]
  {:pre [(map? details-map)]}
  (boolean (profile-ids {:details details-map})))

(defn- mbql-query->request ^Analytics$Data$Ga$Get [{{:keys [query]} :native, database :database}]
  (let [query  (if (string? query)
                 (json/parse-string query keyword)
                 query)
        client (client/database->client database)]
    (assert (not (str/blank? (:metrics query)))
            ":metrics is required in a Google Analytics query")
    ;; `end-date` is inclusive!!!
    (u/prog1 (.get (.ga (.data client))
                   (:ids query)
                   (:start-date query)
                   (:end-date query)
                   (:metrics query))
      (when-not (str/blank? (:dimensions query))
        (.setDimensions <> (:dimensions query)))
      (when-not (str/blank? (:sort query))
        (.setSort <> (:sort query)))
      (when-not (str/blank? (:filters query))
        (.setFilters <> (:filters query)))
      (when-not (str/blank? (:segment query))
        (.setSegment <> (:segment query)))
      (when-not (nil? (:max-results query))
        (.setMaxResults <> (:max-results query)))
      (when-not (nil? (:include-empty-rows query))
        (.setIncludeEmptyRows <> (:include-empty-rows query))))))

(defmethod driver/humanize-connection-error-message :googleanalytics
  [_ message]
  ;; if we get a big long message about how we need to enable the GA API, then replace it with a short message about
  ;; how we need to enable the API
  (if-let [[_ enable-api-url] (re-find #"Enable it by visiting ([^\s]+) then retry." message)]
    (tru "You must enable the Google Analytics API. Use this link to go to the Google Developers Console: {0}"
         enable-api-url)
    message))

(defmethod driver/mbql->native :googleanalytics
  [_ query]
  (qp/mbql->native query))

(defn- execute*
  [query]
  (google/execute (mbql-query->request query)))

(defmethod driver/execute-reducible-query :googleanalytics
  [_ query _ respond]
  (execute/execute-reducible-query execute* query respond))
