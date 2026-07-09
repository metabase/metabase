(ns metabase-enterprise.mfa.management
  "/api/ee/mfa endpoints that require a signed-in user (mounted behind auth in
  `metabase-enterprise.mfa.routes`).

  Not premium-feature-gated: these manage an *existing* enrollment, and per the fail-closed
  license-lapse semantics a lapsed license must never strand an enrolled user."
  (:require
   [metabase-enterprise.mfa.enrollment :as enrollment]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.config.core :as config]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.schema :as ms]
   [throttle.core :as throttle]))

(set! *warn-on-reflection* true)

(def ^:private regenerate-throttler
  ;; re-auth takes a 6-digit code, so this path needs brute-force limits like /verify
  (throttle/make-throttler :user-id, :attempts-threshold 5))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(api.macros/defendpoint :post "/recovery-codes" :- [:map [:codes [:sequential ms/NonBlankString]]]
  "Regenerate the current user's recovery codes, invalidating the entire previous set. Re-auth is a
  fresh second factor — a TOTP code or an unused recovery code — so a stolen password alone can
  never rotate the codes. The plaintext codes are returned exactly once; only hashes are stored."
  [_route-params
   _query-params
   {:keys [code]} :- [:map [:code ms/NonBlankString]]]
  (when-not throttling-disabled?
    (throttle/check regenerate-throttler api/*current-user-id*))
  (when-not (enrollment/verify-attempt! api/*current-user-id* code nil)
    (throw (ex-info (str (deferred-tru "Invalid authentication code."))
                    {:status-code 401})))
  {:codes (enrollment/reset-recovery-codes! api/*current-user-id*)})
