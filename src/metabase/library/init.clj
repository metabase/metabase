(ns metabase.library.init
  (:require
   [metabase.library.hooks :as library.hooks]
   [metabase.startup.core :as startup]))

(defmethod startup/def-startup-logic! ::library-startup
  [_]
  (library.hooks/after-startup))
