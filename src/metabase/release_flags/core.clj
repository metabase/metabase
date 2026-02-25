(ns metabase.release-flags.core
  (:require
   [metabase.release-flags.guard]
   [metabase.release-flags.models]
   [potemkin :as p]))

(p/import-vars
 [metabase.release-flags.guard
  guard-namespace!]
 [metabase.release-flags.models
  all-flags
  has-release-flag?])
