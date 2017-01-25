(ns metabase.middleware
  "Metabase-specific middleware functions & configuration."
  (:require [clojure.tools.logging :as log]
            (cheshire factory
                      [generate :refer [add-encoder encode-str encode-nil]])
            monger.json ; Monger provides custom JSON encoders for Cheshire if you load this namespace -- see http://clojuremongodb.info/articles/integration.html
            [metabase.api.common :refer [*current-user* *current-user-id* *is-superuser?* *current-user-permissions-set*]]
            (metabase [config :as config]
                      [db :as db])
            (metabase.models [interface :as models]
                             [session :refer [Session]]
                             [setting :refer [defsetting]]
                             [user :refer [User], :as user])
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

(def ^:private ^:const ^String metabase-session-cookie "metabase.SESSION_ID")
(def ^:private ^:const ^String metabase-session-header "x-metabase-session")
(def ^:private ^:const ^String metabase-api-key-header "x-metabase-apikey")

(def ^:const response-unauthentic "Generic `401 (Unauthenticated)` Ring response map." {:status 401, :body "Unauthenticated"})
(def ^:const response-forbidden   "Generic `403 (Forbidden)` Ring response map."       {:status 403, :body "Forbidden"})


(defn wrap-session-id
  "Middleware that sets the `:metabase-session-id` keyword on the request if a session id can be found.

   We first check the request :cookies for `metabase.SESSION_ID`, then if no cookie is found we look in the
   http headers for `X-METABASE-SESSION`.  If neither is found then then no keyword is bound to the request."
  [handler]
  (comp handler (fn [{:keys [cookies headers] :as request}]
                  (if-let [session-id (or (get-in cookies [metabase-session-cookie :value])
                                          (headers metabase-session-header))]
                    (assoc request :metabase-session-id session-id)
                    request))))


(defn- add-current-user-id [{:keys [metabase-session-id] :as request}]
  (or (when (and metabase-session-id ((resolve 'metabase.core/initialized?)))
        (when-let [session (db/select-one [Session :created_at :user_id (db/qualify User :is_superuser)]
                             (db/join [Session :user_id] [User :id])
                             (db/qualify User :is_active) true
                             (db/qualify Session :id) metabase-session-id)]
          (let [session-age-ms (- (System/currentTimeMillis) (or (when-let [^java.util.Date created-at (:created_at session)]
                                                                   (.getTime created-at))
                                                                 0))]
            ;; If the session exists and is not expired (max-session-age > session-age) then validation is good
            (when (and session (> (config/config-int :max-session-age) (quot session-age-ms 60000)))
              (assoc request
                :metabase-user-id (:user_id session)
                :is-superuser?    (:is_superuser session))))))
      request))

(defn wrap-current-user-id
  "Add `:metabase-user-id` to the request if a valid session token was passed."
  [handler]
  (comp handler add-current-user-id))


(defn enforce-authentication
  "Middleware that returns a 401 response if REQUEST has no associated `:metabase-user-id`."
  [handler]
  (fn [{:keys [metabase-user-id] :as request}]
    (if metabase-user-id
      (handler request)
      response-unauthentic)))

(def ^:private current-user-fields
  (vec (concat [User :is_active :google_auth] (models/default-fields User))))

(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*`, `*current-user-id*`, `*is-superuser?*`, and `*current-user-permissions-set*`.

   *  `*current-user-id*`             int ID or nil of user associated with request
   *  `*current-user*`                delay that returns current user (or nil) from DB
   *  `*is-superuser?*`               Boolean stating whether current user is a superuser.
   *  `current-user-permissions-set*` delay that returns the set of permissions granted to the current user from DB"
  [handler]
  (fn [request]
    (if-let [current-user-id (:metabase-user-id request)]
      (binding [*current-user-id*              current-user-id
                *is-superuser?*                (:is-superuser? request)
                *current-user*                 (delay (db/select-one current-user-fields, :id current-user-id))
                *current-user-permissions-set* (delay (user/permissions-set current-user-id))]
        (handler request))
      (handler request))))


(defn wrap-api-key
  "Middleware that sets the `:metabase-api-key` keyword on the request if a valid API Key can be found.
   We check the request headers for `X-METABASE-APIKEY` and if it's not found then then no keyword is bound to the request."
  [handler]
  (comp handler (fn [{:keys [headers] :as request}]
                  (if-let [api-key (headers metabase-api-key-header)]
                    (assoc request :metabase-api-key api-key)
                    request))))


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
                                                                    "https://apis.google.com"
                                                                    "https://www.google-analytics.com" ; Safari requires the protocol
                                                                    "https://*.googleapis.com"
                                                                    "*.gstatic.com"
                                                                    "js.intercomcdn.com"
                                                                    "*.intercom.io"
                                                                    (when config/is-dev?
                                                                      "localhost:8080")]
                                                      :frame-src   ["https://accounts.google.com"] ; TODO - double check that we actually need this for Google Auth
                                                      :style-src   ["'unsafe-inline'"
                                                                    "'self'"
                                                                    "fonts.googleapis.com"]
                                                      :font-src    ["'self'"
                                                                    "fonts.gstatic.com"
                                                                    "themes.googleusercontent.com"
                                                                    (when config/is-dev?
                                                                      "localhost:8080")]
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

#_(defn- public-key-pins-header []
  (when-let [k (ssl-certificate-public-key)]
    {"Public-Key-Pins" (format "pin-sha256=\"base64==%s\"; max-age=31536000" k)}))

(defn- api-security-headers [] ; don't need to include all the nonsense we include with index.html
  (merge (cache-prevention-headers)
         strict-transport-security-header
         #_(public-key-pins-header)))

(defn- index-page-security-headers []
  (merge (cache-prevention-headers)
         strict-transport-security-header
         content-security-policy-header
         #_(public-key-pins-header)
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

(defn- log-response [{:keys [uri request-method]} {:keys [status body]} elapsed-time db-call-count]
  (let [log-error #(log/error %) ; these are macros so we can't pass by value :sad:
        log-debug #(log/debug %)
        log-warn  #(log/warn  %)
        [error? color log-fn] (cond
                                (>= status 500) [true  'red   log-error]
                                (=  status 403) [true  'red   log-warn]
                                (>= status 400) [true  'red   log-debug]
                                :else           [false 'green log-debug])]
    (log-fn (str (u/format-color color "%s %s %d (%s) (%d DB calls)" (.toUpperCase (name request-method)) uri status elapsed-time db-call-count)
                 ;; only print body on error so we don't pollute our environment by over-logging
                 (when (and error?
                            (or (string? body) (coll? body)))
                   (str "\n" (u/pprint-to-str body)))))))

(defn log-api-call
  "Middleware to log `:request` and/or `:response` by passing corresponding OPTIONS."
  [handler & options]
  (fn [{:keys [uri], :as request}]
    (if (or (not (api-call? request))
            (= uri "/api/health")     ; don't log calls to /health or /util/logs because they clutter up
            (= uri "/api/util/logs")) ; the logs (especially the window in admin) with useless lines
      (handler request)
      (let [start-time (System/nanoTime)]
        (db/with-call-counting [call-count]
          (u/prog1 (handler request)
            (log-response request <> (u/format-nanoseconds (- (System/nanoTime) start-time)) (call-count))))))))
