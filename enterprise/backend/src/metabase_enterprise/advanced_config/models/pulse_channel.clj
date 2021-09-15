(ns metabase-enterprise.advanced-config.models.pulse-channel
  (:require [clojure.string :as str]
            [flatland.ordered.set :as ordered.set]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting subscription-allowed-domains
  (deferred-tru "Allowed email address domain(s) for new DashboardSubscriptions and Alerts. Does not affect existing subscriptions.")
  :visibility :public
  :type       :csv
  ;; maintain the order of the domains so it doesn't shift around during the roundtrip after someone updates the list.
  :getter     #(not-empty (into (ordered.set/ordered-set) (setting/get-csv :subscription-allowed-domains))))

(defn validate-email-domains
  "Check that `email-addresses` associated with a [[metabase.models.pulse-channel]] are allowed based on the value of
  the [[subscription-allowed-domains]] Setting, if set. This function no-ops if `subscription-allowed-domains` is
  unset or if we do not have a premium token with the `:advanced-config` feature.

  This function is called by [[metabase.models.pulse-channel/validate-email-domains]] when Pulses are created and
  updated."
  [email-addresses]
  (when (premium-features/enable-advanced-config?)
    (when-let [allowed-domains (subscription-allowed-domains)]
      (doseq [email email-addresses
              :let  [domain (u/email->domain email)]]
        (assert (u/email? email)
                (tru "Invalid email address: {0}" (pr-str email)))
        (when-not (contains? allowed-domains domain)
          (throw (ex-info (tru "You cannot create new subscriptions for the domain {0}. Allowed domains are: {1}"
                               (pr-str domain)
                               (str/join ", " allowed-domains))
                          {:email           email
                           :allowed-domains allowed-domains
                           :status-code     403})))))))
