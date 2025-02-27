(ns metabase.search.init
  "This is loaded for side effects on system launch."
  (:require
   [metabase.search.models]
   [metabase.search.task.search-index]))
