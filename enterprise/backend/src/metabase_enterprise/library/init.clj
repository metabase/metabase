(ns metabase-enterprise.library.init
  (:require
   [metabase-enterprise.library.hooks]
   [metabase.library.hooks :as library.hooks]
   [metabase.startup.core :as startup]))

(defmethod startup/def-startup-logic! ::EnsureLibrary [_]
  (library.hooks/after-startup))
