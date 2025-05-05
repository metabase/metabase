(ns metabase-enterprise.advanced-config.models.notification
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting subscription-allowed-domains
  (deferred-tru
   (str "Allowed email address domain(s) for new Dashboard Subscriptions and Alerts."
        "To specify multiple domains, separate each domain with a comma, with no space in between."
        "To allow all domains, leave the field empty. This setting doesn’t affect existing subscriptions."))
  :encryption :no
  :visibility :settings-manager
  :export?    true
  :feature    :email-allow-list
  ;; this is a comma-separated string but we're not using `:csv` because it gets serialized to an array which makes it
  ;; inconvenient to use on the frontend.
  :type       :string
  :setter     (fn [new-value]
                (when (not-empty new-value)
                  (when-let [domains (str/split new-value #",")]
                    (assert (every? u/domain? domains) (format  "Each domain must be a valid email domain. %s" domains))))
                (setting/set-value-of-type! :string :subscription-allowed-domains new-value))
  :audit      :getter)

(defn- allowed-domains-set
  "Parse [[subscription-allowed-domains]] into a set. `nil` if the Setting is not set or empty."
  []
  (some-> (subscription-allowed-domains)
          (str/split  #",")
          set
          not-empty))

(defenterprise validate-email-domains!
  "Check that whether `email-addresses` are allowed based on the value of the [[subscription-allowed-domains]] Setting, if set.
  This function no-ops if `subscription-allowed-domains` is unset or if we do not have a premium token with the `:email-allow-list` feature."
  :feature :email-allow-list
  [email-addresses]
  (when-let [allowed-domains (allowed-domains-set)]
    (let [disallowed-emails (->> email-addresses
                                 (remove #(->> % u/email->domain  allowed-domains))
                                 seq)]
      (when (seq disallowed-emails)
        (throw (ex-info
                (tru "The following email addresses are not allowed: {0}"
                     (str/join ", " disallowed-emails))
                {:status-code 403}))))))
