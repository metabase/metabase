(ns metabase.util.date-2.common
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util :as u])
  (:import
   (java.time ZoneId ZoneOffset)
   (java.time.temporal ChronoField IsoFields TemporalField WeekFields)))

(set! *warn-on-reflection* true)

;; TODO - not sure this belongs here, it seems to be a bit more general than just `date-2`.

(defn static-instances
  "Utility function to get the static members of a class. Returns map of `lisp-case` keyword names of members -> value."
  ([^Class klass]
   (static-instances klass klass))

  ([^Class klass ^Class target-class]
   (into {} (for [^java.lang.reflect.Field f (.getFields klass)
                  :when                      (.isAssignableFrom target-class (.getType f))]
              [(keyword (u/lower-case-en (str/replace (.getName f) #"_" "-")))
               (.get f nil)]))))

(def ^TemporalField temporal-field
  "Map of lisp-style-name -> TemporalField for all the various TemporalFields we use in day-to-day parsing and other
  temporal operations."
  (merge
   ;; honestly I have no idea why there's both IsoFields/WEEK_OF_WEEK_BASED_YEAR and (.weekOfWeekBasedYear
   ;; WeekFields/ISO)
   (into {} (for [[k v] (static-instances IsoFields TemporalField)]
              [(keyword "iso" (name k)) v]))
   (static-instances ChronoField)
   {:week-fields/iso-week-based-year         (.weekBasedYear WeekFields/ISO)
    :week-fields/iso-week-of-month           (.weekOfMonth WeekFields/ISO)
    :week-fields/iso-week-of-week-based-year (.weekOfWeekBasedYear WeekFields/ISO)
    :week-fields/iso-week-of-year            (.weekOfYear WeekFields/ISO)}
   {:week-fields/week-based-year         (.weekBasedYear WeekFields/SUNDAY_START)
    :week-fields/week-of-month           (.weekOfMonth WeekFields/SUNDAY_START)
    :week-fields/week-of-week-based-year (.weekOfWeekBasedYear WeekFields/SUNDAY_START)
    :week-fields/week-of-year            (.weekOfYear WeekFields/SUNDAY_START)}))

;; We don't know what zone offset to shift this to, since the offset for a zone-id can vary depending on the date
;; part of a temporal value (e.g. DST vs non-DST). So just adjust to the non-DST "standard" offset for the zone in
;; question.
(defn standard-offset
  "Standard (non-DST) offset for a time zone, for cases when we don't have date information.  Gets the offset for the
  given `zone-id` at January 1 of the current year (since that is the best we can do in this situation)."
  ^ZoneOffset [^ZoneId zone-id]
  (.. zone-id getRules (getStandardOffset (t/instant (t/offset-date-time (-> (t/zoned-date-time) t/year t/value) 1 1)))))
