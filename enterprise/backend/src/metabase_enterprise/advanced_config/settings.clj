(ns metabase-enterprise.advanced-config.settings
  (:require
   [clojure.string :as str]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting config-from-file-sync-databases
  "Whether to (asynchronously) sync newly created Databases during config-from-file initialization. By default, true,
  but you can disable this behavior if you want to sync it manually or use SerDes to populate its data model."
  :visibility :internal
  :type       :boolean
  :default    true
  :audit      :getter)

(defsetting subscription-allowed-domains
  (deferred-tru
   (str "Allowed email address domain(s) for new Dashboard Subscriptions and Alerts. "
        "To specify multiple domains, separate each domain with a comma, with no space in between. "
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
