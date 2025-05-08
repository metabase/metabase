(ns metabase.testing-api.core
  (:require
   [metabase.testing-api.settings]
   [potemkin :as p]))

(comment metabase.testing-api.settings/keep-me)

(p/import-vars
 [metabase.testing-api.settings
  enable-testing-routes?])
