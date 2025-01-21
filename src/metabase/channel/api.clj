(ns metabase.channel.api
  (:require
   [metabase.channel.api.channel]
   [metabase.channel.api.email]
   [potemkin.namespaces]))

;; these do actually have docstrings but I don't think Kondo handles [[potemkin.namespaces/import-def]] 100% correctly.

#_{:clj-kondo/ignore [:missing-docstring]}
(potemkin.namespaces/import-def
 metabase.channel.api.channel/routes
 channel-routes)

#_{:clj-kondo/ignore [:missing-docstring]}
(potemkin.namespaces/import-def
 metabase.channel.api.email/routes
 email-routes)
