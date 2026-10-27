(ns metabase.server.middleware.isolated-origin
  "Serves the data-app document from the isolated origin when `MB_ISOLATED_ORIGIN` is set (see
  [[metabase.server.settings/isolated-origin]]). The session cookie is host-only, so it never reaches the isolated
  origin, and the app makes no instance requests of its own there: the top page's broker makes them.

  On the main host, redirects the app document (`/embed/apps/*`) to the isolated origin, refuses every request whose
  `Origin` is the isolated origin, and runs a same-site write that hides its `Origin` without the session cookie. On
  the isolated origin, serves the app document and
  [[isolated-origin-allowed-uri?]], sends `/apps/*` links back to the main host, and answers 404 to everything else,
  which includes login, SSO and the API. Static assets, probes and the middleware's own refusals on the isolated
  origin get [[inert-csp]]; its refusals and redirects are not cached. When the setting is set but unusable, refuses
  the app document."
  (:require
   [clojure.string :as str]
   [metabase.request.core :as request]
   [metabase.server.settings :as server.settings]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- on-isolated-origin?
  "Either host name of `request` counts: a forged `X-Forwarded-Host` can only put a request under the isolated-origin
  rules."
  [request isolated-origin]
  (boolean (some #{(u.http/host-name isolated-origin)} (request/host-names request))))

(defn isolated-origin-request?
  "True when `request` came in through the isolated origin."
  [request]
  (boolean (::isolated-origin? request)))

(defn- isolated-origin-allowed-uri?
  "What the isolated origin serves besides the app document: static frontend assets and probes."
  [{:keys [uri]}]
  (or (str/starts-with? uri "/app/")
      (contains? #{"/favicon.ico" "/livez" "/readyz" "/api/health"} uri)))

(def ^:private inert-csp
  "`sandbox` gives a document an opaque origin, so app code on the isolated origin can't script it, and
   `form-action 'none'` stops it from submitting a form to the main host, where the browser would attach the session
   cookie whenever the two hosts are the same site."
  "sandbox; form-action 'none'; frame-ancestors 'none'")

(def ^:private no-store
  ;; A shared cache must not keep an answer that depends on `X-Forwarded-Host`.
  {"Cache-Control" "no-store"})

(defn- refusal [status body]
  {:status  status
   :body    body
   :headers (merge no-store {"Content-Type"            "text/plain; charset=utf-8"
                             "Content-Security-Policy" inert-csp})})

(defn- redirect [location]
  (-> (response/redirect location :temporary-redirect)
      (update :headers merge no-store)))

(defn- with-query-string [path {:keys [query-string]}]
  (cond-> path
    (not (str/blank? query-string)) (str "?" query-string)))

(defn- isolated-origin-response [handler {:keys [uri request-method] :as request} respond raise]
  (let [request (assoc request ::isolated-origin? true)]
    (cond
      (request/data-app? request)
      (handler request respond raise)

      ;; A link into an app page (`DataAppLink`) resolves against the app document's host.
      (and (= :get request-method) (str/starts-with? uri (str "/" request/data-app-url-segment "/")))
      (respond (redirect (with-query-string (str (system/site-url) uri) request)))

      (isolated-origin-allowed-uri? request)
      (handler request
               (comp respond #(cond-> % (map? %) (update :headers merge {"Content-Security-Policy" inert-csp})))
               raise)

      :else
      (respond (refusal 404 "Not found.")))))

(defn- same-site-write-with-hidden-origin?
  "A write whose `Origin` the browser hid (a no-cors request with `referrerPolicy: \"no-referrer\"` sends `null`), from
  another origin of the same site, to which the browser still sends the session cookie."
  [{:keys [headers request-method]}]
  (and (not (#{:get :head :options} request-method))
       (= "null" (get headers "origin"))
       (= "same-site" (get headers "sec-fetch-site"))))

(defn- without-session-cookies [request]
  (if-let [entries (request/cookie-header-entries request)]
    (assoc-in request [:headers "cookie"]
              (str/join "; " (for [[cookie-name value] entries
                                   :when (not (#{request/metabase-session-cookie
                                                 request/metabase-embedded-session-cookie}
                                               cookie-name))]
                               (if (= "" cookie-name) value (str cookie-name "=" value)))))
    request))

(defn- main-host-response [handler {:keys [headers uri] :as request} respond raise isolated-origin]
  (cond
    ;; The app document sends no requests to the main host; the top page sends them for it. A request with its
    ;; `Origin` is app code going around the broker.
    (= isolated-origin (some-> (get headers "origin") u/lower-case-en))
    (respond (refusal 403 "Requests from the isolated origin are refused."))

    (request/data-app? request)
    (respond (redirect (with-query-string (str isolated-origin (system/site-path) uri) request)))

    ;; Such a write may be app code on a same-site isolated origin, so it runs without the session. It isn't refused:
    ;; an identity provider on the same site that hides its origin posts its SAML response the same way, and needs no
    ;; session.
    (same-site-write-with-hidden-origin? request)
    (handler (without-session-cookies request) respond raise)

    :else
    (handler request respond raise)))

(defn isolated-origin-middleware
  "See the namespace docstring. A no-op while `MB_ISOLATED_ORIGIN` is unset."
  [handler]
  (fn [request respond raise]
    (if-let [isolated-origin (server.settings/isolated-origin)]
      (if (on-isolated-origin? request isolated-origin)
        (isolated-origin-response handler request respond raise)
        (main-host-response handler request respond raise isolated-origin))
      (if (and (request/data-app? request)
               (server.settings/isolated-origin-misconfigured?))
        (respond (refusal 503 "Data apps are unavailable: MB_ISOLATED_ORIGIN is set to a value that can't be used."))
        (handler request respond raise)))))
