(ns metabase.shared.formatting.internal.date-options
  "Normalization and helper predicates for date formatting options maps."
  (:require
   [metabase.shared.formatting.constants :as constants]
   [metabase.shared.util.options :as options]))

(def ^:private default-options
  {:date-enabled   true
   :date-style     constants/default-date-style
   :time-style     constants/default-time-style
   :output-density "default"
   :unit           :default})

(def ^:private units-with-hour
  #{:default  :minute  :hour  :hour-of-day})

(def ^:private units-with-day
  #{nil :default :minute :hour :day :week})

(def ^:private time-only?
  #{:hour-of-day})

(def ^:private normalize-options
  (let [decoder (options/options-decoder {:compact "compact"
                                          :date-abbreviate "date_abbreviate"
                                          :date-format "date_format"
                                          :date-separator "date_separator"
                                          :date-style "date_style"
                                          :decimals "decimals"
                                          :is-exclude "isExclude"
                                          :local "local"
                                          :maximum-fraction-digits "maximumFractionDigits"
                                          :minimum-fraction-digits "minimumFractionDigits"
                                          :no-range "noRange"
                                          :number-separators "number_separators"
                                          :time-enabled "time_enabled"
                                          :time-style "time_style"
                                          :time-format "time_format"
                                          :type "type"
                                          :unit "unit"
                                          :view-as "view_as"
                                          :weekday-enabled "weekday_enabled"})]
    #?(:clj  decoder
       :cljs #(-> %
                  decoder
                  (m/update-existing :time-format js->clj)
                  (m/update-existing :date-format js->clj)
                  (m/update-existing :date-style  js->clj)))))

(defn prepare-options
  "Normalizes the options map. This returns a Clojure map with `:kebab-case-keys`, whatever the input object or
  key spelling.

  Mixes in the [[default-options]], plus:
  - defaulting `:time-enabled` to `\"minutes\"` if the `:unit` is smaller than a day.
  - transforming `:date-format` and `:time-format` to the corresponding styles.
  - transforming `:type` of `\"cell\"` or `\"tooltip\"` to `condensed` output density
  - transforming `:compact true` to `:output-density \"compact\"` (takes precedence over `\"condensed\"`).
  - make `:unit` a keyword"
  [options]
  (let [options                               (-> (normalize-options options)
                                                  (update :unit keyword))
        {:keys [compact date-abbreviate
                type unit]
         :as options}                         (merge default-options
                                                     (when (units-with-hour (:unit options))
                                                       {:time-enabled "minutes"})
                                                     options)]
    (cond-> options
      true                         (dissoc :compact :date-abbreviate)
      (time-only? unit)            (assoc :date-enabled false)
      (= type "tooltip")           (assoc :output-density "condensed")
      (or compact date-abbreviate) (assoc :output-density "compact")
      (not (units-with-day unit))  (dissoc :weekday-enabled))))
