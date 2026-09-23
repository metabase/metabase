(ns metabase.jekyll-mode.core
  (:require
   [metabase.jekyll-mode.file-watcher]
   [metabase.util.namespaces :as util.ns]))

(util.ns/import-fns
 [metabase.jekyll-mode.file-watcher
  start!
  stop!])
