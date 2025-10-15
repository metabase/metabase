(ns metabase-enterprise.documents.api.webhook
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [toucan2.core :as t2]))

(defn- connect-event [payload]
  ;; nothing to do here, FE is initializing the user context on its own
  )

(defn- create-event [payload]
  ;; for now, we let the FE initialize the document with a manual save
  )

(defn- change-event [user-id {id :documentName, :keys [ydoc document]}]
  ;; work whether we have the new transformer to pass through the base64 ydoc too, or not
  (let [id (parse-long id)]
    (t2/update! :model/Document id {:document document
                                    :ydoc     ydoc})
    ;; not needed for demo
    #_(events/publish-event! :event/document-update
                             {:object  (t2/select :model/Document id)
                              :user-id user-id})))

(defn- disconnect-event [payload]
  ;; nothing to do here
  )

(api.macros/defendpoint :post "/webhook"
  [_
   _
   {{user-id :user_id} :context :keys [event payload]}]
  (case event
    "connect" (connect-event payload)
    "create" (create-event payload)
    "change" (change-event user-id payload)
    "disconnect" (disconnect-event payload)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns*))
