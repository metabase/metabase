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
  "Resolve the document under the given user and compute read/write perms.
   Returns `{:doc ... :read? bool :write? bool}` or `nil` if the document
   does not exist. The `t2/select-one` runs inside `with-current-user` so
   any model `:after-select` hooks that consult `api/*current-user-id*` see
   the correct user."
  [user-id entity-id]
  (request.session/with-current-user user-id
    (when-let [doc (t2/select-one :model/Document :entity_id entity-id)]
      {:doc    doc
       :read?  (mi/can-read?  doc)
       :write? (mi/can-write? doc)})))

(defn create-authz-extension
  "Build a yhocuspocus `Extension` that enforces per-document read/write
   permissions on connect. Rejects (throws) when the document is unknown,
   when the connection's context lacks a `userId`, or when the user has no
   read access; marks the connection read-only when the user has read but
   not write.

   Synchronous throws are turned into failed futures by yhocuspocus's
   `runHooks`, so no manual wrapping is needed here."
  ^Extension []
  ;; `proxy` doesn't dispatch to interface default methods, so we'd have to
  ;; implement every hook (onConnect, onDestroy, onChange, …). `reify` does
  ;; inherit default methods on Clojure 1.10+, so we implement only the two
  ;; hooks we care about and let the rest pass through as no-ops.
  (reify Extension
    ;; Return-type hint required: the onAuthenticate method can finish via
    ;; throw (cond branches that reject) or via `CompletableFuture/completedFuture`.
    ;; Clojure can't infer a common return type without the explicit hint —
    ;; compile fails with "had: java.lang.Object" otherwise.
    (^CompletableFuture onAuthenticate [_ ^OnAuthenticatePayload payload]
      (let [ctx      (.getContext payload)
            doc-name (.getDocumentName payload)
            user-id  (.get ctx "userId")]
        (when (nil? user-id)
          (throw (ex-info "collab: unauthenticated connection (no userId in context)"
                          {:doc-name doc-name})))
        (let [{:keys [entity-id]} (collab.persistence/parse-doc-name doc-name)
              authz               (authorize user-id entity-id)]
          (cond
            (nil? authz)
            (do (log/debugf "collab: document not found: %s" doc-name)
                (throw (ex-info "document not found" {:doc-name doc-name})))

            (not (:read? authz))
            (do (log/warnf "collab: reject — user %s lacks read perms on %s" user-id doc-name)
                (throw (ex-info "forbidden" {:user-id user-id :doc-name doc-name})))

            (not (:write? authz))
            (do (log/debugf "collab: read-only — user %s on %s" user-id doc-name)
                (.setReadOnly payload true))

            :else nil))
        (CompletableFuture/completedFuture nil)))))
