(ns metabase.formatter.internal.date-formatters
  "The gory details of transforming date and time styles, with units and other options, into formatting functions.

  This namespace deals with the options only, not with specific dates, and returns reusable formatter functions."
  (:require
   [metabase.formatter.internal.date-builder :as builder]))

(def ^:private iso-format
  [:year "-" :month-dd "-" :day-of-month-dd "T" :hour-24-dd ":" :minute-dd ":" :second-dd])

(def ->iso
  "Datetime iso formatter."
  (builder/->formatter iso-format))

(def ^:private big-endian-day-format
  [:year "-" :month-dd "-" :day-of-month-dd])

(def big-endian-day
  "A cached, commonly used formatter for dates in `\"2022-04-22\"` form."
  (builder/->formatter big-endian-day-format))
