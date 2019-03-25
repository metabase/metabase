(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [metabase.util.date :as du]))

(defn- map-cell-builder
  [report-timezone]
  (let [timezone (or report-timezone (System/getProperty "user.timezone"))]
    (fn [cell]
      ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
      ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
      ;;       GH issues: #2282, #2035
      (cond
       (du/is-time? cell)
       (du/format-time cell timezone)

       (du/is-temporal? cell)
       (du/->iso-8601-datetime cell timezone)

       :else cell))))

(defn map-row-builder
  "Returns row mappe. Ex: format temporal values as iso8601 strings w/ timezone."
  [report-timezone]
  (let [map-fn (map-cell-builder report-timezone)]
    (fn [row]
      (map map-fn row))))

(defn- format-rows* [{:keys [report-timezone]} rows]
  (let [map-fn (map-row-builder report-timezone)]
    (map map-fn rows)))


(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as iso8601 strings w/ timezone."
  [qp]
  (fn [{:keys [settings middleware] :as query}]
    (let [results (qp query)]
      (if-not (and (:rows results)
                   (:format-rows? middleware true))
              results
              (update results :rows (partial format-rows* settings))))))
