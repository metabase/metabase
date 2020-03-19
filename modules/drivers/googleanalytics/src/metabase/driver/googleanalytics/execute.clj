(ns metabase.driver.googleanalytics.execute
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojure.tools.reader.edn :as edn]
            [java-time :as t]
            [metabase
             [models :refer [Database]]
             [util :as u]]
            [metabase.driver.googleanalytics.metadata :as metadata]
            [metabase.util.date-2 :as u.date]
            [metabase.util.date-2
             [common :as u.date.common]
             [parse :as u.date.parse]]
            [metabase.util.date-2.parse.builder :as u.date.builder])
  (:import [com.google.api.services.analytics.model Column GaData GaData$ColumnHeaders]
           java.time.DayOfWeek
           java.time.format.DateTimeFormatter
           org.threeten.extra.YearWeek))

(defn- column-with-name ^Column [database-or-id column-name]
  (some (fn [^Column column]
          (when (= (.getId column) (name column-name))
            column))
        (metadata/columns (Database (u/get-id database-or-id)) {:status "PUBLIC"})))

(defn- column-metadata [database-id column-name]
  (when-let [ga-column (column-with-name database-id column-name)]
    (merge
     {:display_name (metadata/column-attribute ga-column :uiName)
      :description  (metadata/column-attribute ga-column :description)}
     (let [data-type (metadata/column-attribute ga-column :dataType)]
       (when-let [base-type (cond
                              (= column-name "ga:date") :type/Date
                              (= data-type "INTEGER")   :type/Integer
                              (= data-type "STRING")    :type/Text)]
         {:base_type base-type})))))

;; memoize this because the display names and other info isn't going to change and fetching this info from GA can take
;; around half a second
(def ^:private ^{:arglists '([database-id column-name])} memoized-column-metadata
  (memoize column-metadata))

(defn- add-col-metadata [{database-id :database} col]
  (merge col (memoized-column-metadata (u/get-id database-id) (:name col))))

(def ^:const ga-type->base-type
  "Map of Google Analytics field types to Metabase types."
  {"STRING"      :type/Text
   "FLOAT"       :type/Float
   "INTEGER"     :type/Integer
   "PERCENT"     :type/Float
   "TIME"        :type/Float
   "CURRENCY"    :type/Float
   "US_CURRENCY" :type/Float})

(defn- parse-number [s]
  (edn/read-string (str/replace s #"^0+(.+)$" "$1")))

(def ^:private ^DateTimeFormatter iso-year-week-formatter
  (u.date.builder/formatter
   (u.date.builder/value :iso/week-based-year 4)
   (u.date.builder/value :iso/week-of-week-based-year 2)))

(defn- parse-iso-year-week [^String s]
  (when s
    (-> (YearWeek/from (.parse iso-year-week-formatter s))
        (.atDay DayOfWeek/MONDAY))))

(def ^:private ^DateTimeFormatter year-week-formatter
  (u.date.builder/formatter
   (u.date.builder/value :week-fields/week-based-year 4)
   (u.date.builder/value :week-fields/week-of-week-based-year 2)))

(defn- parse-year-week [^String s]
  (when s
    (let [parsed (.parse year-week-formatter s)
          year   (.getLong parsed (u.date.common/temporal-field :week-fields/week-based-year))
          week   (.getLong parsed (u.date.common/temporal-field :week-fields/week-of-week-based-year))]
      (t/adjust (t/local-date year 1 1) (u.date/adjuster :week-of-year week)))))

(def ^:private ^DateTimeFormatter year-month-formatter
  (u.date.builder/formatter
   (u.date.builder/value :year 4)
   (u.date.builder/value :month-of-year 2)
   (u.date.builder/default-value :day-of-month 1)))

(def ^:private ga-dimension->formatter
  {"ga:date"           "yyyyMMdd"
   "ga:dateHour"       "yyyyMMddHH"
   "ga:dateHourMinute" "yyyyMMddHHmm"
   "ga:day"            parse-number
   "ga:dayOfWeek"      (comp inc parse-number)
   "ga:hour"           parse-number
   "ga:isoYearIsoWeek" parse-iso-year-week
   "ga:minute"         parse-number
   "ga:month"          parse-number
   "ga:week"           parse-number
   "ga:year"           parse-number
   "ga:yearMonth"      year-month-formatter
   "ga:yearWeek"       parse-year-week})

(defn- header->column [^GaData$ColumnHeaders header]
  (let [formatter (ga-dimension->formatter (.getName header))]
    (if formatter
      {:name      "ga:date"
       :base_type :type/DateTime}
      {:name      (.getName header)
       :base_type (ga-type->base-type (.getDataType header))})))

(defn- header->getter-fn [^GaData$ColumnHeaders header]
  (let [formatter (ga-dimension->formatter (.getName header))
        base-type (ga-type->base-type (.getDataType header))
        parser    (cond
                    formatter                     formatter
                    (isa? base-type :type/Number) edn/read-string
                    :else                         identity)]
    (log/tracef "Parsing result column %s with %s" (.getName header) (pr-str parser))
    (if (or (string? parser) (instance? DateTimeFormatter parser))
      (partial u.date.parse/parse-with-formatter parser)
      parser)))

(defn execute-reducible-query
  "Execute a `query` using the provided `do-query` function, and return the results in the usual format."
  [execute* query respond]
  (let [^GaData response (execute* query)
        headers          (.getColumnHeaders response)
        columns          (map header->column headers)
        getters          (map header->getter-fn headers)]
    (respond
     {:cols (for [col columns]
              (add-col-metadata query col))}
     (for [row (.getRows response)]
       (for [[data getter] (map vector row getters)]
         (getter data))))))
