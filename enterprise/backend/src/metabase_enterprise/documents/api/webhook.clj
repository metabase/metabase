(ns metabase-enterprise.documents.api.webhook
  (:require
   [metabase.api.macros :as api.macros]))

(defn- connect-event [payload]
  ;; nothing to do here, FE is initializing the user context on its own
  )

(defn- create-event [payload]
  ;; for now we let the FE initialize the document with a manual save
  )

(defn- change-event [user-id {id :documentName, :keys [document]}]

  )

(defn- disconnect-event [payload]
  ;; nothing to do here
  )

(api.macros/defendpoint :post "/webhook"
  [_
   _
   {{user-id :user_id} :context :keys [event payload]}]
  #p user_id
  (case event
    "connect" (connect-event payload)
    "create" (create-event payload)
    "change" (change-event user-id payload)
    "disconnect" (disconnect-event payload)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns*))
