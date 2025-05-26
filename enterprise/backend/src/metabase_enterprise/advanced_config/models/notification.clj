(ns metabase-enterprise.advanced-config.models.notification
  (:require
   [clojure.string :as str]
   [metabase-enterprise.advanced-config.settings :as advanced-config.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defn- allowed-domains-set
  "Parse [[subscription-allowed-domains]] into a set. `nil` if the Setting is not set or empty."
  []
  (some-> (advanced-config.settings/subscription-allowed-domains)
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
