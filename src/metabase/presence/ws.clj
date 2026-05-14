(ns metabase.presence.ws
  "POC WebSocket transport for the 'currently viewing' presence indicator.

  Replaces the short-polling HTTP loop on `/api/presence/ping` with a
  long-lived bi-directional channel. Each WS connection represents one user
  on one entity. On open and on every text message (a heartbeat from the
  client) the server upserts the viewer's `user_presence` row, then
  broadcasts an updated viewer list to *every* connection subscribed to the
  same `(model, model_id)`. On close (browser tab closed, navigation,
  refresh) the row is deleted and a final broadcast goes out, so other
  viewers see the avatar disappear in milliseconds rather than waiting out
  the TTL."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.presence.models.user-presence]
   [metabase.presence.settings :as presence.settings]
   [metabase.request.session :as request.session]
   [metabase.session.models.session :as session]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.net HttpCookie)
   (java.time OffsetDateTime)
   (java.time.temporal ChronoUnit)
   (org.eclipse.jetty.ee9.servlet ServletContextHandler)
   (org.eclipse.jetty.ee9.websocket.api Session WebSocketAdapter)
   (org.eclipse.jetty.ee9.websocket.server JettyServerUpgradeRequest
                                           JettyServerUpgradeResponse
                                           JettyWebSocketCreator
                                           JettyWebSocketServerContainer)
   (org.eclipse.jetty.ee9.websocket.server.config JettyWebSocketServletContainerInitializer
                                                  JettyWebSocketServletContainerInitializer$Configurator)))

(set! *warn-on-reflection* true)

(comment metabase.presence.models.user-presence/keep-me)

(defrecord PresenceConn [^Session session user-id model model-id])

(defonce ^:private subscribers
  ;; map of [model model-id] -> #{PresenceConn ...}
  (atom {}))

(defn- now ^OffsetDateTime [] (OffsetDateTime/now))

(defn- ttl-from-now ^OffsetDateTime []
  (.plus (now)
         (long (presence.settings/presence-ttl-seconds))
         ChronoUnit/SECONDS))

;; ─────────────────────────────────────────────────────────── persistence ──

(defn- upsert! [user-id model model-id parameters]
  (app-db/update-or-insert! :model/UserPresence
                            {:user_id  user-id
                             :model    model
                             :model_id model-id}
                            (fn [_existing]
                              {:last_seen_at (now)
                               :expires_at   (ttl-from-now)
                               :parameters   (or parameters {})})))

(defn- delete! [user-id model model-id]
  (t2/delete! :model/UserPresence
              :user_id  user-id
              :model    model
              :model_id model-id))

