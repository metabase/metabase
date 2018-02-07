(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [metabase.util :as u]))

(defn- format-rows* [{:keys [report-timezone]} rows]
  (let [timezone (or report-timezone (System/getProperty "user.timezone"))]
    (for [row rows]
      (for [v row]
        ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
        ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
        ;;       GH issues: #2282, #2035
        (cond
          (u/is-time? v)
          (u/format-time v timezone)

          (u/is-temporal? v)
          (u/->iso-8601-datetime v timezone)

          :else v)))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as iso8601 strings w/ timezone."
  [qp]
  (fn [{:keys [settings middleware] :as query}]
    (let [results (qp query)]
      (if-not (and (:rows results)
                   (:format-rows? middleware true))
        results
        (update results :rows (partial format-rows* settings))))))
