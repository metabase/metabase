(ns metabase.oauth-server.held-scopes
  "The scopes an app already holds through a user's most recent live OAuth grant, which the consent page pre-ticks so a
  step-up does not silently drop them.

  An app is not one OAuth client: several MCP clients register a new client on every login or step-up. So a token
  belongs to the same app as an authorization request when its client has the same `client_id`, or a redirect that
  identifies the same app (see [[same-app?]])."
  (:require
   [clojure.string :as str]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.util :as u])
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
    ;; Loopback paths like `/callback` are shared by unrelated tools, so the name has to agree too. The port cannot:
    ;; Claude Code registers a fresh `client_id` on a fresh port every time it authenticates, and matching the port
    ;; would mean it never sees a pre-tick at all -- the client this is most for.
    ;;
    ;; Accepted risk: `POST /oauth/register` is unauthenticated, so a local program can register under the same name on
    ;; its own loopback port and send the user to `/authorize`, where their held scopes appear pre-ticked on a consent
    ;; screen that looks like the real one, and one Authorize click grants them. It takes local code execution plus a
    ;; user click, and such an attacker can request those scopes outright anyway; the only difference is that an
    ;; outright request starts unticked. Requiring a `client_id` match or the port closes it and disables the feature
    ;; for Claude Code, so the trade is taken deliberately.
    (and (not (str/blank? a-name))
         (= a-name b-name)
         (= a-key (loopback-key b-uri)))
    ;; Only https: a custom scheme can be claimed by any app on the device.
    (and (https-uri? a-uri)
         (= a-uri b-uri))))

(defn- same-app?
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

(defn held-scopes
  "The set of scope strings held by the most recent live grant the User with `user-id` has for the same app as the
  client `client-id` authorizing for `redirect-uri`. Empty when the app has no live token.

  The most recent grant, not the union of every live one: a refresh token can outlive several authorizations, so a
  union would let an old, wider grant keep pre-ticking a scope the user has since left unticked, silently undoing that
  decision every time they re-authorize. Erring narrow is safe now that an untick only shapes the token being
  minted."
  [user-id client-id redirect-uri]
  (let [now        (System/currentTimeMillis)
        tokens     (concat (oauth-server.db/live-access-tokens-for-user user-id now)
                           (oauth-server.db/live-refresh-tokens-for-user user-id now))
        ;; Match on the redirect this request delivers the code to, not every redirect the client registered: a
        ;; client could register another app's redirect alongside its own and still receive the code at its own.
        requesting (some-> (oauth-server.db/oauth-client client-id) (assoc :redirect_uris [redirect-uri]))
        client-ids (distinct (map :client_id tokens))
        same-app   (if (and requesting (seq client-ids))
                     (into #{}
                           (comp (filter #(same-app? requesting %)) (map :client_id))
                           (oauth-server.db/oauth-clients client-ids))
                     #{})
        live       (filterv (comp same-app :client_id) tokens)
        ;; A grant's access and refresh tokens are written by one token request, so they share a `created_at`: the
        ;; newest timestamp names a grant, not a row, and every row carrying it speaks for that grant. That is what
        ;; keeps the newest grant readable once its access token has expired and only its refresh token is left.
        newest     (last (sort (keep :created_at live)))]
    (into #{}
          (comp (filter #(zero? (compare (:created_at %) newest))) (mapcat :scope))
          live)))
