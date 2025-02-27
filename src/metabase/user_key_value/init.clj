(ns metabase.user-key-value.init
  (:require
   [metabase.user-key-value.models.user-key-value.types]))

(metabase.user-key-value.models.user-key-value.types/load-and-watch-schemas!)
