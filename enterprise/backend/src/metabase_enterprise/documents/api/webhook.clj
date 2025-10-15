(ns metabase-enterprise.documents.api.webhook
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- connect-event [payload]
  ;; nothing to do here, FE is initializing the user context on its own
  )

(defn- load-event [{id :documentName}]
  ;; Return the ydoc and the extracted version
  (let [id (parse-long id)]
    (t2/select-one [:model/Document :document :ydoc] id)))

(defn- change-event [user-id {id :documentName, :keys [ydoc document]}]
  ;; work whether we have the new transformer to pass through the base64 ydoc too, or not
  (let [id (parse-long id)]
    (t2/update! :model/Document id {:document document
                                    :ydoc     ydoc})
    (events/publish-event! :event/document-update
                           {:object  (t2/select-one :model/Document id)
                            :user-id user-id})))

(defn- disconnect-event [payload]
  ;; nothing to do here
  )

(api.macros/defendpoint :post "/webhook"
  [_
   _
   {{user-id :user_id} :context :keys [event payload]}]
  #p event
  (case event
    "connect"    (connect-event payload)
    "load"       (load-event payload)
    "change"     (change-event user-id payload)
    "disconnect" (disconnect-event payload)

    (log/warn "Unexpected event" {:event event :payload payload})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns*))
