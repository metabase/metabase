(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [metabase.util.date :as du]
            [metabase.query-processor.timezone :as qp.timezone])
  (:import [java.util Calendar Date TimeZone]
           java.sql.Time
           org.joda.time.DateTime))

(defprotocol FormatValue
  (format-value [v timezone-id]
    "Serialize a value in the QP results. You can add impementations for driver-specific types as needed."))

(extend-protocol FormatValue
  nil
  (format-value [_ _] nil)

  Object
  (format-value [v _] v)

  Time
  (format-value [v timezone-id]
    (du/format-time v timezone-id))

  Date
  (format-value [v timezone-id]
    (du/->iso-8601-datetime v timezone-id))

  ;; TODO - not sure if this is acutally used?
  DateTime
  (format-value [v timezone-id]
    (du/->iso-8601-datetime v timezone-id)))

(defn- format-rows* [rows]
  (let [timezone-id (qp.timezone/results-timezone-id)]
    (for [row rows]
      (for [v row]
        (format-value v timezone-id)))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as iso8601 strings w/ timezone."
  [qp]
  (fn [{{:keys [format-rows?] :or {format-rows? true}} :middleware, :as query}]
    (let [results (qp query)]
      (cond-> results
        (and format-rows? (:rows results)) (update :rows format-rows*)))))
