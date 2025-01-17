(ns metabase.sync.api
  "REST API routes related to sync."
  (:require
   [metabase.sync.api.notify]
   [potemkin.namespaces]))

;; this actually does have a docstring but Kondo doesn't understand [[potemkin.namespaces/import-def]] 100% I guess.
#_{:clj-kondo/ignore [:missing-docstring]}
(potemkin.namespaces/import-def
 metabase.sync.api.notify/routes
 notify-routes)
