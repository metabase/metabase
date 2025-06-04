(ns metabase.classloader.init
  (:require
   [metabase.classloader.impl :as classloader]))

;;; make sure the current thread is using the Metabase classloader.
(classloader/the-classloader)
