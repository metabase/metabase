(ns metabase-enterprise.audit-app.settings
  (:require
   [metabase.audit-app.core :as audit]
   [metabase.settings.core :refer [defsetting]]))

(defsetting install-analytics-database
  "Whether or not we should install the Metabase analytics database on startup. Defaults to true, but can be disabled
  via environmment variable."
  :type       :boolean
  :default    (not (audit/analytics-dev-mode))
  :visibility :internal
  :setter     :none
  :audit      :never
  :export?    false
  :doc        (str "Setting this environment variable to false will prevent installing the analytics database, which is"
                   " handy in a migration use-case where it conflicts with the incoming database."))

(defsetting load-analytics-content
  "Whether or not we should load Metabase analytics content on startup. Defaults to match `install-analytics-database`,
  which defaults to true, but can be disabled via environment variable."
  :type       :boolean
  :default    (install-analytics-database)
  :visibility :internal
  :setter     :none
  :audit      :never
  :doc        (str "Setting this environment variable to false can also come in handy when migrating environments, as"
                   " it can simplify the migration process."))

(defsetting last-analytics-views-checksum
  "Checksum of the instance_analytics_views SQL files. When this changes, the audit DB schema
  is re-synced to pick up new or modified views from migrations."
  :type       :integer
  :visibility :internal
  :audit      :never
  :doc        false
  :export?    false)

(defsetting audit-db-dialect-sync-pending
  "Whether the audit DB still owes a schema sync for the host dialect. Set (durably) before an
  engine-changed sync is attempted and cleared only when one succeeds, so a sync that fails or is
  interrupted after the analytics content checksum has already advanced is retried on the next boot
  instead of waiting for the next release to change the checksum."
  :type       :boolean
  :default    false
  :visibility :internal
  :audit      :never
  :doc        false
  :export?    false)
