(ns metabase.middleware
  "Metabase-specific middleware functions & configuration."
  (:require [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            (cheshire factory
                      [generate :refer [add-encoder encode-str encode-nil]])
            [korma.core :as k]
            [medley.core :refer [filter-vals map-vals]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.config :as config]
            [metabase.db :refer [sel]]
            (metabase.models [interface :as models]
                             [session :refer [Session]]
                             [setting :refer [defsetting]]
                             [user :refer [User]])
            [metabase.util :as u])
  (:import com.fasterxml.jackson.core.JsonGenerator))

;;; # ------------------------------------------------------------ UTIL FNS ------------------------------------------------------------

(defn- api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (and (>= (count uri) 4)
       (= (.substring uri 0 4) "/api")))

(defn- index?
  "Is this ring request one that will serve `index.html` or `init.html`?"
  [{:keys [uri]}]
  (or (zero? (count uri))
      (not (or (re-matches #"^/app/.*$" uri)
               (re-matches #"^/api/.*$" uri)
               (re-matches #"^/favicon.ico$" uri)))))


;;; # ------------------------------------------------------------ AUTH & SESSION MANAGEMENT ------------------------------------------------------------

(def ^:private ^:const metabase-session-cookie "metabase.SESSION_ID")
(def ^:private ^:const metabase-session-header "x-metabase-session")
(def ^:private ^:const metabase-api-key-header "x-metabase-apikey")

(def ^:const response-unauthentic "Generic `401 (Unauthenticated)` Ring response map." {:status 401, :body "Unauthenticated"})
(def ^:const response-forbidden   "Generic `403 (Forbidden)` Ring response map."       {:status 403, :body "Forbidden"})


(defn wrap-session-id
  "Middleware that sets the `:metabase-session-id` keyword on the request if a session id can be found.

   We first check the request :cookies for `metabase.SESSION_ID`, then if no cookie is found we look in the
   http headers for `X-METABASE-SESSION`.  If neither is found then then no keyword is bound to the request."
  [handler]
  (fn [{:keys [cookies headers] :as request}]
    (if-let [session-id (or (get-in cookies [metabase-session-cookie :value]) (headers metabase-session-header))]
      ;; alternatively we could always associate the keyword and just let it be nil if there is no value
      (handler (assoc request :metabase-session-id session-id))
      (handler request))))


(defn wrap-current-user-id
  "Add `:metabase-user-id` to the request if a valid session token was passed."
  [handler]
  (fn [{:keys [metabase-session-id] :as request}]
    ;; TODO - what kind of validations can we do on the sessionid to make sure it's safe to handle?  str?  alphanumeric?
    (handler (or (when (and metabase-session-id ((resolve 'metabase.core/initialized?)))
                   (when-let [session (first (k/select Session
                                                       ;; NOTE: we join with the User table and ensure user.is_active = true
                                                       (k/with User (k/where {:is_active true}))
                                                       (k/fields :created_at :user_id)
                                                       (k/where {:id metabase-session-id})))]
                     (let [session-age-ms (- (System/currentTimeMillis) (.getTime ^java.util.Date (get session :created_at (java.util.Date. 0))))]
                       ;; If the session exists and is not expired (max-session-age > session-age) then validation is good
                       (when (and session (> (config/config-int :max-session-age) (quot session-age-ms 60000)))
                         (assoc request :metabase-user-id (:user_id session))))))
                 request))))


(defn enforce-authentication
  "Middleware that returns a 401 response if REQUEST has no associated `:metabase-user-id`."
  [handler]
  (fn [{:keys [metabase-user-id] :as request}]
    (if metabase-user-id
      (handler request)
      response-unauthentic)))

(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*` and `*current-user-id*`

   *  `*current-user-id*` int ID or nil of user associated with request
   *  `*current-user*`    delay that returns current user (or nil) from DB"
  [handler]
  (fn [request]
    (if-let [current-user-id (:metabase-user-id request)]
      (binding [*current-user-id* current-user-id
                *current-user*    (delay (sel :one `[User ~@(models/default-fields User) :is_active :is_staff], :id current-user-id))]
        (handler request))
      (handler request))))


(defn wrap-api-key
  "Middleware that sets the `:metabase-api-key` keyword on the request if a valid API Key can be found.
   We check the request headers for `X-METABASE-APIKEY` and if it's not found then then no keyword is bound to the request."
  [handler]
  (fn [{:keys [headers] :as request}]
    (if-let [api-key (headers metabase-api-key-header)]
      (handler (assoc request :metabase-api-key api-key))
      (handler request))))


(defn enforce-api-key
  "Middleware that enforces validation of the client via API Key, cancelling the request processing if the check fails.

   Validation is handled by first checking for the presence of the `:metabase-api-key` on the request.  If the api key
   is available then we validate it by checking it against the configured `:mb-api-key` value set in our global config.

   If the request `:metabase-api-key` matches the configured `:mb-api-key` value then the request continues, otherwise we
   reject the request and return a 403 Forbidden response."
  [handler]
  (fn [{:keys [metabase-api-key] :as request}]
    (if (= (config/config-str :mb-api-key) metabase-api-key)
      (handler request)
      ;; default response is 403
      response-forbidden)))


;;; # ------------------------------------------------------------ SECURITY HEADERS ------------------------------------------------------------

(defn- cache-prevention-headers
  "Headers that tell browsers not to cache a response."
  []
  {"Cache-Control" "max-age=0, no-cache, must-revalidate, proxy-revalidate"
   "Expires"        "Tue, 03 Jul 2001 06:00:00 GMT"
   "Last-Modified"  (u/format-date :rfc822)})

(def ^:private ^:const strict-transport-security-header
  "Tell browsers to only access this resource over HTTPS for the next year (prevent MTM attacks).
   (This only applies if the original request was HTTPS; if sent in response to an HTTP request, this is simply ignored)"
  {"Strict-Transport-Security" "max-age=31536000"})

(def ^:private ^:const content-security-policy-header
  "`Content-Security-Policy` header. See [http://content-security-policy.com](http://content-security-policy.com) for more details."
  {"Content-Security-Policy" (apply str (for [[k vs] {:default-src ["'none'"]
                                                      :script-src  ["'unsafe-inline'"
                                                                    "'unsafe-eval'"
                                                                    "'self'"
                                                                    "https://maps.google.com"
                                                                    "https://www.google-analytics.com" ; Safari requires the protocol
                                                                    "https://*.googleapis.com"
                                                                    "*.gstatic.com"
                                                                    "js.intercomcdn.com"
                                                                    "*.intercom.io"
                                                                    (when config/is-dev?
                                                                      "localhost:8080")]
                                                      :style-src   ["'unsafe-inline'"
                                                                    "'self'"
                                                                    "fonts.googleapis.com"]
                                                      :font-src    ["fonts.gstatic.com"
                                                                    "themes.googleusercontent.com"]
                                                      :img-src     ["*"
                                                                    "self data:"]
                                                      :connect-src ["'self'"
                                                                    "metabase.us10.list-manage.com"
                                                                    "*.intercom.io"
                                                                    "wss://*.intercom.io" ; allow websockets as well
                                                                    (when config/is-dev?
                                                                      "localhost:8080 ws://localhost:8080")]}]
                                          (format "%s %s; " (name k) (apply str (interpose " " vs)))))})

(defsetting ssl-certificate-public-key
  "Base-64 encoded public key for this site's SSL certificate. Specify this to enable HTTP Public Key Pinning.
   See http://mzl.la/1EnfqBf for more information.") ; TODO - it would be nice if we could make this a proper link in the UI; consider enabling markdown parsing

;(defn- public-key-pins-header []
;  (when-let [k (ssl-certificate-public-key)]
;    {"Public-Key-Pins" (format "pin-sha256=\"base64==%s\"; max-age=31536000" k)}))

(defn- api-security-headers [] ; don't need to include all the nonsense we include with index.html
  (merge (cache-prevention-headers)
         strict-transport-security-header
         ;(public-key-pins-header)
         ))

(defn- index-page-security-headers []
  (merge (cache-prevention-headers)
         strict-transport-security-header
         content-security-policy-header
         ;(public-key-pins-header)
         {"X-Frame-Options"                   "DENY"          ; Tell browsers not to render our site as an iframe (prevent clickjacking)
          "X-XSS-Protection"                  "1; mode=block" ; Tell browser to block suspected XSS attacks
          "X-Permitted-Cross-Domain-Policies" "none"          ; Prevent Flash / PDF files from including content from site.
          "X-Content-Type-Options"            "nosniff"}))    ; Tell browser not to use MIME sniffing to guess types of files -- protect against MIME type confusion attacks

(defn add-security-headers
  "Add HTTP headers to tell browsers not to cache API responses."
  [handler]
  (fn [request]
    (let [response (handler request)]
      (update response :headers merge (cond
                                        (api-call? request) (api-security-headers)
                                        (index? request)    (index-page-security-headers))))))


;;; # ------------------------------------------------------------ JSON SERIALIZATION CONFIG ------------------------------------------------------------

;; Tell the JSON middleware to use a date format that includes milliseconds (why?)
(def ^:private ^:const default-date-format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
(intern 'cheshire.factory 'default-date-format default-date-format)
(intern 'cheshire.generate '*date-format* default-date-format)

;; ## Custom JSON encoders

;; Always fall back to `.toString` instead of barfing.
;; In some cases we should be able to improve upon this behavior; `.toString` may just return the Class and address, e.g. `net.sourceforge.jtds.jdbc.ClobImpl@72a8b25e`
;; The following are known few classes where `.toString` is the optimal behavior:
;; *  `org.postgresql.jdbc4.Jdbc4Array` (Postgres arrays)
;; *  `org.bson.types.ObjectId`         (Mongo BSON IDs)
;; *  `java.sql.Date`                   (SQL Dates -- .toString returns YYYY-MM-DD)
(add-encoder Object encode-str)

(defn- encode-jdbc-clob [clob, ^JsonGenerator json-generator]
  (.writeString json-generator (u/jdbc-clob->str clob)))

;; stringify JDBC clobs
(add-encoder org.h2.jdbc.JdbcClob               encode-jdbc-clob) ; H2
(add-encoder net.sourceforge.jtds.jdbc.ClobImpl encode-jdbc-clob) ; SQLServer
(add-encoder org.postgresql.util.PGobject       encode-jdbc-clob) ; Postgres

;; Encode BSON undefined like `nil`
(add-encoder org.bson.BsonUndefined encode-nil)

;; Binary arrays ("[B") -- hex-encode their first four bytes, e.g. "0xC42360D7"
(add-encoder (Class/forName "[B") (fn [byte-ar, ^JsonGenerator json-generator]
                                    (.writeString json-generator ^String (apply str "0x" (for [b (take 4 byte-ar)]
                                                                                           (format "%02X" b))))))

;;; # ------------------------------------------------------------ LOGGING ------------------------------------------------------------

(defn- log-response [{:keys [uri request-method]} {:keys [status body]} elapsed-time]
  (let [log-error #(log/error %) ; these are macros so we can't pass by value :sad:
        log-debug #(log/debug %)
        log-warn  #(log/warn  %)
        [error? color log-fn] (cond
                                (>= status 500) [true  'red   log-error]
                                (=  status 403) [true  'red   log-warn]
                                (>= status 400) [true  'red   log-debug]
                                :else           [false 'green log-debug])]
    (log-fn (str (u/format-color color "%s %s %d (%s)" (.toUpperCase (name request-method)) uri status elapsed-time)
                 ;; only print body on error so we don't pollute our environment by over-logging
                 (when (and error?
                            (or (string? body) (coll? body)))
                   (str "\n" (u/pprint-to-str body)))))))

(defn log-api-call
  "Middleware to log `:request` and/or `:response` by passing corresponding OPTIONS."
  [handler & options]
  (fn [request]
    (if-not (api-call? request)
      (handler request)
      (let [start-time (System/nanoTime)]
        (u/prog1 (handler request)
          (log-response request <> (u/format-nanoseconds (- (System/nanoTime) start-time))))))))
