(ns metabase-enterprise.audit-app.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting analytics-dev-mode
  "Enable analytics development mode. When true, disables analytics database installation and makes analytics content editable."
  :type       :boolean
  :default    false
  :visibility :internal
  :setter     :none
  :audit      :never
  :export?    false
  :doc        (str "Setting this environment variable to true will prevent installing the analytics database and content, "
                   "and make the Usage analytics collection editable for local development."))

(defsetting install-analytics-database
  "Whether or not we should install the Metabase analytics database on startup. Defaults to true, but can be disabled
  via environmment variable."
  :type       :boolean
  :default    (not (analytics-dev-mode))
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
