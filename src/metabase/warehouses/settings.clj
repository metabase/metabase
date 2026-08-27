(ns metabase.warehouses.settings
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting disable-auto-sync
  (deferred-tru
   (str "When true, suppresses automatically-triggered syncs: the scheduled sync-and-analyze and "
        "update-field-values jobs do not run (and new triggers are not registered), and adding a "
        "new database does not kick off an initial sync. "
        "Syncs originating from an explicit request — the Sync-now REST endpoints, or a transform "
        "finalizing its output table — are unaffected. "
        "For deployments that load database metadata from disk at startup and should not have "
        "Metabase re-discover it."))
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false)

(defsetting cloud-gateway-ips
  (deferred-tru "Metabase Cloud gateway IP addresses, to configure connections to DBs behind firewalls")
  :visibility :public
  :type       :string
  :setter     :none
  :getter (fn []
            (when (premium-features/is-hosted?)
              (some-> (setting/get-value-of-type :string :cloud-gateway-ips)
                      (str/split #",")))))
