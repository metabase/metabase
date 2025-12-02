(ns metabase.search.init
  "This is loaded for side effects on system launch."
  (:require
   [metabase.search.appdb.core]
   [metabase.search.in-place.legacy]
   [metabase.search.models]
   [metabase.search.semantic.core]
   [metabase.search.settings]
   [metabase.search.task.search-index]))
