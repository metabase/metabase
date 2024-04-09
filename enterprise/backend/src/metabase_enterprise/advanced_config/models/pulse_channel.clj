(ns metabase-enterprise.advanced-config.models.pulse-channel
  (:require
   [clojure.string :as str]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting subscription-allowed-domains
  (deferred-tru "Allowed email address domain(s) for new Dashboard Subscriptions and Alerts. To specify multiple domains, separate each domain with a comma, with no space in between. To allow all domains, leave the field empty. This setting doesn’t affect existing subscriptions.")
  :visibility :public
  :export?    true
  :feature    :email-allow-list
  ;; this is a comma-separated string but we're not using `:csv` because it gets serialized to an array which makes it
  ;; inconvenient to use on the frontend.
  :type       :string
  :audit      :getter)

(defn- allowed-domains-set
  "Parse [[subscription-allowed-domains]] into a set. `nil` if the Setting is not set or empty."
  []
  (some-> (subscription-allowed-domains)
          (str/split  #",")
          set
          not-empty))

(defn validate-email-domains
  "Check that `email-addresses` associated with a [[metabase.models.pulse-channel]] are allowed based on the value of
  the [[subscription-allowed-domains]] Setting, if set. This function no-ops if `subscription-allowed-domains` is
  unset or if we do not have a premium token with the `:email-allow-list` feature.

  This function is called by [[metabase.models.pulse-channel/validate-email-domains]] when Pulses are created and
  updated."
  [email-addresses]
  (when (premium-features/enable-email-allow-list?)
    (when-let [allowed-domains (allowed-domains-set)]
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
