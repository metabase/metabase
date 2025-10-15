(ns metabase-enterprise.documents.api.webhook
  (:require
   [metabase.api.macros :as api.macros]))

(defn connect-event [payload]
  {:user {:id 1 :name "Rasta Toucan"}})

(defn create-event [payload])
(defn change-event [payload])
(defn disconnect-event [payload])

(api.macros/defendpoint :post "/webhook"
  [_
   _
   {:keys [event payload]}]
  #p p
  (case event
    "connect" (connect-event payload)
    "create" (create-event payload)
    "change" (change-event payload)
    "disconnect" (disconnect-event payload)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns*))
