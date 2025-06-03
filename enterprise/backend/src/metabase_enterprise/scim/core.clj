(ns metabase-enterprise.scim.core
  (:require
   [metabase-enterprise.scim.settings]
   [potemkin :as p]))

(comment metabase-enterprise.scim.settings/keep-me)

(p/import-vars
 [metabase-enterprise.scim.settings
  scim-base-url
  scim-enabled])
