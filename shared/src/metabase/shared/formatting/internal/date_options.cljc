(ns metabase.shared.formatting.internal.date-options
  "Normalization and helper predicates for date formatting options maps."
  (:require
   [metabase.shared.formatting.constants :as constants]
   [metabase.util :as u]))

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
  (let [options                               (-> (u/normalize-map options)
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
