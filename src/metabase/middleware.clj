(ns metabase.middleware
  "Metabase-specific middleware functions & configuration."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            (cheshire factory
                      [generate :refer [add-encoder encode-str]])
            [korma.core :as k]
            [medley.core :refer [filter-vals map-vals]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.config :as config]
            [metabase.db :refer [sel]]
            (metabase.models [interface :refer [api-serialize]]
                             [session :refer [Session]]
                             [user :refer [User]])
            [metabase.util :as u]))

;;; # ------------------------------------------------------------ UTIL FNS ------------------------------------------------------------

(defn- api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (and (>= (count uri) 4)
       (= (.substring uri 0 4) "/api")))


;;; # ------------------------------------------------------------ AUTH & SESSION MANAGEMENT ------------------------------------------------------------

(def ^:const metabase-session-cookie "metabase.SESSION_ID")
(def ^:const metabase-session-header "x-metabase-session")
(def ^:const metabase-api-key-header "x-metabase-apikey")

(def ^:const response-unauthentic {:status 401 :body "Unauthenticated"})
(def ^:const response-forbidden   {:status 403 :body "Forbidden"})


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
                *current-user*    (delay (sel :one `[User ~@(:metabase.models.interface/default-fields User) :is_active :is_staff], :id current-user-id))]
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

(defn add-security-headers
  "Add HTTP headers to tell browsers not to cache API responses."
  [handler]
  (fn [request]
    (let [response (handler request)]
      (update response :headers merge (when (api-call? request)
                                        {"Cache-Control" "max-age=0, no-cache, must-revalidate, proxy-revalidate"
                                         "Expires"       "Tue, 03 Jul 2001 06:00:00 GMT" ; rando date in the past
                                         "Last-Modified" "{now} GMT"})))))


;;; # ------------------------------------------------------------ JSON SERIALIZATION CONFIG ------------------------------------------------------------

;; Tell the JSON middleware to use a date format that includes milliseconds
(intern 'cheshire.factory 'default-date-format "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

;; ## Custom JSON encoders

;; stringify JDBC clobs
(add-encoder org.h2.jdbc.JdbcClob (fn [clob ^com.fasterxml.jackson.core.JsonGenerator json-generator]
                                    (.writeString json-generator (u/jdbc-clob->str clob))))

;; stringify Postgres binary objects (e.g. PostGIS geometries)
(add-encoder org.postgresql.util.PGobject encode-str)

;; Do the same for PG arrays
(add-encoder org.postgresql.jdbc4.Jdbc4Array encode-str)

;; Encode BSON IDs like strings
(add-encoder org.bson.types.ObjectId encode-str)

;; serialize sql dates (i.e., QueryProcessor results) like YYYY-MM-DD instead of as a full-blown timestamp
(add-encoder java.sql.Date (fn [^java.sql.Date date ^com.fasterxml.jackson.core.JsonGenerator json-generator]
                             (.writeString json-generator (.toString date))))

(defn- remove-fns-and-delays
  "Remove values that are fns or delays from map M."
  [m]
  (filter-vals #(not (or (delay? %)
                         (fn? %)))
               ;; Convert typed maps such as metabase.models.database/DatabaseInstance to plain maps because empty, which is used internally by filter-vals,
               ;; will fail otherwise
               (into {} m)))

(defn format-response
  "Middleware that recurses over Clojure object before it gets converted to JSON and makes adjustments neccessary so the formatter doesn't barf.
   e.g. functions and delays are stripped and H2 Clobs are converted to strings."
  [handler]
  (let [-format-response (fn -format-response [obj]
                           (cond
                             (map? obj)  (->> (api-serialize obj)
                                              remove-fns-and-delays
                                              (map-vals -format-response)) ; recurse over all vals in the map
                             (coll? obj) (map -format-response obj)        ; recurse over all items in the collection
                             :else       obj))]
    (fn [request]
      (-format-response (handler request)))))



;;; # ------------------------------------------------------------ LOGGING ------------------------------------------------------------

(def ^:private ^:const sensitive-fields
  "Fields that we should censor before logging."
  #{:password})

(defn- scrub-sensitive-fields
  "Replace values of fields in `sensitive-fields` with `\"**********\"` before logging."
  [request]
  (walk/prewalk (fn [form]
                  (if-not (and (vector? form)
                               (= (count form) 2)
                               (keyword? (first form))
                               (contains? sensitive-fields (first form)))
                    form
                    [(first form) "**********"]))
                request))

(defn- log-request [{:keys [uri request-method body query-string]}]
  (log/debug (u/format-color 'blue "%s %s "
                             (.toUpperCase (name request-method)) (str uri
                                                                       (when-not (empty? query-string)
                                                                         (str "?" query-string)))
                             (when (or (string? body) (coll? body))
                               (str "\n" (u/pprint-to-str (scrub-sensitive-fields body)))))))

(defn- log-response [{:keys [uri request-method]} {:keys [status body]} elapsed-time]
  (let [log-error #(log/error %) ; these are macros so we can't pass by value :sad:
        log-debug #(log/debug %)
        log-warn  #(log/warn  %)
        [error? color log-fn] (cond
                                (>= status 500) [true  'red   log-error]
                                (=  status 403) [true  'red   log-warn]
                                (>= status 400) [true  'red   log-debug]
                                :else           [false 'green log-debug])]
    (log-fn (str (u/format-color color "%s %s %d (%d ms)" (.toUpperCase (name request-method)) uri status elapsed-time)
                 ;; only print body on error so we don't pollute our environment by over-logging
                 (when (and error?
                            (or (string? body) (coll? body)))
                   (str "\n" (u/pprint-to-str body)))))))

(defn log-api-call
  "Middleware to log `:request` and/or `:response` by passing corresponding OPTIONS."
  [handler & options]
  (let [{:keys [request response]} (set options)
        log-request? request
        log-response? response]
    (fn [request]
      (if-not (api-call? request) (handler request)
              (do
                (when log-request?
                  (log-request request))
                (let [start-time (System/nanoTime)
                      response (handler request)
                      elapsed-time (-> (- (System/nanoTime) start-time)
                                       double
                                       (/ 1000000.0)
                                       math/round)]
                  (when log-response?
                    (log-response request response elapsed-time))
                  response))))))
