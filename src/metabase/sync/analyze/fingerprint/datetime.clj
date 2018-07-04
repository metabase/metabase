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

(defn- monoid
  [f init]
  (fn
    ([] init)
    ([acc] (f acc))
    ([acc x] (f acc x))))

(s/defn datetime-fingerprint :- i/DateTimeFingerprint
  "Generate a fingerprint containing information about values that belong to a `DateTime` Field."
  [values :- i/FieldSample]
  (transduce ((map du/str->date-time)
              (redux/post-complete
               (redux/fuse {:earliest (monoid t/min-date (t.coerce/from-long Long/MAX_VALUE))
                            :latest   (monoid t/min-date (t.coerce/from-long 0))})
               (partial m/map-vals str)))
             [(t.coerce/from-long Long/MAX_VALUE) (t.coerce/from-long 0)]
             values))
