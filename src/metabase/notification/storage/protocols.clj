(ns metabase.notification.storage.protocols)

(defprotocol NotificationStorage
  "Protocol for storing and retrieving notification payload data"
  (store! [this data]
    "Store the data and return a reference that can be used to retrieve it later")
  (retrieve [this]
    "Retrieve the data")
  (cleanup! [this]
    "Clean up any resources"))
