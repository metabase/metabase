(ns metabase.search.init
  "This is loaded for side effects on system launch."
  (:require
   [metabase.search.models]
   [metabase.search.settings]
   [metabase.search.task.search-index]))
