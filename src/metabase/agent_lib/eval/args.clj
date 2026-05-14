(ns metabase.agent-lib.eval.args
  "Argument normalization for structured MBQL helper invocation."
  (:require
   [metabase.agent-lib.common.coercions :refer [normalize-percentile-value]]
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.common.literals :refer [scalar-literal?]]))

(def temporal-unit-values
  "Allowed string enum values for temporal units and buckets."
  #{"millisecond" "second" "minute" "hour" "day" "week" "month" "quarter" "year"})

(def ^:private time-interval-amount-keywords
  "String values for time-interval amount that should be keywordized."
  #{"current" "last" "next"})

(def order-direction-values
  "Allowed string enum values for order direction."
  #{"asc" "desc"})

(def join-strategy-values
  "Allowed string enum values for explicit join strategy."
  #{"left-join" "inner-join" "right-join" "full-join"})

(def join-fields-values
  "Allowed string enum values for explicit joined-field selection."
  #{"all" "none"})

(def binning-strategy-values
  "Allowed string enum values for binning strategy."
  #{"bin-width" "default" "num-bins"})

(set! *warn-on-reflection* true)

(defn keyword-enum
  "Normalize string enum values into keywords for lib helpers."
  [path label value allowed-values]
  (cond
    (keyword? value)
    (if (allowed-values (name value))
      value
      (invalid-program! path (str label " must be one of " (sort allowed-values))))

    (string? value)
    (if (allowed-values value)
      (keyword value)
      (invalid-program! path (str label " must be one of " (sort allowed-values))))

    :else
    (invalid-program! path (str label " must be a string enum value"))))

(defn normalize-helper-args
  "Normalize helper arguments into the forms expected by trusted lib bindings."
  [path op args]
  (case (name op)
    "in"
    (if (and (= 2 (count args))
             (vector? (second args))
             (every? scalar-literal? (second args)))
      (into [(first args)] (second args))
      args)

    "not-in"
    (if (and (= 2 (count args))
             (vector? (second args))
             (every? scalar-literal? (second args)))
      (into [(first args)] (second args))
      args)

    "time-interval"
    (-> args
        (update 1 (fn [amount]
                    (cond
                      (keyword? amount)                       amount
                      (time-interval-amount-keywords amount)  (keyword amount)
                      :else                                   amount)))
        (update 2 #(keyword-enum (conj path 3) "temporal unit" % temporal-unit-values)))

    "relative-time-interval"
    (-> args
        (update 2 #(keyword-enum (conj path 3) "temporal unit" % temporal-unit-values))
        (update 4 #(keyword-enum (conj path 5) "temporal unit" % temporal-unit-values)))

    "with-temporal-bucket"
    (update args 1 #(keyword-enum (conj path 2) "temporal bucket" % temporal-unit-values))

    "with-binning"
    (update args 1 (fn [binning]
                     (if (and (map? binning)
                              (some? (:strategy binning)))
                       (update binning :strategy
                               #(keyword-enum (conj path 2 :strategy)
                                              "binning strategy"
                                              %
                                              binning-strategy-values))
                       binning)))

    "interval"
    (update args 1 #(keyword-enum (conj path 2) "interval unit" % temporal-unit-values))

    "relative-datetime"
    (update args 1 #(keyword-enum (conj path 2) "temporal unit" % temporal-unit-values))

    "absolute-datetime"
    (update args 1 #(keyword-enum (conj path 2) "temporal unit" % temporal-unit-values))

    "datetime-add"
    (update args 2 #(keyword-enum (conj path 3) "temporal unit" % temporal-unit-values))

    "datetime-diff"
    (update args 2 #(keyword-enum (conj path 3) "temporal unit" % temporal-unit-values))

    "datetime-subtract"
    (update args 2 #(keyword-enum (conj path 3) "temporal unit" % temporal-unit-values))

    "order-by"
    (if (= 2 (count args))
      (update args 1 #(keyword-enum (conj path 2) "order direction" % order-direction-values))
      args)

    "percentile"
    (update args 1 normalize-percentile-value)

    "with-join-strategy"
    (update args 1 #(keyword-enum (conj path 2) "join strategy" % join-strategy-values))

    "with-join-fields"
    (update args 1 (fn [value]
                     (cond
                       (or (keyword? value) (string? value))
                       (keyword-enum (conj path 2) "join fields mode" value join-fields-values)

                       (sequential? value)
                       value

                       (some? value)
                       [value]

                       :else
                       value)))

    args))