(defn- live-viewers
  "Return the *other* viewers (excluding `caller-id`) for an entity, hydrated
  with user info + the parameters they last reported."
  [caller-id model model-id]
  (let [rows     (t2/select [:model/UserPresence :user_id :parameters]
                            {:select [:user_id :parameters]
                             :from   [:user_presence]
                             :where  [:and
                                      [:= :model model]
                                      [:= :model_id model-id]
                                      [:> :expires_at (now)]
                                      [:not= :user_id caller-id]]})
        user-ids (into #{} (map :user_id) rows)
        users    (when (seq user-ids)
                   (t2/select-pk->fn identity
                                     [:model/User :id :first_name :last_name :email]
                                     :id        [:in user-ids]
                                     :is_active true))]
    (vec (keep (fn [{:keys [user_id parameters]}]
                 (when-let [u (get users user_id)]
                   (assoc u :parameters (or parameters {}))))
               rows))))

;; ──────────────────────────────────────────────────────── auth + permissions ──

(def ^:private SESSION-COOKIE-NAME "metabase.SESSION")

(defn- cookie-value [^JettyServerUpgradeRequest req cookie-name]
  (some->> (.getCookies req)
           (some (fn [^HttpCookie c]
                   (when (= cookie-name (.getName c)) (.getValue c))))))

(defn- session-key->user-id
  "Look up a session by the plaintext cookie value and return the owning
  user id (or nil if no live session matches)."
  [session-key]
  (when (and session-key (not (str/blank? session-key)))
    (let [hashed (try (session/hash-session-key session-key) (catch Throwable _ nil))]
      (when hashed
        (:user_id (t2/select-one [:model/Session :user_id]
                                 :key_hashed hashed))))))

(defn- can-read?
  "Permission-check the target entity against the *user*. Uses Metabase's
  per-user permission binding so sandboxed/permission scenarios resolve
  the same way they do over HTTP."
  [user-id model model-id]
  (let [entity-key (case model
                     "card"      :model/Card
                     "dashboard" :model/Dashboard)
        row        (t2/select-one entity-key :id model-id)]
    (boolean
     (and row
          (request.session/with-current-user user-id
            (mi/can-read? row))))))

;; ────────────────────────────────────────────────────────────── broadcast ──

(defn- send-viewers! [^PresenceConn conn viewers]
  (try
    (.sendString (.getRemote ^Session (.session conn))
                 (json/generate-string {:viewers viewers}))
    (catch Throwable e
      (log/debug e "Failed to send WS viewer list"))))

(defn- broadcast-to-entity!
  "Compute and push the (personalized) viewer list to every connection
  currently subscribed to `(model, model-id)`. Each connection gets a list
  filtered against *its* user-id."
  [model model-id]
  (doseq [^PresenceConn conn (get @subscribers [model model-id])]
    (send-viewers! conn (live-viewers (.user-id conn) model model-id))))

(defn broadcast!
  "Public entry point: trigger a viewer-list re-broadcast for `(model,
  model-id)`. Called by [[metabase.presence.api]] after the HTTP `/ping`
  endpoint mutates a presence row, so users on the WS channel see HTTP
  changes without waiting for their next message."
  [model model-id]
  (broadcast-to-entity! model model-id))

;; ────────────────────────────────────────────────────────── registration ──

(defn- register! [^PresenceConn conn]
  (swap! subscribers update [(.model conn) (.model-id conn)] (fnil conj #{}) conn))

(defn- unregister! [^PresenceConn conn]
  (swap! subscribers
         (fn [m]
           (let [k    [(.model conn) (.model-id conn)]
                 conns (disj (get m k #{}) conn)]
             (if (empty? conns)
               (dissoc m k)
               (assoc m k conns))))))

;; ───────────────────────────────────────────────────────────── adapter ──

(defn- handle-text! [^PresenceConn conn ^String payload]
  ;; expected shape: {"type":"heartbeat", "parameters":{...}}
  (try
    (let [msg    (json/parse-string payload keyword)
          params (:parameters msg)]
      (upsert! (.user-id conn) (.model conn) (.model-id conn) params)
      (broadcast-to-entity! (.model conn) (.model-id conn)))
    (catch Throwable e
      (log/debug e "Bad WS payload, ignoring"))))

(defn- make-adapter [user-id model model-id]
  (let [conn-ref (atom nil)]
    (proxy [WebSocketAdapter] []
      (onWebSocketConnect [^Session sess]
        (let [^WebSocketAdapter this this]
          (proxy-super onWebSocketConnect sess))
        (let [c (->PresenceConn sess user-id model model-id)]
          (reset! conn-ref c)
          (register! c)
          ;; Treat the open as the first heartbeat: insert/update the row,
          ;; then broadcast so every subscriber (including us) gets a fresh
          ;; viewer list right away.
          (upsert! user-id model model-id {})
          (broadcast-to-entity! model model-id)))
      (onWebSocketText [^String text]
        (when-let [c @conn-ref]
          (handle-text! c text)))
      (onWebSocketClose [code reason]
        (when-let [c @conn-ref]
          (unregister! c)
          (delete! user-id model model-id)
          (broadcast-to-entity! model model-id)
          (reset! conn-ref nil))
        (let [^WebSocketAdapter this this]
          (proxy-super onWebSocketClose code reason)))
      (onWebSocketError [^Throwable err]
        (log/debug err "Presence WS error")))))

;; ────────────────────────────────────────────────────────────── creator ──

(defn- first-param [^JettyServerUpgradeRequest req k]
  (some-> (.getParameterMap req) (.get k) first))

(defn- ^JettyWebSocketCreator make-creator []
  (reify JettyWebSocketCreator
    (createWebSocket [_ req _resp]
      (try
        (let [session-key (cookie-value req SESSION-COOKIE-NAME)
              user-id     (session-key->user-id session-key)
              model       (first-param req "model")
              model-id    (some-> (first-param req "id") Long/parseLong)]
          (cond
            (not (presence.settings/presence-enabled))
            (do (log/debug "Presence WS upgrade rejected: presence-enabled is false") nil)

            (nil? user-id)
            (do (log/debug "Presence WS upgrade rejected: no session") nil)

            (or (nil? model) (not (#{"card" "dashboard"} model)) (nil? model-id))
            (do (log/debug "Presence WS upgrade rejected: bad model/id") nil)

            (not (can-read? user-id model model-id))
            (do (log/debug "Presence WS upgrade rejected: read-check failed") nil)

            :else
            (make-adapter user-id model model-id)))
        (catch Throwable e
          (log/warn e "Presence WS creator threw, refusing upgrade")
          nil)))))

;; ──────────────────────────────────────────────────────────── ring entry ──

(def ^{:arglists '([request respond raise])} handler
  "Async Ring handler bound to `/api/presence-ws`. Returns a Metabase-shaped
  WebSocket response map; the server's async-proxy-handler detects this
  shape and upgrades the connection. Authentication, parameter parsing,
  and permission checks happen inside the creator (see [[make-creator]]).

  If the upgrade machinery can't run the creator (e.g. a normal browser
  request hit this URL without WebSocket headers), the 426 status + body
  is sent back as a regular HTTP response."
  (fn [_request respond _raise]
    (respond
     {:status                      426
      :headers                     {"Content-Type" "text/plain"}
      :body                        "Upgrade Required\n"
      :metabase/websocket-listener (make-creator)})))
