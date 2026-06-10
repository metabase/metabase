(ns metabase.metabot.schema.validate
  "Boundary validation for the v2 message formats: throw in dev/test so format
  drift fails loudly, log-only in prod so a drifted payload never breaks a live
  stream, a write, or a read."
  (:require
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(comment schema.v2/keep-me)

(set! *warn-on-reflection* true)

(defn check
  "Validate `value` against the registered `schema`. On mismatch, throw in
  dev/test and log a warning in prod. Returns `value` either way, so prod
  callers proceed with the original value."
  [schema context value]
  (when-let [error (some-> (mr/explain schema value) me/humanize)]
    (if (or config/is-dev? config/is-test?)
      (throw (ex-info (str "Invalid " context) {:context context :error error :value value}))
      (log/warn "Invalid metabot v2 payload" {:context context :error error})))
  value)
