(ns metabase.documents.collab.authz
  "Per-document authorization for the embedded YHocuspocus server. Registered
   as an `Extension` whose `onAuthenticate` hook looks up the requested
   document by entity-id, rebinds the current user from the context HashMap
   populated by the Ring handler, and either accepts, marks read-only, or
   throws to reject the connection."
  (:require
   [metabase.documents.collab.persistence :as collab.persistence]
   [metabase.models.interface :as mi]
   [metabase.request.session :as request.session]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CompletableFuture)
   (net.carcdr.yhocuspocus.extension Extension OnAuthenticatePayload)))

(set! *warn-on-reflection* true)

(defn- authorize
  "Look up the document and check the current user's perms. Returns
   `{:doc ... :read? bool :write? bool}` or `nil` if the document does not
   exist."
  [user-id entity-id]
  (when-let [doc (t2/select-one :model/Document :entity_id entity-id)]
    (request.session/with-current-user user-id
      {:doc    doc
       :read?  (mi/can-read?  doc)
       :write? (mi/can-write? doc)})))

(defn create-authz-extension
  "Build a yhocuspocus `Extension` that enforces per-document read/write
   permissions on connect. Rejects (throws) when the document is unknown or
   the user has no read access; marks the connection read-only when the user
   has read but not write."
  ^Extension []
  (proxy [Extension] []
    (getName [] "metabase.documents.collab.authz")
    (onAuthenticate [^OnAuthenticatePayload payload]
      (try
        (let [ctx      (.getContext payload)
              doc-name (.getDocumentName payload)
              user-id  (.get ctx "userId")
              {:keys [entity-id]} (collab.persistence/parse-doc-name doc-name)
              authz    (authorize user-id entity-id)]
          (cond
            (nil? authz)
            (do (log/warnf "collab: reject — document not found: %s" doc-name)
                (throw (ex-info "document not found" {:doc-name doc-name})))

            (not (:read? authz))
            (do (log/warnf "collab: reject — user %s lacks read perms on %s" user-id doc-name)
                (throw (ex-info "forbidden" {:user-id user-id :doc-name doc-name})))

            (not (:write? authz))
            (do (log/debugf "collab: read-only — user %s on %s" user-id doc-name)
                (.setReadOnly payload true))

            :else nil)
          (CompletableFuture/completedFuture nil))
        (catch Throwable t
          ;; Wrap synchronous throws into a failed future; yhocuspocus
          ;; treats either as a reject.
          (CompletableFuture/failedFuture t))))))
