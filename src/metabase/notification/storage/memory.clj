(ns metabase.notification.storage.memory
  (:require
   [metabase.notification.storage.interface :as storage]))

(deftype MemoryStorage [state]
  storage/NotificationStorage
  (store! [_ data]
    (let [id (str (random-uuid))]
      (swap! state assoc id data)
      (storage/->StorageRef (type _) id)))

  (retrieve [_ id]
    (get @state id))

  (cleanup! [_ id]
    (swap! state dissoc id)))

(def instance (->MemoryStorage (atom {})))
