(ns metabase.util.date-2.parse
  (:require [clojure.string :as str]
            [java-time :as t]
            [metabase.util.date-2.common :as common]
            [metabase.util.date-2.parse.builder :as b]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s])
  (:import [java.time LocalDateTime OffsetDateTime OffsetTime ZonedDateTime ZoneOffset]
           java.time.format.DateTimeFormatter
           [java.time.temporal Temporal TemporalAccessor TemporalField TemporalQueries]))

(def ^:private ^{:arglists '([temporal-accessor query])} query
  (let [queries {:local-date  (TemporalQueries/localDate)
                 :local-time  (TemporalQueries/localTime)
                 :zone-offset (TemporalQueries/offset)
                 :zone-id     (TemporalQueries/zoneId)}]
    (fn [^TemporalAccessor temporal-accessor query]
      (.query temporal-accessor (queries query)))))

(defn- normalize [s]
  (-> s
      ;; HACK - haven't figured out how to get the parser builder to allow HHmm offsets (i.e., no colons) yet, so add
      ;; one in there if needed. TODO - what about HH:mm:ss offsets? Will we ever see those?
      (str/replace #"([+-][0-2]\d)([0-5]\d)$" "$1:$2")
      (str/replace #"([0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?[+-][0-2]\d$)" "$1:00")))

(defn all-supported-fields
  "Returns a map of supported temporal field lisp-style name -> value, e.g.

    (parse-special-case (.parse
                         (b/formatter
                          (b/value :year 4)
                          (b/value :iso/week-of-year 2))
                         \"201901\"))
    ;; -> {:year 2019, :iso-week-of-year 1}"
  [^TemporalAccessor temporal-accessor]
  (into {} (for [[k ^TemporalField field] common/temporal-field
                 :when                    (.isSupported temporal-accessor field)]
             [k (.getLong temporal-accessor field)])))

(s/defn parse-with-formatter :- (s/maybe Temporal)
  "Parse a String with a DateTimeFormatter, returning an appropriate instance of an `java.time` temporal class."
  [formattr s :- (s/maybe s/Str)]
  {:pre [((some-fn string? nil?) s)]}
  (when-not (str/blank? s)
    (let [formattr          (t/formatter formattr)
          s                 (normalize s)
          temporal-accessor (.parse formattr s)
          local-date        (query temporal-accessor :local-date)
          local-time        (query temporal-accessor :local-time)
          zone-offset       (query temporal-accessor :zone-offset)
          zone-id           (or (query temporal-accessor :zone-id)
                                (when (= zone-offset ZoneOffset/UTC)
                                  (t/zone-id "UTC")))
          literal-type      [(cond
                               zone-id     :zone
                               zone-offset :offset
                               :else       :local)
                             (cond
                               (and local-date local-time) :datetime
                               local-date                  :date
                               local-time                  :time)]]
      (case literal-type
        [:zone   :datetime] (ZonedDateTime/of  local-date local-time zone-id)
        [:offset :datetime] (OffsetDateTime/of local-date local-time zone-offset)
        [:local  :datetime] (LocalDateTime/of  local-date local-time)
        [:zone   :date]     (ZonedDateTime/of  local-date (t/local-time 0) zone-id)
        [:offset :date]     (OffsetDateTime/of local-date (t/local-time 0) zone-offset)
        [:local  :date]     local-date
        [:zone   :time]     (OffsetTime/of local-time zone-offset)
        [:offset :time]     (OffsetTime/of local-time zone-offset)
        [:local  :time]     local-time
        (throw (ex-info (tru "Don''t know how to parse {0} using format {1}" (pr-str s) (pr-str formattr))
                 {:s                s
                  :formatter        formattr
                  :supported-fields (all-supported-fields temporal-accessor)}))))))

(def ^:private ^DateTimeFormatter date-formatter*
  (b/formatter
   (b/value :year 4 10 :exceeds-pad)
   (b/optional
    "-"
    (b/value :month-of-year 2)
    (b/optional
     "-"
     (b/value :day-of-month 2)))
   (b/default-value :month-of-year 1)
   (b/default-value :day-of-month 1)))

(def ^:private ^DateTimeFormatter time-formatter*
  (b/formatter
   (b/value :hour-of-day 2)
   (b/optional
    ":"
    (b/value :minute-of-hour 2)
    (b/optional
     ":"
     (b/value :second-of-minute 2)
     (b/optional
      (b/fraction :nano-of-second 0 9, :decimal-point? true))))
   (b/default-value :minute-of-hour 0)
   (b/default-value :second-of-minute 0)
   (b/default-value :nano-of-second 0)))

(def ^:private ^DateTimeFormatter offset-formatter*
  (b/formatter
   (b/optional " ")
   (b/optional
    (b/zone-offset))
   (b/optional
    (b/zone-id))))

(def ^:private ^DateTimeFormatter formatter
  (b/formatter
   (b/case-insensitive
    (b/optional
     date-formatter*)
    (b/optional "T")
    (b/optional " ")
    (b/optional
     time-formatter*)
    (b/optional
     offset-formatter*))))

(defn parse
  "Parse a string into a `java.time` object."
  [^String s]
  (parse-with-formatter formatter s))
