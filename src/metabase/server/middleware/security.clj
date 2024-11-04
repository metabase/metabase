(ns metabase.server.middleware.security
  "Ring middleware for adding security-related headers to API responses."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.config :as config]
   [metabase.embed.settings :as embed.settings]
   [metabase.public-settings :as public-settings]
   [metabase.server.request.util :as req.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [ring.util.codec :refer [base64-encode]])
  (:import
   (java.security MessageDigest SecureRandom)))

(set! *warn-on-reflection* true)

(defn- generate-nonce
  "Generates a random nonce of 10 characters to add to the `Content-Security-Policy` header so that only scripts and
   inline style elements with the same nonce will be allowed to run. The server generates a unique nonce value each
   time it sends a response. For more information see
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/style-src."
  []
  (let [chars         "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        secure-random (SecureRandom.)]
    (apply str (repeatedly 10 #(get chars (.nextInt secure-random (count chars)))))))

(defonce ^:private ^:const inline-js-hashes
  (letfn [(file-hash [resource-filename]
            (base64-encode
             (.digest (doto (MessageDigest/getInstance "SHA-256")
                        (.update (.getBytes (slurp (io/resource resource-filename))))))))]
    (mapv file-hash [;; inline script in index.html that sets `MetabaseBootstrap` and the like
                     "frontend_client/inline_js/index_bootstrap.js"
                     ;; inline script in init.html
                     "frontend_client/inline_js/init.js"
                     ;; inline script in init.html to handle errors when grabbing app scripts
                     "frontend_client/inline_js/asset_loading_error.js"])))

(defn- cache-prevention-headers
  "Headers that tell browsers not to cache a response."
  []
  {"Cache-Control" "max-age=0, no-cache, must-revalidate, proxy-revalidate"
   "Expires"        "Tue, 03 Jul 2001 06:00:00 GMT"
   "Last-Modified"  (t/format :rfc-1123-date-time (t/zoned-date-time))})

(def cache-far-future-headers
  "Headers that tell browsers to cache a static resource for a long time."
  {"Cache-Control" "public, max-age=31536000"})

(def ^:private ^:const strict-transport-security-header
  "Tell browsers to only access this resource over HTTPS for the next year (prevent MTM attacks). (This only applies if
  the original request was HTTPS; if sent in response to an HTTP request, this is simply ignored)"
  {"Strict-Transport-Security" "max-age=31536000"})

(defn parse-url
  "Returns an object with protocol, domain and port for the given url"
  [url]
  (if (= url "*")
    {:protocol nil :domain "*" :port "*"}
    (let [pattern #"^(?:(https?)://)?([^:/]+)(?::(\d+|\*))?$"
          matches (re-matches pattern url)]
      (if-not matches
        (do (log/errorf "Invalid URL: %s" url) nil)
        (let [[_ protocol domain port] matches]
          {:protocol protocol
           :domain domain
           :port port})))))

(defn- add-wildcard-entries
  "Adds a wildcard prefix `.*` to the domain part of the given `domain-or-url` string.

  Only adds the wildcard entry when the given domain does not have a subdomain already,
  with the exception of single name domains like 'localhost' which should not have the wildcard prefix.

  This is done because we won't know if the typical iframe src URL will include a www or not.

  For example,
  youtube.com typically won't work because the iframe src is https://www.youtube.com/whatever. So we add *.youtube.com to cover this case.
  But, *.twitter.com won't work for the inverse reason; the iframe src is https://twitter.com/whatever and adding the wildcard fails to match.

  So, we'll double things up and include both the wildcard and non-wildcard entry. We still keep the logic of not adding a wildcard when a
  subdomain is already specified because we want to treat this case as the user being more specific and thus intentionally less permissive."
  [domain-or-url]
  (let [cleaned-domain (-> domain-or-url
                           (str/replace #"/$" "")
                           (str/replace #"www." ""))
        {:keys [protocol domain port]} (parse-url cleaned-domain)]
    (when domain
      (let [split-domain (str/split domain #"\.")
            new-domains  (cond-> (if (= (count split-domain) 2)
                                   [domain (format "*.%s" domain)]
                                   [domain])
                           (str/includes? domain-or-url "www.") (conj (format "www.%s" domain)))]
        (for [new-domain new-domains]
          (str (when protocol (format "%s://" protocol))
               new-domain
               (when (and port (not= domain "*")) (format ":%s" port))))))))

(defn- parse-allowed-iframe-hosts*
  [hosts-string]
  (->> (str/split hosts-string #"[ ,\s\r\n]+")
       (remove str/blank?)
       (mapcat add-wildcard-entries)
       (into ["'self'"])))

(def ^{:doc "Parse the string of allowed iframe hosts, adding wildcard prefixes as needed."}
  parse-allowed-iframe-hosts
  (memoize parse-allowed-iframe-hosts*))

(defn- content-security-policy-header
  "`Content-Security-Policy` header. See https://content-security-policy.com for more details."
  [nonce]
  {"Content-Security-Policy"
   (str/join
    (for [[k vs] {:default-src  ["'none'"]
                  :script-src   (concat
                                 ["'self'"
                                  "https://maps.google.com"
                                  "https://accounts.google.com"
                                  (when (public-settings/anon-tracking-enabled)
                                    "https://www.google-analytics.com")
                                  ;; for webpack hot reloading
                                  (when config/is-dev?
                                    "http://localhost:8080")
                                  ;; for react dev tools to work in Firefox until resolution of
                                  ;; https://github.com/facebook/react/issues/17997
                                  (when config/is-dev?
                                    "'unsafe-inline'")]
                                 ;; CLJS REPL
                                 (when config/is-dev?
                                   ["'unsafe-eval'"
                                    "http://localhost:9630"])
                                 (when-not config/is-dev?
                                   (map (partial format "'sha256-%s'") inline-js-hashes)))
                  :child-src    ["'self'"
                                 "https://accounts.google.com"]
                  :style-src    ["'self'"
                                 ;; See [[generate-nonce]]
                                 (when nonce
                                   (format "'nonce-%s'" nonce))
                                 ;; for webpack hot reloading
                                 (when config/is-dev?
                                   "http://localhost:8080")
                                 ;; CLJS REPL
                                 (when config/is-dev?
                                   "http://localhost:9630")
                                 "https://accounts.google.com"]
                  :frame-src    (parse-allowed-iframe-hosts (public-settings/allowed-iframe-hosts))
                  :font-src     ["*"]
                  :img-src      ["*"
                                 "'self' data:"]
                  :connect-src  ["'self'"
                                 ;; Google Identity Services
                                 "https://accounts.google.com"
                                 ;; MailChimp. So people can sign up for the Metabase mailing list in the sign up process
                                 "metabase.us10.list-manage.com"
                                 ;; Snowplow analytics
                                 (when (public-settings/anon-tracking-enabled)
                                   (snowplow/snowplow-url))
                                 ;; Webpack dev server
                                 (when config/is-dev?
                                   "*:8080 ws://*:8080")
                                 ;; CLJS REPL
                                 (when config/is-dev?
                                   "ws://*:9630")]
                  :manifest-src ["'self'"]}]
      (format "%s %s; " (name k) (str/join " " vs))))})

(defn- content-security-policy-header-with-frame-ancestors
  [allow-iframes? nonce]
  (update (content-security-policy-header nonce)
          "Content-Security-Policy"
          #(format "%s frame-ancestors %s;" % (if allow-iframes? "*"
                                                  (if-let [eao (and (embed.settings/enable-embedding-interactive)
                                                                    (embed.settings/embedding-app-origins-interactive))]
                                                    eao
                                                    "'none'")))))

(defn approved-domain?
  "Checks if the domain is compatible with the reference one"
  [domain reference-domain]
  (or (= reference-domain "*")
      (if (str/starts-with? reference-domain "*.")
        (str/ends-with? domain (str/replace-first reference-domain "*." "."))
        (= domain reference-domain))))

(defn approved-protocol?
  "Checks if the protocol is compatible with the reference one"
  [protocol reference-protocol]
  (or (nil? reference-protocol)
      (= protocol reference-protocol)))

(defn approved-port?
  "Checks if the port is compatible with the reference one"
  [port reference-port]
  (or
   (= reference-port "*")
   (= port reference-port)))

(defn parse-approved-origins
  "Parses the space separated string of approved origins"
  [approved-origins-raw]
  (let [urls (str/split approved-origins-raw #" +")]
    (keep parse-url urls)))

(mu/defn approved-origin?
  "Returns true if `origin` should be allowed for CORS based on the `approved-origins`"
  [raw-origin :- [:maybe :string]
   approved-origins-raw :- [:maybe :string]]
  (boolean
   (when (and (seq raw-origin) (seq approved-origins-raw))
     (let [approved-list (parse-approved-origins approved-origins-raw)
           origin        (parse-url raw-origin)]
       (some (fn [approved-origin]
               (and
                (approved-domain? (:domain origin) (:domain approved-origin))
                (approved-protocol? (:protocol origin) (:protocol approved-origin))
                (approved-port? (:port origin) (:port approved-origin))))
             approved-list)))))

(defn access-control-headers
  "Returns headers for CORS requests"
  [origin enabled? approved-origins]
  (when enabled?
    (merge
     (when (approved-origin? origin (if enabled? approved-origins "localhost:*"))
       {"Access-Control-Allow-Origin" origin
        "Vary"                        "Origin"})
     {"Access-Control-Allow-Headers"  "*"
      "Access-Control-Allow-Methods"  "*"
      "Access-Control-Expose-Headers" "X-Metabase-Anti-CSRF-Token"})))

(defn security-headers
  "Fetch a map of security headers that should be added to a response based on the passed options."
  [& {:keys [origin nonce allow-iframes? allow-cache?]
      :or   {allow-iframes? false, allow-cache? false}}]
  (merge
   (if allow-cache? cache-far-future-headers (cache-prevention-headers))
   strict-transport-security-header
   (content-security-policy-header-with-frame-ancestors allow-iframes? nonce)
   (access-control-headers origin
                           (embed.settings/enable-embedding-sdk)
                           (embed.settings/embedding-app-origins-sdk))
   (when-not allow-iframes?
     ;; Tell browsers not to render our site as an iframe (prevent clickjacking)
     {"X-Frame-Options"                 (if-let [eao (and (embed.settings/enable-embedding-interactive)
                                                          (embed.settings/embedding-app-origins-interactive))]
                                          (format "ALLOW-FROM %s" (-> eao (str/split #" ") first))
                                          "DENY")})
   {;; Tell browser to block suspected XSS attacks
    "X-XSS-Protection"                  "1; mode=block"
    ;; Prevent Flash / PDF files from including content from site.
    "X-Permitted-Cross-Domain-Policies" "none"
    ;; Tell browser not to use MIME sniffing to guess types of files -- protect against MIME type confusion attacks
    "X-Content-Type-Options"            "nosniff"}))

(defn- add-security-headers* [request response]
  ;; merge is other way around so that handler can override headers
  (update response :headers #(merge %2 %1) (security-headers
                                            :origin         ((:headers request) "origin")
                                            :nonce          (:nonce request)
                                            :allow-iframes? ((some-fn req.util/public? req.util/embed?) request)
                                            :allow-cache?   (req.util/cacheable? request))))

(defn add-security-headers
  "Middleware that adds HTTP security and cache-busting headers."
  [handler]
  (fn [request respond raise]
    (let [request (assoc request :nonce (generate-nonce))]
      (handler
       request
       (comp respond (partial add-security-headers* request))
       raise))))
