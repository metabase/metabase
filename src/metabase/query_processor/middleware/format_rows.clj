(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [metabase.util.date :as du]))

(defn- format-rows* [{:keys [report-timezone]} rows]
  (println "report-timezone:" report-timezone) ; NOCOMMIT
  (println "du/*report-timezone*:" du/*report-timezone*) ; NOCOMMIT
  (let [timezone (or report-timezone (System/getProperty "user.timezone"))]
    (printf "using %s\n" timezone) ; NOCOMMIT
    (for [row rows]
      (for [v row]
        ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
        ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
        ;;       GH issues: #2282, #2035
        (cond
          (du/is-time? v)
          (du/format-time v timezone)

          (du/is-temporal? v)
          (do
            (println (list 'du/->iso-8601-datetime v timezone) "->" (du/->iso-8601-datetime v timezone)) ; NOCOMMIT
            (du/->iso-8601-datetime v timezone))

          :else v)))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as iso8601 strings w/ timezone."
  [qp]
  (fn [{:keys [settings], {:keys [format-rows?] :or {format-rows? true}} :middleware, :as query}]
    (let [results (qp query)]
      (cond-> results
        (and format-rows? (:rows results)) (update :rows (partial format-rows* settings))))))
