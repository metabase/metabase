(ns metabase.query-processor.streaming.common
  "Shared util fns for various export (download) streaming formats."
  (:require
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.shared.util.currency :as currency]
   [metabase.util.date-2 :as u.date])
  (:import
   (clojure.lang ISeq)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)))

(defn in-result-time-zone
  "Set the time zone of a temporal value `t` to result timezone without changing the actual moment in time. e.g.

    ;; if result timezone is `US/Pacific`
    (apply-timezone #t \"2021-03-30T20:06:00Z\") -> #t \"2021-03-30T13:06:00-07:00\""
  [t]
  (u.date/with-time-zone-same-instant
   t
   (qp.store/cached ::results-timezone (t/zone-id (qp.timezone/results-timezone-id)))))

(defprotocol FormatValue
  "Protocol for specifying how objects of various classes in QP result rows should be formatted in various download
  results formats (e.g. CSV, as opposed to the 'normal' API response format, which doesn't use this logic)."
  (format-value [this]
    "Format this value in a QP result row appropriately for a results download, such as CSV."))

(extend-protocol FormatValue
  nil
  (format-value [_] nil)

  Object
  (format-value [this] this)

  ISeq
  (format-value [this]
    (mapv format-value this))

  LocalDate
  (format-value [t]
    (u.date/format t))

  LocalDateTime
  (format-value [t]
    (if (= (t/local-time t) (t/local-time 0))
      (format-value (t/local-date t))
      (u.date/format t)))

  LocalTime
  (format-value [t]
    (u.date/format t))

  OffsetTime
  (format-value [t]
    (u.date/format (in-result-time-zone t)))

  OffsetDateTime
  (format-value [t]
    (u.date/format (in-result-time-zone t)))

  ZonedDateTime
  (format-value [t]
    (format-value (t/offset-date-time t))))

(defn merge-global-settings
  "Merge format settings defined in the localization preferences into the format settings
  for a single column."
  [format-settings global-settings-key]
  (let [global-settings (global-settings-key (public-settings/custom-formatting))
        normalized      (mb.viz/db->norm-column-settings-entries global-settings)]
    (merge normalized format-settings)))

(defn currency-identifier
  "Given the format settings for a currency column, returns the symbol, code or name for the
  appropriate currency."
  [format-settings]
  (let [currency-code (::mb.viz/currency format-settings "USD")]
    (condp = (::mb.viz/currency-style format-settings "symbol")
      "symbol"
      (if (currency/supports-symbol? currency-code)
        (get-in currency/currency [(keyword currency-code) :symbol])
        ;; Fall back to using code if symbol isn't supported on the Metabase frontend
        currency-code)

      "code"
      currency-code

      "name"
      (get-in currency/currency [(keyword currency-code) :name_plural]))))

(defn column-titles
  "Generates the column titles that should be used in the export, taking into account viz settings."
  [ordered-cols col-settings]
  (for [col ordered-cols]
    (let [id-or-name      (or (and (:remapped_from col) (:fk_field_id col))
                              (:id col)
                              (:name col))
          col-settings'   (update-keys col-settings #(select-keys % [::mb.viz/field-id ::mb.viz/column-name]))
          format-settings (or (get col-settings' {::mb.viz/field-id id-or-name})
                              (get col-settings' {::mb.viz/column-name id-or-name}))
          is-currency?    (or (isa? (:semantic_type col) :type/Currency)
                              (= (::mb.viz/number-style format-settings) "currency"))
          merged-settings (if is-currency?
                            (merge-global-settings format-settings :type/Currency)
                            format-settings)
          column-title    (or (::mb.viz/column-title merged-settings)
                              (:display_name col)
                              (:name col))]
      (if (and is-currency? (::mb.viz/currency-in-header merged-settings true))
        (str column-title " (" (currency-identifier merged-settings) ")")
        column-title))))
