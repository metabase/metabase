(ns metabase.plugins.core
  (:require
   [metabase.plugins.impl]
   [potemkin :as p]))

(comment metabase.plugins.core/keep-me)

(p/import-vars
 [metabase.plugins.impl
  load-plugins!
  plugins-dir
  plugins-dir-info])
