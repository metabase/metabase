(ns metabase.usage-metadata.candidate-service
  "Public service for the persisted Library cleanup workflow.

  Candidate extraction is exposed through [[metabase.usage-metadata.core]]. This namespace keeps
  the durable snapshot implementation private while providing the small set of operations needed
  by the enterprise API and the scheduled refresh task."
  (:require
   [metabase.usage-metadata.candidates :as candidates]))

(set! *warn-on-reflection* true)

(def algorithm-version
  "Version of persisted candidate materialization behavior."
  candidates/algorithm-version)

(def signature-version
  "Version of the canonical identity used by durable dismissals."
  candidates/signature-version)

(defn latest-successful-run
  "Return the newest completely materialized candidate snapshot."
  []
  (candidates/latest-successful-run))

(defn active-run
  "Return the newest queued or running candidate refresh."
  []
  (candidates/active-run))

(defn refresh-status
  "Return the successful, active, and failed refresh state used by the API."
  []
  (candidates/refresh-status))

(defn queue-refresh!
  "Atomically queue a refresh unless one is already queued or running."
  [trigger requested-by]
  (candidates/queue-refresh! trigger requested-by))

(defn run-refresh!
  "Materialize a queued refresh run."
  [run]
  (candidates/run-refresh! run))

(defn candidate-current?
  "Whether a persisted candidate belongs to the current successful snapshot."
  [candidate]
  (candidates/candidate-current? candidate))

(defn candidate
  "Return a persisted candidate by id."
  [candidate-id]
  (candidates/candidate candidate-id))

(defn exact-existing-entity
  "Return an active exact Measure or Segment match for a candidate, when one exists."
  [candidate]
  (candidates/exact-existing-entity candidate))

(defn mark-modeled!
  "Record an exact Library entity match in the current snapshot."
  [candidate entity]
  (candidates/mark-modeled! candidate entity))

(defn dismiss!
  "Globally dismiss a semantic candidate."
  [candidate user-id reason]
  (candidates/dismiss! candidate user-id reason))

(defn restore!
  "Remove a candidate's global dismissal."
  [candidate]
  (candidates/restore! candidate))
