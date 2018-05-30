(ns metabase.sync.analyze.fingerprint.datetime
  "Logic for generating a `DateTimeFingerprint` from a sequence of values for a `:type/DateTime` Field."
  (:require [clj-time
             [coerce :as t.coerce]
             [core :as t]]
            [medley.core :as m]
            [metabase.sync.interface :as i]
            [metabase.util.date :as du]
            [redux.core :as redux]
            [schema.core :as s]))

(s/defn datetime-fingerprint :- i/DateTimeFingerprint
  "Generate a fingerprint containing information about values that belong to a `DateTime` Field."
  [values :- i/FieldSample]
  (transduce (map du/str->date-time)
             (redux/post-complete
              (redux/fuse {:earliest t/min-date
                           :latest   t/max-date})
              (partial m/map-vals str))
             [(t.coerce/from-long Long/MAX_VALUE) (t.coerce/from-long 0)]
             values))
