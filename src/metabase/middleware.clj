(ns metabase.middleware
  "Metabase-specific middleware functions & configuration."
  (:require [cheshire.generate :refer [add-encoder encode-nil encode-str]]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [db :as mdb]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.common :refer [*current-user* *current-user-id* *current-user-permissions-set* *is-superuser?*]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models
             [session :refer [Session]]
             [setting :refer [defsetting]]
             [user :as user :refer [User]]]
            [metabase.util
             [date :as du]
             [i18n :as ui18n :refer [tru]]]
            [toucan.db :as db])
  (:import com.fasterxml.jackson.core.JsonGenerator
           java.sql.SQLException))

;;; ---------------------------------------------------- UTIL FNS ----------------------------------------------------

(defn- api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (str/starts-with? uri "/api"))

(defn- public?
  "Is this ring request one that will serve `public.html`?"
  [{:keys [uri]}]
  (re-matches #"^/public/.*$" uri))

(defn- embed?
  "Is this ring request one that will serve `public.html`?"
  [{:keys [uri]}]
  (re-matches #"^/embed/.*$" uri))

(defn- cacheable?
  "Can the ring request be permanently cached?"
  [{:keys [uri query-string]}]
  ;; match requests that are js/css and have a cache-busting query string
  (and query-string (re-matches #"^/app/dist/.*\.(js|css)$" uri)))

;;; ------------------------------------------- AUTH & SESSION MANAGEMENT --------------------------------------------

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

(defn- session-with-id
  "Fetch a session with SESSION-ID, and include the User ID and superuser status associated with it."
  [session-id]
  (db/select-one [Session :created_at :user_id (db/qualify User :is_superuser)]
    (mdb/join [Session :user_id] [User :id])
    (db/qualify User :is_active) true
    (db/qualify Session :id) session-id))

(defn- session-age-ms [session]
  (- (System/currentTimeMillis) (or (when-let [^java.util.Date created-at (:created_at session)]
                                      (.getTime created-at))
                                    0)))

(defn- session-age-minutes [session]
  (quot (session-age-ms session) 60000))

(defn- session-expired? [session]
  (> (session-age-minutes session)
     (config/config-int :max-session-age)))

(defn- current-user-info-for-session
  "Return User ID and superuser status for Session with SESSION-ID if it is valid and not expired."
  [session-id]
  (when (and session-id (init-status/complete?))
    (when-let [session (session-with-id session-id)]
      (when-not (session-expired? session)
        {:metabase-user-id (:user_id session)
         :is-superuser?    (:is_superuser session)}))))

(defn- add-current-user-info [{:keys [metabase-session-id], :as request}]
  (merge request (current-user-info-for-session metabase-session-id)))

(defn wrap-current-user-id
  "Add `:metabase-user-id` to the request if a valid session token was passed."
  [handler]
  (comp handler add-current-user-info))


(defn enforce-authentication
  "Middleware that returns a 401 response if REQUEST has no associated `:metabase-user-id`."
  [handler]
  (fn [{:keys [metabase-user-id] :as request}]
    (if metabase-user-id
      (handler request)
      response-unauthentic)))

(def ^:private current-user-fields
  (vec (cons User user/admin-or-self-visible-columns)))

(defn- find-user [user-id]
  (db/select-one current-user-fields, :id user-id))

(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*`, `*current-user-id*`, `*is-superuser?*`, and
  `*current-user-permissions-set*`.

  *  `*current-user-id*`             int ID or nil of user associated with request
  *  `*current-user*`                delay that returns current user (or nil) from DB
  *  `*is-superuser?*`               Boolean stating whether current user is a superuser.
  *  `current-user-permissions-set*` delay that returns the set of permissions granted to the current user from DB"
  [handler]
  (fn [request]
    (if-let [current-user-id (:metabase-user-id request)]
      (binding [*current-user-id*              current-user-id
                *is-superuser?*                (:is-superuser? request)
                *current-user*                 (delay (find-user current-user-id))
                *current-user-permissions-set* (delay (user/permissions-set current-user-id))]
        (handler request))
      (handler request))))


(defn wrap-api-key
  "Middleware that sets the `:metabase-api-key` keyword on the request if a valid API Key can be found. We check the
  request headers for `X-METABASE-APIKEY` and if it's not found then then no keyword is bound to the request."
  [handler]
  (comp handler (fn [{:keys [headers] :as request}]
                  (if-let [api-key (headers metabase-api-key-header)]
                    (assoc request :metabase-api-key api-key)
                    request))))


(defn enforce-api-key
  "Middleware that enforces validation of the client via API Key, cancelling the request processing if the check fails.

  Validation is handled by first checking for the presence of the `:metabase-api-key` on the request.  If the api key
  is available then we validate it by checking it against the configured `:mb-api-key` value set in our global config.

  If the request `:metabase-api-key` matches the configured `:mb-api-key` value then the request continues, otherwise
  we reject the request and return a 403 Forbidden response."
  [handler]
  (fn [{:keys [metabase-api-key] :as request}]
    (if (= (config/config-str :mb-api-key) metabase-api-key)
      (handler request)
      ;; default response is 403
      response-forbidden)))


;;; ------------------------------------------------ security HEADERS ------------------------------------------------

(defn- cache-prevention-headers
  "Headers that tell browsers not to cache a response."
  []
  {"Cache-Control" "max-age=0, no-cache, must-revalidate, proxy-revalidate"
   "Expires"        "Tue, 03 Jul 2001 06:00:00 GMT"
   "Last-Modified"  (du/format-date :rfc822)})

 (defn- cache-far-future-headers
   "Headers that tell browsers to cache a static resource for a long time."
   []
   {"Cache-Control" "public, max-age=31536000"})

(def ^:private ^:const strict-transport-security-header
  "Tell browsers to only access this resource over HTTPS for the next year (prevent MTM attacks). (This only applies if
  the original request was HTTPS; if sent in response to an HTTP request, this is simply ignored)"
  {"Strict-Transport-Security" "max-age=31536000"})

(def ^:private ^:const content-security-policy-header
  "`Content-Security-Policy` header. See https://content-security-policy.com for more details."
  {"Content-Security-Policy"
   (apply str (for [[k vs] {:default-src ["'none'"]
                            :script-src  ["'unsafe-inline'"
                                          "'unsafe-eval'"
                                          "'self'"
                                          "https://maps.google.com"
                                          "https://apis.google.com"
                                          "https://www.google-analytics.com" ; Safari requires the protocol
                                          "https://*.googleapis.com"
                                          "*.gstatic.com"
                                          (when config/is-dev?
                                            "localhost:8080")]
                            :child-src   ["'self'"
                                          ;; TODO - double check that we actually need this for Google Auth
                                          "https://accounts.google.com"]
                            :style-src   ["'unsafe-inline'"
                                          "'self'"
                                          "fonts.googleapis.com"]
                            :font-src    ["'self'"
                                          "fonts.gstatic.com"
                                          "themes.googleusercontent.com"
                                          (when config/is-dev?
                                            "localhost:8080")]
                            :img-src     ["*"
                                          "'self' data:"]
                            :connect-src ["'self'"
                                          "metabase.us10.list-manage.com"
                                          (when config/is-dev?
                                            "localhost:8080 ws://localhost:8080")]}]
                (format "%s %s; " (name k) (apply str (interpose " " vs)))))})

(defsetting ssl-certificate-public-key
  (str (tru "Base-64 encoded public key for this site's SSL certificate.")
       (tru "Specify this to enable HTTP Public Key Pinning.")
       (tru "See {0} for more information." "http://mzl.la/1EnfqBf")))
;; TODO - it would be nice if we could make this a proper link in the UI; consider enabling markdown parsing

#_(defn- public-key-pins-header []
  (when-let [k (ssl-certificate-public-key)]
    {"Public-Key-Pins" (format "pin-sha256=\"base64==%s\"; max-age=31536000" k)}))

(defn- security-headers [& {:keys [allow-iframes? allow-cache?]
                            :or   {allow-iframes? false, allow-cache? false}}]
  (merge
   (if allow-cache?
     (cache-far-future-headers)
     (cache-prevention-headers))
   strict-transport-security-header
   content-security-policy-header
   #_(public-key-pins-header)
   (when-not allow-iframes?
     ;; Tell browsers not to render our site as an iframe (prevent clickjacking)
     {"X-Frame-Options"                 "DENY"})
   { ;; Tell browser to block suspected XSS attacks
    "X-XSS-Protection"                  "1; mode=block"
    ;; Prevent Flash / PDF files from including content from site.
    "X-Permitted-Cross-Domain-Policies" "none"
    ;; Tell browser not to use MIME sniffing to guess types of files -- protect against MIME type confusion attacks
    "X-Content-Type-Options"            "nosniff"}))

(defn add-security-headers
  "Add HTTP security and cache-busting headers."
  [handler]
  (fn [request]
    (let [response (handler request)]
      ;; add security headers to all responses, but allow iframes on public & embed responses
      (update response :headers merge (security-headers :allow-iframes? ((some-fn public? embed?) request)
                                                        :allow-cache?   (cacheable? request))))))

(defn add-content-type
  "Add an appropriate Content-Type header to response if it doesn't already have one. Most responses should already
  have one, so this is a fallback for ones that for one reason or another do not."
  [handler]
  (fn [request]
    (let [response (handler request)]
      (update-in
       response
       [:headers "Content-Type"]
       (fn [content-type]
         (or content-type
             (when (api-call? request)
               (if (string? (:body response))
                 "text/plain"
                 "application/json; charset=utf-8"))))))))


;;; ------------------------------------------------ SETTING SITE-URL ------------------------------------------------

;; It's important for us to know what the site URL is for things like returning links, etc. this is stored in the
;; `site-url` Setting; we can set it automatically by looking at the `Origin` or `Host` headers sent with a request.
;; Effectively the very first API request that gets sent to us (usually some sort of setup request) ends up setting
;; the (initial) value of `site-url`

(defn maybe-set-site-url
  "Middleware to set the `site-url` Setting if it's unset the first time a request is made."
  [handler]
  (fn [{{:strs [origin host] :as headers} :headers, :as request}]
    (when (mdb/db-is-setup?)
      (when-not (public-settings/site-url)
        (when-let [site-url (or origin host)]
          (log/info "Setting Metabase site URL to" site-url)
          (public-settings/site-url site-url))))
    (handler request)))


;;; ------------------------------------------- JSON SERIALIZATION CONFIG --------------------------------------------

;; Tell the JSON middleware to use a date format that includes milliseconds (why?)
(def ^:private ^:const default-date-format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
(intern 'cheshire.factory 'default-date-format default-date-format)
(intern 'cheshire.generate '*date-format* default-date-format)

;; ## Custom JSON encoders

;; Always fall back to `.toString` instead of barfing. In some cases we should be able to improve upon this behavior;
;; `.toString` may just return the Class and address, e.g. `some.Class@72a8b25e`
;; The following are known few classes where `.toString` is the optimal behavior:
;; *  `org.postgresql.jdbc4.Jdbc4Array` (Postgres arrays)
;; *  `org.bson.types.ObjectId`         (Mongo BSON IDs)
;; *  `java.sql.Date`                   (SQL Dates -- .toString returns YYYY-MM-DD)
(add-encoder Object encode-str)

(defn- encode-jdbc-clob [clob, ^JsonGenerator json-generator]
  (.writeString json-generator (u/jdbc-clob->str clob)))

;; stringify JDBC clobs
(add-encoder org.h2.jdbc.JdbcClob               encode-jdbc-clob) ; H2
(add-encoder org.postgresql.util.PGobject       encode-jdbc-clob) ; Postgres

;; Encode BSON undefined like `nil`
(add-encoder org.bson.BsonUndefined encode-nil)

;; Binary arrays ("[B") -- hex-encode their first four bytes, e.g. "0xC42360D7"
(add-encoder (Class/forName "[B") (fn [byte-ar, ^JsonGenerator json-generator]
                                    (.writeString json-generator ^String (apply str "0x" (for [b (take 4 byte-ar)]
                                                                                           (format "%02X" b))))))

;;; ---------------------------------------------------- LOGGING -----------------------------------------------------

(def ^:private jetty-stats-coll
  (juxt :min-threads :max-threads :busy-threads :idle-threads :queue-size))

(defn- log-response [jetty-stats-fn {:keys [uri request-method]} {:keys [status body]} elapsed-time db-call-count]
  (let [log-error #(log/error %)        ; these are macros so we can't pass by value :sad:
        log-debug #(log/debug %)
        log-warn  #(log/warn  %)
        ;; stats? here is to avoid incurring the cost of collecting the Jetty stats and concatenating the extra
        ;; strings when they're just going to be ignored. This is automatically handled by the macro , but is bypassed
        ;; once we wrap it in a function
        [error? color log-fn stats?] (cond
                                       (>= status 500) [true  'red   log-error false]
                                       (=  status 403) [true  'red   log-warn false]
                                       (>= status 400) [true  'red   log-debug false]
                                       :else           [false 'green log-debug true])]
    (log-fn (str (apply u/format-color color (str "%s %s %d (%s) (%d DB calls)."
                                                  (when stats?
                                                    " Jetty threads: %s/%s (%s busy, %s idle, %s queued)"))
                        (.toUpperCase (name request-method)) uri status elapsed-time db-call-count
                        (when stats?
                          (jetty-stats-coll (jetty-stats-fn))))
                 ;; only print body on error so we don't pollute our environment by over-logging
                 (when (and error?
                            (or (string? body) (coll? body)))
                   (str "\n" (u/pprint-to-str body)))))))

(defn log-api-call
  "Takes a handler and a `jetty-stats-fn`. Logs info about request such as status code, number of DB calls, and time
  taken to complete. `jetty-stats-fn` returns threadpool metadata that is included in the api request log"
  [handler jetty-stats-fn]
  (fn [{:keys [uri], :as request}]
    (if (or (not (api-call? request))
            (= uri "/api/health")     ; don't log calls to /health or /util/logs because they clutter up
            (= uri "/api/util/logs")) ; the logs (especially the window in admin) with useless lines
      (handler request)
      (let [start-time (System/nanoTime)]
        (db/with-call-counting [call-count]
          (u/prog1 (handler request)
            (log-response jetty-stats-fn request <> (du/format-nanoseconds (- (System/nanoTime) start-time)) (call-count))))))))


;;; ----------------------------------------------- EXCEPTION HANDLING -----------------------------------------------

(def ^:dynamic ^:private ^Boolean *automatically-catch-api-exceptions*
  "Should API exceptions automatically be caught? By default, this is `true`, but this can be disabled when we want to
  catch Exceptions and return something generic to avoid leaking information, e.g. with the `api/public` and
  `api/embed` endpoints. generic exceptions"
  true)

(defn genericize-exceptions
  "Catch any exceptions thrown in the request handler body and rethrow a generic 400 exception instead. This minimizes
  information available to bad actors when exceptions occur on public endpoints."
  [handler]
  (fn [request]
    (try (binding [*automatically-catch-api-exceptions* false]
           (handler request))
         (catch Throwable e
           (log/warn (.getMessage e))
           {:status 400, :body "An error occurred."}))))

(defn message-only-exceptions
  "Catch any exceptions thrown in the request handler body and rethrow a 400 exception that only has the message from
  the original instead (i.e., don't rethrow the original stacktrace). This reduces the information available to bad
  actors but still provides some information that will prove useful in debugging errors."
  [handler]
  (fn [request]
    (try (binding [*automatically-catch-api-exceptions* false]
           (handler request))
         (catch Throwable e
           {:status 400, :body (.getMessage e)}))))

(defn- api-exception-response
  "Convert an exception from an API endpoint into an appropriate HTTP response."
  [^Throwable e]
  (let [{:keys [status-code], :as info} (ex-data e)
        other-info                      (dissoc info :status-code :schema :type)
        message                         (.getMessage e)
        body                            (cond
                                          ;; Exceptions that include a status code *and* other info are things like
                                          ;; Field validation exceptions. Return those as is
                                          (and status-code
                                               (seq other-info))
                                          (ui18n/localized-strings->strings other-info)
                                          ;; If status code was specified but other data wasn't, it's something like a
                                          ;; 404. Return message as the (plain-text) body.
                                          status-code
                                          (str message)
                                          ;; Otherwise it's a 500. Return a body that includes exception & filtered
                                          ;; stacktrace for debugging purposes
                                          :else
                                          (let [stacktrace (u/filtered-stacktrace e)]
                                            (merge (assoc other-info
                                                     :message    message
                                                     :type       (class e)
                                                     :stacktrace stacktrace)
                                                   (when (instance? SQLException e)
                                                     {:sql-exception-chain
                                                      (str/split (with-out-str (jdbc/print-sql-exception-chain e))
                                                                 #"\s*\n\s*")}))))]
    {:status  (or status-code 500)
     :headers (security-headers)
     :body    body}))

(defn catch-api-exceptions
  "Middleware that catches API Exceptions and returns them in our normal-style format rather than the Jetty 500
  Stacktrace page, which is not so useful for our frontend."
  [handler]
  (fn [request]
    (if *automatically-catch-api-exceptions*
      (try (handler request)
           (catch Throwable e
             (api-exception-response e)))
      (handler request))))
