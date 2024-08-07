(ns metabase.query-processor.streaming.common
  "Shared util fns for various export (download) streaming formats."
  (:require
   [clojure.string :as str]
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
  (let [global-settings (get (public-settings/custom-formatting) global-settings-key)
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
  [ordered-cols col-settings format-rows?]
  (for [col ordered-cols]
    (let [id-or-name      (or (and (:remapped_from col) (:fk_field_id col))
                              (:id col)
                              (:name col))
          col-settings'   (update-keys col-settings #(select-keys % [::mb.viz/field-id ::mb.viz/column-name]))
          format-settings (or (get col-settings' {::mb.viz/field-id id-or-name})
                              (get col-settings' {::mb.viz/column-name id-or-name})
                              (get col-settings' {::mb.viz/column-name (:name col)}))
          is-currency?    (or (isa? (:semantic_type col) :type/Currency)
                              (= (::mb.viz/number-style format-settings) "currency"))
          merged-settings (if is-currency?
                            (merge-global-settings format-settings :type/Currency)
                            format-settings)
          column-title    (or (when format-rows? (::mb.viz/column-title merged-settings))
                              (:display_name col)
                              (:name col))]
      (if (and is-currency? (::mb.viz/currency-in-header merged-settings true))
        (str column-title " (" (currency-identifier merged-settings) ")")
        column-title))))

(defn normalize-keys
  "Update map keys to remove namespaces from keywords and convert from snake to kebab case."
  [m]
  (update-keys m (fn [k] (some-> k name (str/replace #"_" "-") keyword))))

(def col-type
  "The dispatch function logic for format format-timestring.
  Find the highest type of the object."
  (some-fn :semantic_type :effective_type :base_type))

(defmulti global-type-settings
  "Look up the global viz settings based on the type of the column. A multimethod is used because they match well
  against type hierarchies."
  (fn [col _viz-settings] (col-type col)))

(defmethod global-type-settings :type/Temporal [_ {::mb.viz/keys [global-column-settings] :as _viz-settings}]
  (:type/Temporal global-column-settings {}))

(defmethod global-type-settings :type/Date [_ {::mb.viz/keys [global-column-settings] :as _viz-settings}]
  (merge
    (:type/Temporal global-column-settings {})
    {::mb.viz/time-enabled nil}))

(defmethod global-type-settings :type/Time [_ {::mb.viz/keys [global-column-settings] :as _viz-settings}]
  (merge
    (:type/Temporal global-column-settings {::mb.viz/time-style "h:mm A"})
    {::mb.viz/date-style ""}))

(defmethod global-type-settings :type/DateTime [_ {::mb.viz/keys [global-column-settings] :as _viz-settings}]
  (:type/Temporal global-column-settings {}))

(defmethod global-type-settings :type/Number [_ {::mb.viz/keys [global-column-settings] :as _viz-settings}]
  (:type/Number global-column-settings {}))

(defmethod global-type-settings :type/Currency [_ {::mb.viz/keys [global-column-settings] :as _viz-settings}]
  (merge
    {::mb.viz/number-style "currency"}
    (:type/Currency global-column-settings)))

(defmethod global-type-settings :default [_ _viz-settings]
  {})

(defn- column-setting-defaults
  "Look up the setting defaults based on any information in the column-settings. This is the case when a column has no
  special type (e.g. a number) but the user has specified that the type is currency. We prefer the currency defaults to
  the number defaults."
  [global-column-settings column-settings]
  (case (::mb.viz/number-style column-settings)
    "currency" (:type/Currency global-column-settings)
    {}))

(defn- ensure-global-viz-settings
  "The ::mb.viz/global-column-settings comes from (public-settings/custom-formatting) and is provided by the query
  processor in the `metabase.query-processor.middleware.visualization-settings` middleware _if_ `process-viz-settings?`
  is truthy. This function checks to see if those settings have been provided and adds them if they are not present."
  [{::mb.viz/keys [global-column-settings] :as viz-settings}]
  (cond-> viz-settings
    (nil? global-column-settings)
    (assoc ::mb.viz/global-column-settings
           (update-vals (public-settings/custom-formatting)
                        mb.viz/db->norm-column-settings-entries))))

(defn viz-settings-for-col
  "Get the unified viz settings for a column based on the column's metadata (if any) and user settings (⚙)."
  [{column-name :name metadata-column-settings :settings :keys [field_ref] :as col} viz-settings]
  (let [{::mb.viz/keys [global-column-settings] :as viz-settings} (ensure-global-viz-settings viz-settings)
        [_ field-id-or-name] field_ref
        all-cols-settings (-> viz-settings
                              ::mb.viz/column-settings
                              ;; update the keys so that they will have only the :field-id or :column-name
                              ;; and not have any metadata. Since we don't know the metadata, we can never
                              ;; match a key with metadata, even if we do have the correct name or id
                              (update-keys #(select-keys % [::mb.viz/field-id ::mb.viz/column-name])))
        column-settings (or (all-cols-settings {::mb.viz/field-id field-id-or-name})
                            (all-cols-settings {::mb.viz/column-name (or field-id-or-name column-name)}))]
    (merge
      ;; The default global settings based on the type of the column
      (global-type-settings col viz-settings)
      ;; Generally, we want to look up the default global settings based on semantic or effective type. However, if
      ;; a user has specified other settings, we should look up the base type of those settings and combine them.
      (column-setting-defaults global-column-settings column-settings)
      ;; User defined metadata -- Note that this transformation should probably go in
      ;; `metabase.query-processor.middleware.results-metadata/merge-final-column-metadata
      ;; to prevent repetition
      (mb.viz/db->norm-column-settings-entries metadata-column-settings)
      ;; Column settings coming from the user settings in the ui
      ;; (E.g. Click the ⚙️on the column)
      column-settings)))
