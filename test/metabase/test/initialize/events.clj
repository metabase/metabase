(ns metabase.test.initialize.events
  (:require [metabase.events :as events]))

(defn init!
  "Initialize async event handlers."
  []
  (events/initialize-events!))
