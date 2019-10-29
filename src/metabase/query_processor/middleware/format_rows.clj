(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [java-time :as t]
            [metabase.query-processor.timezone :as qp.timezone]
            [potemkin.types :as p.types])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId]))

(p.types/defprotocol+ FormatValue
  (format-value [v, ^ZoneId timezone-id]
    "Serialize a value in the QP results. You can add impementations for driver-specific types as needed."))

(extend-protocol FormatValue
  nil
  (format-value [_ _] nil)

  Object
  (format-value [v _]
    #_(println "(class v) v:" (class v) v) ; NOCOMMIT
    v)

  LocalTime
  (format-value [t timezone-id]
    (t/format :iso-offset-time (t/offset-time t timezone-id)))

  ;; TODO - this is a little screwy, for `OffsetDateTime` and `ZonedDateTime` we convert them into the `timezone-id`
  ;; (by adjusting offset as needed); because `OffsetTime` doesn't have a date (and adjusting offset can't be done
  ;; with Zone ID alone), return it *without* adjusting it into `timezone-id`
  OffsetTime
  (format-value [t _]
    (t/format :iso-offset-time t))

  LocalDate
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (t/offset-date-time t (t/local-time 0) timezone-id)))

  LocalDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (t/offset-date-time t timezone-id)))

  Instant
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (t/offset-date-time t timezone-id)))

  OffsetDateTime
  (format-value [t, ^ZoneId timezone-id]
    (t/format :iso-offset-date-time
              (let [rules  (.getRules timezone-id)
                    offset (.getOffset rules (t/instant t))]
                (t/with-offset-same-instant t offset))))


  ZonedDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time
              (t/offset-date-time (t/with-zone-same-instant t timezone-id)))))

(defn- format-rows* [rows]
  (let [timezone-id (t/zone-id (qp.timezone/results-timezone-id))]
    (for [row rows]
      (for [v row]
        (format-value v timezone-id)))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as ISO-8601 strings w/ timezone offset."
  [qp]
  (fn [{{:keys [format-rows?] :or {format-rows? true}} :middleware, :as query}]
    (let [results (qp query)]
      (cond-> results
        (and format-rows? (:rows results)) (update :rows format-rows*)))))
