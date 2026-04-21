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
   (str "Kill-switch: when true, no database sync (metadata, analyze, or field-values) will run on this "
        "instance, regardless of how it was triggered (scheduled, event-driven, manual, or "
        "config-file-initiated). Non-sync scheduled jobs (pulses, persist-refresh, search indexing, etc.) "
        "are unaffected. Intended for file-driven instances where metadata is loaded from disk. Set via "
        "the `settings:` block of config.yml or the MB_DISABLE_SYNC env var."))
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :audit      :getter
  :encryption :no)
