(ns metabase.data-apps.settings
  "Settings for data-app sync. The repository itself is the one connected via the
   remote-sync feature; data apps materialize as part of its import pipeline, so
   the only state kept here is the most recent data-app sync error (for surfacing
   in the admin UI)."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting data-app-repo-sync-error
  (deferred-tru "Internal: error message from the most recent failed data-app sync (e.g. an invalid data_app.yml), or blank when the last sync succeeded.")
  :type       :string
  :visibility :admin
  :encryption :no
  :export?    false
  :audit      :never)
