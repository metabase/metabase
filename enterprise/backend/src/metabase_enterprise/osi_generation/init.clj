(ns metabase-enterprise.osi-generation.init
  "Loads OSI generation settings and the weekly task at system startup."
  (:require
   [metabase-enterprise.osi-generation.settings]
   [metabase-enterprise.osi-generation.task.generate]))

(set! *warn-on-reflection* true)
