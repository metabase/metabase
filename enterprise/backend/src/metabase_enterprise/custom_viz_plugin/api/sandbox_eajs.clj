(ns metabase-enterprise.custom-viz-plugin.api.sandbox-eajs
  "Signed-URL donor endpoint for the EAJS (iframe) custom-viz sandbox.

  In iframe embedding the sandbox donor cannot be session-cookie authed (an iframe `src` carries no
  headers and EAJS has no first-party cookies) and its `frame-ancestors` must name the customer origin
  rather than `'self'`. So the flow is split in two:

    - authed `POST /sandbox-host-eajs/sign` (in the parent api ns) mints a short-lived HS256 token bound
      to the requesting embed's origin, and
    - unauthed `GET /sandbox-host-eajs?token=…` (here) serves the inert donor document, trusting the
      token's signature as the auth.

  The origin is canonicalized but not checked against an allowlist: EAJS has no embedding-origin
  allowlist (the embed page itself is served with `frame-ancestors *`), so binding the donor's
  `frame-ancestors` to the requesting origin is scoping, not access control.

  The token never carries session or user data; the signature is the only capability."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.api.macros :as api.macros]
   [metabase.server.middleware.security :as mw.security]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private token-purpose "custom-viz-sandbox-eajs")
(def ^:private token-ttl-seconds 120)
(def ^:private max-token-window-seconds 300)
(def ^:private max-token-length 2048)
(def ^:private max-origin-length 2000)

(defn- now-seconds ^long []
  (quot (System/currentTimeMillis) 1000))

(defn- canonicalize-origin
  "Parse a posted `raw` origin down to a bare `scheme://host[:port]`, or nil when it isn't a well-formed
   http(s) origin. Rejects paths, userinfo, wildcards and non-http schemes so raw input is never reflected
   into a token or a CSP header."
  [raw]
  (when (and (string? raw) (<= (count raw) max-origin-length))
    (let [{:keys [protocol domain port]} (mw.security/try-parse-url (str/trim raw))]
      (when (and protocol
                 (contains? #{"http" "https"} (u/lower-case-en protocol))
                 domain
                 (not (str/includes? domain "*"))
                 (not= port "*"))
        (str (u/lower-case-en protocol) "://" (u/lower-case-en domain)
             (when port (str ":" port)))))))

(defn- sign-token [origin]
  (let [now (now-seconds)]
    (jwt/sign {:purpose token-purpose
               :iat     now
               :exp     (+ now token-ttl-seconds)
               :jti     (str (random-uuid))
               :v       1
               :origin  origin}
              (custom-viz.settings/custom-viz-sandbox-signing-key)
              {:alg :hs256})))

(defn mint-signed-url
  "Canonicalize `raw-origin` and, when it is a well-formed http(s) origin, return a relative URL to the
   donor endpoint carrying a fresh short-lived signed token. Returns nil for a missing or malformed origin."
  [raw-origin]
  (when-let [origin (canonicalize-origin raw-origin)]
    (str "/api/ee/custom-viz-plugin/sandbox-host-eajs?token=" (sign-token origin))))

(defn- verify-token
  "Return the claims of a valid donor `token`, or nil. Enforces a length cap before parsing, the HS256
   signature, expiry (with leeway), the expected purpose, and a bounded lifetime."
  [token]
  (when (and (string? token)
             (seq token)
             (<= (count token) max-token-length))
    (try
      (let [{:keys [purpose iat exp origin] :as claims}
            (jwt/unsign token (custom-viz.settings/custom-viz-sandbox-signing-key) {:alg :hs256 :leeway 30})]
        (when (and (= purpose token-purpose)
                   (number? iat)
                   (number? exp)
                   (<= (- exp iat) max-token-window-seconds)
                   (string? origin)
                   (seq origin))
          claims))
      (catch Exception _ nil))))

(def ^:private donor-html
  "Inert donor document. The `mb-sandbox-host` marker lets the client tell a real donor load apart from a
   browser-served error page (an iframe `load` event fires on both)."
  (str "<!doctype html><html><head><meta charset=\"utf-8\">"
       "<meta name=\"mb-sandbox-host\" content=\"1\"></head><body></body></html>"))

(defn- donor-csp [origin]
  (str "default-src 'none'; script-src 'unsafe-eval'; frame-ancestors 'self' " origin ";"))

(def ^:private no-store-headers
  {"Cache-Control"          "private, no-store, max-age=0"
   "Referrer-Policy"        "no-referrer"
   "X-Content-Type-Options" "nosniff"})

(def ^:private not-found-response
  "Uniform response for any invalid, expired, oversized or wrong-purpose token. No redirect, no caching, and
   deliberately identical across failure modes so it leaks nothing about why the token was rejected."
  {:status  404
   :headers (assoc no-store-headers "Content-Type" "text/plain; charset=utf-8")
   :body    "Not found"})

(api.macros/defendpoint :get "/sandbox-host-eajs" :- :any
  "Serve the inert HTML donor document used as the iframe `src` for the near-membrane custom-viz sandbox in
   EAJS embedding. The `token` query param (minted by `POST /sandbox-host-eajs/sign`) is the only auth. On a
   valid token the response carries a per-document CSP whose `frame-ancestors` names the customer origin from
   the token, permits `'unsafe-eval'` inside this iframe only, and omits `X-Frame-Options` so the page can be
   framed cross-origin. Any invalid token yields a uniform, uncached 404."
  [_route-params
   {:keys [token]} :- [:map [:token {:optional true} [:maybe :string]]]]
  (if-not (custom-viz.settings/enable-custom-viz?)
    not-found-response
    (if-let [{:keys [origin]} (verify-token token)]
      {:status  200
       :headers (assoc no-store-headers
                       "Content-Type"            "text/html; charset=utf-8"
                       "Content-Security-Policy" (donor-csp origin)
                       ;; nil drops the header: the global security middleware would otherwise inject
                       ;; X-Frame-Options: DENY, which blocks the cross-origin framing we need here.
                       "X-Frame-Options"         nil)
       :body    donor-html}
      not-found-response)))

(def ^{:arglists '([request respond raise])} routes
  "Unauthed `/api/ee/custom-viz-plugin/sandbox-host-eajs` donor route. Mounted alongside the authed
   custom-viz-plugin routes; the token signature is the auth."
  (api.macros/ns-handler *ns*))
