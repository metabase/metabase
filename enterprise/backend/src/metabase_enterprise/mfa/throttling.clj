(ns metabase-enterprise.mfa.throttling
  "Brute-force throttling helpers shared by the MFA endpoints.

  Second-factor codes are 6 digits, so these limits are load-bearing. Verification-style paths
  must count only *failed* attempts (like the first-factor login throttle) — counting successes
  locks out a legitimately busy user. Send-style paths (emailing a code) count every call, because
  there the success is the thing being rate-limited."
  (:require
   [metabase.config.core :as config]
   [throttle.core :as throttle]))

(set! *warn-on-reflection* true)

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(defn check
  "Record an attempt on `throttler` for `throttle-key` and throw when over the limit. Counts every
  call, success or failure — use only where success itself must be rate-limited (e.g. sends).
  No-op when `MB_DISABLE_SESSION_THROTTLE` is set."
  [throttler throttle-key]
  (when-not throttling-disabled?
    (throttle/check throttler throttle-key)))

(defn call-with-failure-throttling
  "Run `f` guarded by `pairs` of `[throttler throttle-key]`. Only a thrown exception counts as an
  attempt; successful calls are free. No-op when `MB_DISABLE_SESSION_THROTTLE` is set."
  [pairs f]
  (if throttling-disabled?
    (f)
    (try
      ((reduce (fn [g [throttler throttle-key]]
                 (fn [] (throttle/do-with-throttling throttler throttle-key g)))
               f
               pairs))
      (catch clojure.lang.ExceptionInfo e
        ;; `throttle/do-with-throttling`'s over-the-limit exception carries `:errors` but no
        ;; `:status-code` (unlike `throttle/check`'s), which would surface as a 500
        (let [data (ex-data e)]
          (if (and (:errors data) (nil? (:status-code data)))
            (throw (ex-info (ex-message e) (assoc data :status-code 400) e))
            (throw e)))))))
