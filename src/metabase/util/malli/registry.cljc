(ns metabase.util.malli.registry
  (:refer-clojure :exclude [def])
  (:require
   [clojure.test.check.generators :as gen]
   [malli.core :as mc]
   [malli.generator :as mg]
   [malli.impl.regex :as re]
   [malli.registry :as mr]
   [malli.util :as mut]
   #?@(:clj ([malli.experimental.time :as malli.time])))
  #?(:cljs (:require-macros [metabase.util.malli.registry]))
  (:import
   #?@(:clj ((java.time Duration LocalDate LocalDateTime
                        LocalTime Instant ZonedDateTime
                        OffsetDateTime ZoneId OffsetTime
                        ZoneOffset)))))

#?(:clj
   (do
     (def ^:private gen-zone-offset
       (letfn [(align-sign [leader follower]
                 (cond-> follower
                   (neg? leader) -))]
         (gen/let [hours   (gen/large-integer* {:min -12 :max 14})
                   minutes (gen/fmap (partial align-sign hours) (gen/large-integer* {:min 0 :max 59}))
                   seconds (gen/fmap (partial align-sign hours) (gen/large-integer* {:min 0 :max 59}))]
           (ZoneOffset/ofHoursMinutesSeconds (int hours) (int minutes) (int seconds)))))

     (def ^:private gen-zone-id
       (gen/one-of [(gen/fmap #(ZoneId/ofOffset "UTC" %) gen-zone-offset)
                    (gen/elements (mapv #(ZoneId/of %) (ZoneId/getAvailableZoneIds)))]))

     (def ^:private gen-duration
       (gen/let [^Long years   (gen/large-integer* {:min -100000 :max 100000})
                 ^Long months  (gen/large-integer* {:min -100000 :max 100000})
                 ^Long days    (gen/large-integer* {:min -100000 :max 100000})
                 ^Long hours   (gen/large-integer* {:min -100000 :max 100000})
                 ^Long minutes (gen/large-integer* {:min -100000 :max 100000})
                 ^Long seconds (gen/large-integer* {:min -100000 :max 100000})
                 ^Long millis  (gen/large-integer* {:min -100000 :max 100000})
                 ^Long nanos   gen/large-integer]
         (.. (Duration/ZERO)
             (plusDays (+ (* years 365) (* months 30) days))
             (plusHours hours)
             (plusMinutes minutes)
             (plusSeconds seconds)
             (plusMillis millis)
             (plusNanos nanos))))

     (def ^:private gen-instant
       (gen/let [^Duration duration gen-duration]
         (.plus (Instant/now) duration)))

     (def ^:private gen-local-date
       (gen/let [^Long years  (gen/large-integer* {:min -100000 :max 100000})
                 ^Long months (gen/large-integer* {:min -100000 :max 100000})
                 ^Long days   (gen/large-integer* {:min -100000 :max 100000})]
         (.. (LocalDate/now)
             (plusYears years)
             (plusMonths months)
             (plusDays days))))

     (def ^:private gen-local-time
       (gen/let [^Long hours   (gen/large-integer* {:min -23 :max 23})
                 ^Long minutes (gen/large-integer* {:min -59 :max 59})
                 ^Long seconds (gen/large-integer* {:min -59 :max 59})
                 ^Long nanos   gen/large-integer]
         (.. (LocalTime/now)
             (plusHours hours)
             (plusMinutes minutes)
             (plusSeconds seconds)
             (plusNanos nanos))))

     (def ^:private gen-local-date-time
       (gen/let [^LocalDate  date gen-local-date
                 ^LocalTime  time gen-local-time]
         (LocalDateTime/of date time)))

     (defmethod mg/-schema-generator :time/zone-offset
       [_schema _options]
       gen-zone-offset)

     (defmethod mg/-schema-generator :time/zone-id
       [_schema _options]
       gen-zone-id)

     (defmethod mg/-schema-generator :time/duration
       [_schema _options]
       gen-duration)

     (defmethod mg/-schema-generator :time/instant
       [_schema _options]
       gen-instant)

     (defmethod mg/-schema-generator :time/local-date
       [_schema _options]
       gen-local-date)

     (defmethod mg/-schema-generator :time/local-time
       [_schema _options]
       gen-local-time)

     (defmethod mg/-schema-generator :time/local-date-time
       [_schema _options]
       gen-local-date-time)

     (defmethod mg/-schema-generator :time/offset-time
       [_schema _options]
       (gen/let [^LocalTime  time gen-local-time
                 ^ZoneOffset offset gen-zone-offset]
         (OffsetTime/of time offset)))

     (defmethod mg/-schema-generator :time/offset-date-time
       [_schema _options]
       (gen/let [^LocalDateTime date-time gen-local-date-time
                 ^ZoneOffset    offset gen-zone-offset]
         (OffsetDateTime/of date-time offset)))

     (defmethod mg/-schema-generator :time/zoned-date-time
       [_schema _options]
       (gen/let [^LocalDateTime date-time gen-local-date-time
                 ^ZoneId        zone-id gen-zone-id]
         (ZonedDateTime/of date-time zone-id)))))

(comment
  (mg/sample :time/zoned-date-time {:size 50})
  nil)

;;; Implementation of :vcatn schema: stolen from malli sources,
;;; would be nice to find a more composable way.
(defn- schemas []
  (let [-re-min-max @#'mc/-re-min-max]
    {:vcatn (mc/-sequence-entry-schema
             {:type :vcatn, :child-bounds {}
              :re-validator (fn [_ children] (apply re/cat-validator children))
              :re-explainer (fn [_ children] (apply re/cat-explainer children))
              :re-parser (fn [_ children] (apply re/catn-parser children))
              :re-unparser (fn [_ children] (apply re/catn-unparser children))
              :re-transformer (fn [_ children] (apply re/cat-transformer children))
              :re-min-max (fn [_ children] (reduce (partial -re-min-max +)
                                                  {:min 0, :max 0}
                                                  (mc/-vmap last children)))})}))

(defn- -vcat-gen [schema options]
  (let [gs (->> (mc/children schema options)
                (map #(mg/-regex-generator (#'mg/entry->schema %) options)))]
    (if (some mg/-unreachable-gen? gs)
      (mg/-never-gen options)
      (->> gs
           (apply gen/tuple)
           ;; generate vectors instead of lazy sequences
           (gen/fmap #(into [] cat %))))))

(defmethod mg/-schema-generator :vcatn
  [schema options]
  (-vcat-gen schema options))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas)
               (mut/schemas)
               #?(:clj (malli.time/schemas))
               (schemas))))

(defonce ^:private registry (mr/mutable-registry registry*))

(mr/set-default-registry! registry)

(defn register!
  "Register a spec with our Malli spec "
  [type schema]
  (swap! registry* assoc type schema)
  nil)

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     [type schema]
     `(register! ~type ~schema)))
