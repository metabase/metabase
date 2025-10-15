(ns metabase-enterprise.documents.api.webhook
  (:require
   [metabase-enterprise.documents.api.document :as document.api]
   [metabase-enterprise.documents.prose-mirror :as prose-mirror]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- connect-event [payload]
  ;; nothing to do here, FE is initializing the user context on its own
  )

(defn- load-event [user-id {id :documentName}]
  ;; Return the ydoc and the extracted version
  (let [id (parse-long id)]
    (request/with-current-user user-id
      (let [document (t2/select-one :model/Document id)]
        (api/check-403 (mi/can-write? document))
        {:document {:default (:document document)}
         :ydoc    (:ydoc document)}))))

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

(def ^:private yuck-regex #"metabase\.SESSION=([^ ;]*)")

(api.macros/defendpoint :post "/webhook"
  [_
   _
   {:keys [event _context payload]}]
  (let [cookies-str (get-in payload [:requestHeaders :cookie])
        session-key (second (re-find yuck-regex cookies-str))
        user-id     (:metabase-user-id (metabase.server.middleware.session/current-user-info-for-session session-key nil))]

    ;; #p [event payload _context]

    (case event
      "connect"    (connect-event payload)
      "load"       (load-event user-id payload)
      "change"     (change-event user-id payload)
      "disconnect" (disconnect-event payload)

      (log/warn "Unexpected event" {:event event :payload payload}))))

(api.macros/defendpoint :post "/copy-cards"
  [_ _ {document-id :document_id document :document}]
  (let [collection-id (t2/select-one-fn :collection_id :model/Document :id (parse-long document-id))]
    (->> (document.api/clone-cards-in-document!
          {:id document-id
           :collection_id collection-id
           :document document
           :content_type prose-mirror/prose-mirror-content-type})
         (document.api/update-cards-in-ast
          {:document document
           :content_type prose-mirror/prose-mirror-content-type}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (api.macros/ns-handler *ns*))
