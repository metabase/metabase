(ns metabase.models.init
  "Loaded for side effects on system launch."
  (:require
   ;; we at least need to load this because it has the code for dynamic model resolution.
   [metabase.models.resolution]))
