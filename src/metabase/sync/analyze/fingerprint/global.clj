(ns metabase.sync.analyze.fingerprint.global
  "Logic for generating a `GlobalFingerprint` from a sequence of values for a Field of *any* type."
  (:require [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn global-fingerprint :- i/GlobalFingerprint
  "Generate a fingerprint of global information for Fields of all types."
  [values :- i/FieldSample]
  ;; TODO - this logic isn't as nice as the old logic that actually called the DB
  ;; We used to do (queries/field-distinct-count field field-values/auto-list-cardinality-threshold)
  ;; Consider whether we are so married to the idea of only generating fingerprints from samples that we
  ;; are ok with inaccurate counts like the one we'll surely be getting here
  {:distinct-count (count (distinct values))})
