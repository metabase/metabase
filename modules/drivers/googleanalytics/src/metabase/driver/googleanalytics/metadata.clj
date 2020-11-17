(ns metabase.driver.googleanalytics.metadata
  (:require [metabase.driver.google :as google]
            [metabase.driver.googleanalytics.client :as client])
  (:import com.google.api.services.analytics.Analytics
           [com.google.api.services.analytics.model Column Columns]
           java.util.Map))

(def ^:private redundant-date-fields
  "Set of column IDs covered by `unit->ga-dimension` in the GA QP.
   We don't need to present them because people can just use date bucketing on the `ga:date` field."
  #{"ga:minute"
    "ga:dateHour"
    "ga:hour"
    "ga:dayOfWeek"
    "ga:day"
    "ga:isoYearIsoWeek"
    "ga:week"
    "ga:yearMonth"
    "ga:month"
    "ga:year"
    ;; leave these out as well because their display names are things like "Month" but they're not dates so they're
    ;; not really useful
    "ga:cohortNthDay"
    "ga:cohortNthMonth"
    "ga:cohortNthWeek"})

(defn- fetch-columns
  ^Columns [^Analytics client]
  (google/execute (.list (.columns (.metadata client)) "ga")))

(defn column-attribute
  "Get the value of `attribute-name` for `column`.

    (column-attribute column :uiName)"
  [^Column column, attribute-name]
  (get (.getAttributes column) (name attribute-name)))

(defn- column-has-attributes? ^Boolean [^Column column, ^Map attributes-map]
  (or (empty? attributes-map)
      (reduce #(and %1 %2) (for [[k v] attributes-map]
                             (= (column-attribute column k) v)))))

(defn columns
  "Return a set of `Column`s for this database. Each table in a Google Analytics database has the same columns."
  ([database]
   (columns database {:status "PUBLIC", :type "DIMENSION"}))

  ([database attributes]
   (set (for [^Column column (.getItems (fetch-columns (client/database->client database)))
              :when          (and (not (contains? redundant-date-fields (.getId column)))
                                  (column-has-attributes? column attributes))]
          column))))
