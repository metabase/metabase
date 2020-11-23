(ns metabase.mbql.predicates
  "Predicate functions for checking whether something is a valid instance of a given MBQL clause."
  (:require [metabase.mbql.schema :as mbql.s]
            [schema.core :as s]))

;; This namespace only covers a few things, please add more stuff here as we write the functions so we can use them
;; elsewhere

(def ^{:arglists '([unit])} TimeUnit?
  "Is `unit` a datetime bucketing unit referring only to time, such as `hour` or `minute`?"
  (complement (s/checker mbql.s/TimeUnit)))

(def ^{:arglists '([unit])} DatetimeFieldUnit?
  "Is `unit` a valid datetime bucketing unit?"
  (complement (s/checker mbql.s/DatetimeFieldUnit)))

(def ^{:arglists '([ag-clause])} Aggregation?
  "Is this a valid Aggregation clause?"
  (complement (s/checker mbql.s/Aggregation)))

(def ^{:arglists '([field-clause])} Field?
  "Is this a valid Field clause?"
  (complement (s/checker mbql.s/Field)))

(def ^{:arglists '([filter-clause])} Filter?
  "Is this a valid `:filter` clause?"
  (complement (s/checker mbql.s/Filter)))
