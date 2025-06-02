(ns metabase.classloader.core
  (:refer-clojure :exclude [require])
  (:require
   [metabase.classloader.impl]
   [potemkin :as p]))

(comment metabase.classloader.impl/keep-me)

(p/import-vars
 [metabase.classloader.impl
  add-url-to-classpath!
  require
  shared-context-classloader
  the-classloader])
