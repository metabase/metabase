(ns metabase.server.middleware.data-apps-host
  "Serve the sandboxed data-app iframe from a separate origin when `MB_DATA_APPS_HOST`
  is set (see [[metabase.server.settings/data-apps-host]]).

  The data-app document is same-origin with the main app today, so a Near-Membrane
  escape can reach `window.parent.fetch` with the session cookie. Serving it from a
  separate host makes the session structurally unreachable there: the session cookie
  is host-only (no `Domain`), so it is never sent to another host. The data app then
  reaches the instance only through the host app's postMessage broker.

  This middleware does two things when the setting is configured:
    - on the MAIN host, 307-redirects the data-app document (`/embed/apps/*`) to the
      apps host, so the sandbox document is never served same-origin-with-session;
    - on the APPS host, serves ONLY the public shell + static assets and refuses
      everything else — most importantly any endpoint that could set a session
      cookie on the apps origin (login/SSO) or the authenticated API. It also
      fails closed if the session cookie ever reaches the apps host (see
      [[carries-session-cookie?]]) — the whole model rests on that cookie being
      host-only, so its presence there means the guarantee was broken."
  (:require
   [clojure.string :as str]
   [metabase.request.core :as request]
   [metabase.server.settings :as server.settings]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- host-name
  "Lowercased hostname (no port) from a `host[:port]` header value."
  [host]
  (some-> host (str/split #":") first not-empty str/lower-case))

(defn- request-host-names
  "The proxy's hostname and the one on the wire. Both are checked because a client can
   forge `X-Forwarded-Host`, and matching either only ever adds restrictions."
  [{:keys [headers]}]
  (keep host-name [(get headers "x-forwarded-host")
                   (get headers "host")]))

(defn- origin-host-name
  "Hostname of a full origin string like `https://apps.example.com`."
  [origin]
  (try
    (host-name (.getHost (java.net.URI. origin)))
    (catch Exception _ nil)))

(defn- on-apps-host?
  [request apps-host]
  (boolean
   (when-let [apps-host-name (origin-host-name apps-host)]
     (some #{apps-host-name} (request-host-names request)))))

(defn- apps-host-allowed-uri?
  "URIs the apps host is allowed to serve: the public SPA shell, static frontend
  assets, and harmless infra probes. Everything else (the whole authenticated API,
  login/SSO, the main app) is refused there — the bundle and all data come through
  the broker on the main host, so nothing authenticated is served cross-origin."
  [uri]
  (boolean
   (or (re-matches #"^/embed/apps/.*$" uri)
       (re-matches #"^/app/.*$" uri)
       (contains? #{"/favicon.ico" "/livez" "/readyz" "/api/health"} uri))))

(defn- carries-session-cookie?
  "True when the request's `Cookie` header carries a Metabase session cookie. On the
   apps host that must never happen — the session cookie is host-only (no `Domain`),
   so it is only ever sent to the main host. Its presence here means the host-only
   guarantee was broken (a cookie `Domain`, or a reverse proxy rewriting `Set-Cookie`),
   which would expose the viewing user's session to the untrusted app origin."
  [request]
  (boolean
   (when-let [cookie-header (get-in request [:headers "cookie"])]
     (some #(str/includes? cookie-header (str % "="))
           [request/metabase-session-cookie
            request/metabase-embedded-session-cookie]))))

(defonce ^:private warned-missing-site-url? (atom false))

(defn- warn-once-if-missing-site-url!
  "The apps-host document's CSP `frame-ancestors` is derived from `site-url`; without
   it the value falls back to `'self'` and the main app can't frame the iframe, so data
   apps silently fail to load. Log once so the misconfiguration surfaces."
  []
  (when (and (str/blank? (system/site-url))
             (compare-and-set! warned-missing-site-url? false true))
    (log/error (str "MB_DATA_APPS_HOST is set but MB_SITE_URL is not. The data-app iframe's "
                    "frame-ancestors is derived from the site URL; without it the main app "
                    "cannot frame the iframe and data apps will not load. Set MB_SITE_URL to "
                    "the main app's origin."))))

(defn- redirect-to-apps-host
  [{:keys [uri query-string]} apps-host]
  (-> (response/redirect (str apps-host uri (when (not (str/blank? query-string))
                                              (str "?" query-string))))
      (response/status 307)))

(defn data-apps-host-middleware
  "See namespace docstring. A no-op unless `MB_DATA_APPS_HOST` is configured."
  [handler]
  (fn [request respond raise]
    (let [apps-host (server.settings/data-apps-host)]
      (when-not (str/blank? apps-host)
        (warn-once-if-missing-site-url!))
      (cond
        (str/blank? apps-host)
        (handler request respond raise)

        (on-apps-host? request apps-host)
        (cond
          (not (apps-host-allowed-uri? (:uri request)))
          (respond {:status 404, :body "Not found."})

          ;; Fail closed: the app document must never be served while the session
          ;; cookie is reaching this origin, or the app would run with the viewing
          ;; user's session in reach — the exact thing cross-origin serving prevents.
          (and (request/data-app? request) (carries-session-cookie? request))
          (do
            (log/error (str "Refusing to serve a data app: a Metabase session cookie reached the "
                            "apps host (MB_DATA_APPS_HOST). The session cookie must be host-only; "
                            "check that no cookie Domain or reverse proxy makes it visible there."))
            (respond {:status 403
                      :body   "Data apps are misconfigured: the session cookie is not host-only."}))

          :else
          (handler request respond raise))

        (request/data-app? request)
        (respond (redirect-to-apps-host request apps-host))

        :else
        (handler request respond raise)))))
