(ns metabase.middleware.security
  "Ring middleware for adding security-related headers to API responses."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [java-time :as t]
            [metabase.config :as config]
            [metabase.middleware.util :as middleware.u]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util.i18n :as ui18n :refer [deferred-tru]]
            [ring.util.codec :refer [base64-encode]])
  (:import java.security.MessageDigest))

(defn- file-hash [resource-filename]
  (base64-encode
    (.digest (doto (java.security.MessageDigest/getInstance "SHA-256")
               (.update (.getBytes (slurp (io/resource resource-filename))))))))

(def ^:private ^:const index-bootstrap-js-hash (file-hash "frontend_client/inline_js/index_bootstrap.js"))
(def ^:private ^:const index-ganalytics-js-hash (file-hash "frontend_client/inline_js/index_ganalytics.js"))
(def ^:private ^:const init-js-hash (file-hash "frontend_client/inline_js/init.js"))

(defonce ^:private ^:const inline-js-hashes
  (let [file-hash (fn [resource-filename]
                    (base64-encode
                     (.digest (doto (java.security.MessageDigest/getInstance "SHA-256")
                                (.update (.getBytes (slurp (io/resource resource-filename))))))))]
    (mapv file-hash [;; inline script in index.html that sets `MetabaseBootstrap` and the like
                     "frontend_client/inline_js/index_bootstrap.js"
                     ;; inline script in index.html that loads Google Analytics
                     "frontend_client/inline_js/index_ganalytics.js"
                     ;; inline script in init.html
                     "frontend_client/inline_js/init.js"])))

(defn- cache-prevention-headers
  "Headers that tell browsers not to cache a response."
  []
  {"Cache-Control" "max-age=0, no-cache, must-revalidate, proxy-revalidate"
   "Expires"        "Tue, 03 Jul 2001 06:00:00 GMT"
   "Last-Modified"  (t/format :rfc-1123-date-time (t/zoned-date-time))})

 (defn- cache-far-future-headers
   "Headers that tell browsers to cache a static resource for a long time."
   []
   {"Cache-Control" "public, max-age=31536000"})

(def ^:private ^:const strict-transport-security-header
  "Tell browsers to only access this resource over HTTPS for the next year (prevent MTM attacks). (This only applies if
  the original request was HTTPS; if sent in response to an HTTP request, this is simply ignored)"
  {"Strict-Transport-Security" "max-age=31536000"})

(def ^:private content-security-policy-header
  "`Content-Security-Policy` header. See https://content-security-policy.com for more details."
  {"Content-Security-Policy"
   (str/join
    (for [[k vs] {:default-src  ["'none'"]
                  :script-src   (concat
                                  ["'self'"
                                   "'unsafe-eval'" ; TODO - we keep working towards removing this entirely
                                   "https://maps.google.com"
                                   "https://apis.google.com"
                                   "https://www.google-analytics.com" ; Safari requires the protocol
                                   "https://*.googleapis.com"
                                   "*.gstatic.com"
                                   ;; for webpack hot reloading
                                   (when config/is-dev?
                                     "localhost:8080")]
                                  (map (partial format "'sha256-%s'") inline-js-hashes))
                  :child-src    ["'self'"
                                 ;; TODO - double check that we actually need this for Google Auth
                                 "https://accounts.google.com"]
                  :style-src    ["'self'"
                                 "'unsafe-inline'"]
                  :font-src     ["'self'"
                                 (when config/is-dev?
                                   "localhost:8080")]
                  :img-src      ["*"
                                 "'self' data:"]
                  :connect-src  ["'self'"
                                 ;; MailChimp. So people can sign up for the Metabase mailing list in the sign up process
                                 "metabase.us10.list-manage.com"
                                 (when config/is-dev?
                                   "localhost:8080 ws://localhost:8080")]
                  :manifest-src ["'self'"]}]
      (format "%s %s; " (name k) (str/join " " vs))))})

(defsetting ssl-certificate-public-key
  (str (deferred-tru "Base-64 encoded public key for this site's SSL certificate.")
       (deferred-tru "Specify this to enable HTTP Public Key Pinning.")
       (deferred-tru "See {0} for more information." "http://mzl.la/1EnfqBf")))
;; TODO - it would be nice if we could make this a proper link in the UI; consider enabling markdown parsing

(defn security-headers
  "Fetch a map of security headers that should be added to a response based on the passed options."
  [& {:keys [allow-iframes? allow-cache?]
      :or   {allow-iframes? false, allow-cache? false}}]
  (merge
   (if allow-cache?
     (cache-far-future-headers)
     (cache-prevention-headers))
   strict-transport-security-header
   content-security-policy-header
   (when-not allow-iframes?
     ;; Tell browsers not to render our site as an iframe (prevent clickjacking)
     {"X-Frame-Options"                 "DENY"})
   { ;; Tell browser to block suspected XSS attacks
    "X-XSS-Protection"                  "1; mode=block"
    ;; Prevent Flash / PDF files from including content from site.
    "X-Permitted-Cross-Domain-Policies" "none"
    ;; Tell browser not to use MIME sniffing to guess types of files -- protect against MIME type confusion attacks
    "X-Content-Type-Options"            "nosniff"}))

(defn- add-security-headers* [request response]
  (update response :headers merge (security-headers
                                   :allow-iframes? ((some-fn middleware.u/public? middleware.u/embed?) request)
                                   :allow-cache?   (middleware.u/cacheable? request))))

(defn add-security-headers
  "Add HTTP security and cache-busting headers."
  [handler]
  (fn [request respond raise]
    (handler
     request
     (comp respond (partial add-security-headers* request))
     raise)))
