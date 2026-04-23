(ns metabase.warehouses.settings
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting cloud-gateway-ips
  (deferred-tru "Metabase Cloud gateway IP addresses, to configure connections to DBs behind firewalls")
  :visibility :public
  :type       :string
  :setter     :none
  :getter (fn []
            (when (premium-features/is-hosted?)
              (some-> (setting/get-value-of-type :string :cloud-gateway-ips)
                      (str/split #",")))))

(defsetting disable-sync
  (deferred-tru
   (str "Kill-switch for the automatic (scheduled) database-sync task. When true, the Quartz "
        "sync-and-analyze and update-field-values jobs do not run on their schedule, and new "
        "Quartz triggers aren't registered (see `should-sync?` in metabase.warehouses.models.database). "
        "Programmatic, event-driven, and user-triggered syncs (transforms finalizing their output, "
        "manual 'Sync now' REST calls, etc.) continue to work. Intended for file-driven instances "
        "where metadata is primarily loaded from disk at startup. Set via the `settings:` block of "
        "config.yml or the MB_DISABLE_SYNC env var."))
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :audit      :getter
  :encryption :no)
