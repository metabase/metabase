(ns metabase.notification.storage.core
  (:require
   [clojure.walk :as walk]
   [metabase.notification.storage.disk :as storage.disk]
   [metabase.notification.storage.protocols :as storage.protocols]
   [potemkin :as p]))

(p/import-vars
 [storage.disk
  to-disk-storage!]
 [storage.protocols
  NotificationStorage])

(defn retrieve
  [this]
  (storage.protocols/retrieve this))

(defn store!
  [this data]
  (storage.protocols/store! this data))

(defn cleanup!
  [this]
  (storage.protocols/cleanup! this))

(defn cleanup-all!
  [this]
  (walk/postwalk
   (fn [x]
     (when (satisfies? storage.protocols/NotificationStorage x)
       (cleanup! x)))
   this))
