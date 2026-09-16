(ns metabase.mcp-client.tools
  "The external MCP tools a user can call: those of every enabled server the user is connected to.

  Clients and tool listings are cached per (server, user) so a chat turn does not renegotiate the protocol and
  relist tools on every call. An entry is dropped when it ages out or when the server or connection row changes,
  which is how a disconnect, re-authorization, or admin edit on any node takes effect without explicit eviction."
  (:require
   [metabase.mcp-client.client :as client]
   [metabase.mcp-client.connections :as connections]
   [metabase.mcp-client.db :as mcp-client.db]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private cache-ttl-ms (* 5 60 1000))

(defonce ^:private cache
  (atom {}))

(defn- usable?
  "Whether `connection` lets its user call `server`. Every strategy, including shared-credential ones, needs an
  explicit connection so that a user only ever sees the servers they chose to use."
  [server connection]
  (boolean
   (and (:enabled server)
        (= :connected (:status connection)))))

(defn- row-version
  [row]
  [(:id row) (:updated_at row)])

(defn- fresh?
  [entry server connection now]
  (and entry
       (< now (:expires-at entry))
       (= (:server-version entry) (row-version server))
       (= (:connection-version entry) (row-version connection))))

(defn- entry!
  "The cached client and tool listing for `user-id` on `server`, rebuilt when missing, expired, or stale."
  [server connection user-id]
  (let [k   [(:id server) user-id]
        now (System/currentTimeMillis)]
    (or (let [entry (get @cache k)]
          (when (fresh? entry server connection now)
            entry))
        (let [c     (connections/connection-client server connection)
              entry {:client             c
                     :tools              (client/all-tools c)
                     :server-version     (row-version server)
                     :connection-version (row-version connection)
                     :expires-at         (+ now cache-ttl-ms)}]
          (swap! cache (fn [m]
                         (-> (into {} (remove (fn [[_ e]] (<= (:expires-at e) now))) m)
                             (assoc k entry))))
          entry))))

(defn- public-server
  [server]
  (dissoc server :credentials :oauth_client))

(defn user-tools
  "The tools of every enabled server `user-id` can use, as `{:server ... :tools [...]}` maps ordered like the admin
  list. `:server` carries no credentials. A server that cannot be reached is logged and left out so that one
  broken server never hides the others."
  [user-id]
  (let [servers     (filter :enabled (mcp-client.db/servers))
        connections (mcp-client.db/connections-by-server-id user-id (map :id servers))]
    (into []
          (keep (fn [server]
                  (let [connection (get connections (:id server))]
                    (when (usable? server connection)
                      (try
                        {:server (public-server server)
                         :tools  (:tools (entry! server connection user-id))}
                        (catch Exception e
                          (log/warnf e "Could not list tools of MCP server %s (%s)" (:name server) (:id server))
                          nil))))))
          servers)))

(defn call-user-tool!
  "Call `tool-name` on server `server-id` as `user-id` and return the server's result."
  [user-id server-id tool-name arguments]
  (let [server     (or (mcp-client.db/server server-id)
                       (throw (ex-info (tru "MCP server {0} does not exist" server-id)
                                       {:type :mcp-client/unknown-server :status-code 404})))
        connection (mcp-client.db/user-connection server-id user-id)]
    (when-not (usable? server connection)
      (throw (ex-info (tru "You are not connected to {0}" (:name server))
                      {:type :mcp-client/not-connected :status-code 400})))
    (client/call-tool (:client (entry! server connection user-id)) tool-name arguments)))
