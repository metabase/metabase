(ns metabase.oauth-server.held-scopes
  "The scopes an app already holds through a user's live OAuth tokens, and narrowing them when the user unticks one
  on the consent page.

  An app is not one OAuth client: several MCP clients register a new client on every login or step-up. So a token
  belongs to the same app as an authorization request when its client has the same `client_id`, or a redirect that
  identifies the same app (see [[same-app?]])."
  (:require
   [clojure.string :as str]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.net URI URISyntaxException)))

(set! *warn-on-reflection* true)

(def ^:private loopback-hosts
  #{"localhost" "127.0.0.1" "[::1]"})

(defn- parse-uri
  ^URI [s]
  (when s
    (try
      (URI. (str s))
      (catch URISyntaxException _ nil))))

(defn- loopback-key
  "`[scheme host path query]` of a loopback `redirect-uri`, which names the app whatever port it listened on, or nil
  when `redirect-uri` is not a loopback URI."
  [redirect-uri]
  (when-let [uri (parse-uri redirect-uri)]
    (let [host (some-> (.getHost uri) u/lower-case-en)]
      (when (contains? loopback-hosts host)
        [(some-> (.getScheme uri) u/lower-case-en) host (.getRawPath uri) (.getRawQuery uri)]))))

(defn- https-uri? [redirect-uri]
  (= "https" (some-> (parse-uri redirect-uri) .getScheme u/lower-case-en)))

(defn- same-redirect?
  "Whether redirect `a-uri` of a client named `a-name` and redirect `b-uri` of a client named `b-name` identify the same
  app."
  [a-name a-uri b-name b-uri]
  (if-let [a-key (loopback-key a-uri)]
    ;; Loopback paths like `/callback` are shared by unrelated tools, so the name has to agree too.
    (and (not (str/blank? a-name))
         (= a-name b-name)
         (= a-key (loopback-key b-uri)))
    ;; Only https: a custom scheme can be claimed by any app on the device.
    (and (https-uri? a-uri)
         (= a-uri b-uri))))

(defn same-app?
  "Whether OAuth clients `a` and `b`, maps of `:client_id`, `:client_name` and `:redirect_uris`, are the same app: the
  same `client_id`, the exact same https redirect, or a loopback redirect with the same scheme, host, path and query
  under the same non-blank client name, whatever the port. A name alone never matches."
  [a b]
  (boolean
   (or (and (some? (:client_id a))
            (= (:client_id a) (:client_id b)))
       (some (fn [[a-uri b-uri]]
               (same-redirect? (:client_name a) a-uri (:client_name b) b-uri))
             (for [a-uri (:redirect_uris a)
                   b-uri (:redirect_uris b)]
               [a-uri b-uri])))))

(defn declined-scopes
  "The `offered` scopes in `held` (a set) that `granted` leaves out, in offered order."
  [offered held granted]
  (let [granted (set granted)]
    (filterv #(and (contains? held %) (not (contains? granted %))) offered)))

(defn narrowed-scope
  "`scope` without the exact scope strings in `declined`, in order. A wildcard that covers a declined scope is kept."
  [scope declined]
  (filterv (complement (set declined)) scope))

(defn- same-app-live-tokens
  "The unrevoked, unexpired access and refresh tokens of the User with `user-id` whose client is the same app as the
  client `client-id` authorizing for `redirect-uri`, as `{:access [rows] :refresh [rows]}`."
  [user-id client-id redirect-uri]
  (let [now        (System/currentTimeMillis)
        access     (oauth-server.db/live-access-tokens-for-user user-id now)
        refresh    (oauth-server.db/live-refresh-tokens-for-user user-id now)
        ;; Match on the redirect this request delivers the code to, not every redirect the client registered: a
        ;; client could register another app's redirect alongside its own and still receive the code at its own.
        requesting (some-> (oauth-server.db/oauth-client client-id) (assoc :redirect_uris [redirect-uri]))
        client-ids (distinct (map :client_id (concat access refresh)))
        same-app   (if (and requesting (seq client-ids))
                     (into #{}
                           (comp (filter #(same-app? requesting %)) (map :client_id))
                           (oauth-server.db/oauth-clients client-ids))
                     #{})]
    {:access  (filterv (comp same-app :client_id) access)
     :refresh (filterv (comp same-app :client_id) refresh)}))

(defn held-scopes
  "The set of scope strings that the live access and refresh tokens of the User with `user-id` hold for the same app as
  the client `client-id` authorizing for `redirect-uri`."
  [user-id client-id redirect-uri]
  (let [{:keys [access refresh]} (same-app-live-tokens user-id client-id redirect-uri)]
    (into #{} (mapcat :scope) (concat access refresh))))

(defn narrow-declined-scopes!
  "Remove each `offered` scope that `granted` leaves out from the live access and refresh tokens the User with `user-id`
  holds for the same app as the client `client-id` authorizing for `redirect-uri`. Removes only exact scope strings,
  never adds one, and never touches a scope that was not offered. A token left with no scope is revoked; no other
  token is. Returns the declined scopes."
  [user-id client-id redirect-uri offered granted]
  (t2/with-transaction [_conn]
    (let [{:keys [access refresh]} (same-app-live-tokens user-id client-id redirect-uri)
          declined                 (declined-scopes offered
                                                    (into #{} (mapcat :scope) (concat access refresh))
                                                    granted)]
      (when (seq declined)
        (doseq [[rows set-scope! revoke!] [[access
                                            oauth-server.db/update-access-token-scope!
                                            oauth-server.db/revoke-access-token!]
                                           [refresh
                                            oauth-server.db/update-refresh-token-scope!
                                            oauth-server.db/revoke-refresh-token!]]
                {:keys [id token scope]} rows
                :let [narrowed (narrowed-scope scope declined)]
                :when (not= narrowed (vec scope))]
          (if (empty? narrowed)
            (revoke! token)
            (set-scope! id narrowed))))
      declined)))
