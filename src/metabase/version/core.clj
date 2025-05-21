(ns metabase.version.core
  (:require
   [metabase.version.settings]
   [potemkin :as p]))

(comment metabase.version.settings/keep-me)

(p/import-vars
 [metabase.version.settings
  check-for-updates
  version])
