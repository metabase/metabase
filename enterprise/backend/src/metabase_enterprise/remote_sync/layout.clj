(ns metabase-enterprise.remote-sync.layout
  "Where remote sync writes each item in the repository: the layout, which maps an item to its path, and the storage
  context every remote-sync caller computes paths in."
  (:require
   [metabase-enterprise.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(def layout
  "The layout remote sync writes: a function of a storage context and an extracted entity that returns the entity's
  resolved path (see [[serialization/storage-context]])."
  serialization/default-layout)

(defn storage-context
  "A fresh storage context whose paths come from [[layout]]."
  []
  (serialization/storage-context layout))
