(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [cheshire.core :as json]
            [clojure.core.async :as async]
            [clojure.core.async.impl.protocols :as async-proto]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :as compojure]
            [honeysql.types :as htypes]
            [medley.core :as m]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.common.internal :refer :all]
            [metabase.models.interface :as mi]
            [metabase.util
             [i18n :as ui18n :refer [trs tru]]
             [schema :as su]]
            [ring.core.protocols :as protocols]
            [ring.util.response :as response]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.io.OutputStream))

(declare check-403 check-404)

;;; ----------------------------------------------- DYNAMIC VARIABLES ------------------------------------------------
;; These get bound by middleware for each HTTP request.

(def ^:dynamic ^Integer *current-user-id*
  "Int ID or `nil` of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Delay that returns the `User` (or nil) associated with the current API call.
   ex. `@*current-user*`"
  (atom nil)) ; default binding is just something that will return nil when dereferenced

(def ^:dynamic ^Boolean *is-superuser?*
  "Is the current user a superuser?"
  false)

(def ^:dynamic *current-user-permissions-set*
  "Delay to the set of permissions granted to the current user."
  (atom #{}))


;;; ---------------------------------------- Precondition checking helper fns ----------------------------------------

(defn check
  "Assertion mechanism for use inside API functions.
  Checks that TEST is true, or throws an `ExceptionInfo` with STATUS-CODE and MESSAGE.

  MESSAGE can be either a plain string error message, or a map including the key `:message` and any additional
  details, such as an `:error_code`.

  This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is
  generated.

  `check` can be called with the form

      (check test code message)

  or with the form

      (check test [code message])

  You can also include multiple tests in a single call:

    (check test1 code1 message1
           test2 code2 message2)"
  {:style/indent 1}
  ([tst code-or-code-message-pair & rest-args]
   (let [[[code message] rest-args] (if (vector? code-or-code-message-pair)
                                      [code-or-code-message-pair rest-args]
                                      [[code-or-code-message-pair (first rest-args)] (rest rest-args)])]
     (when-not tst
       (throw (if (and (map? message)
                       (not (ui18n/localized-string? message)))
                (ui18n/ex-info (:message message) (assoc message :status-code code))
                (ui18n/ex-info message            {:status-code code}))))
     (if (empty? rest-args) tst
         (recur (first rest-args) (second rest-args) (drop 2 rest-args))))))

(defn check-exists?
  "Check that object with ID (or other key/values) exists in the DB, or throw a 404."
  ([entity id]
   (check-exists? entity :id id))
  ([entity k v & more]
   (check-404 (apply db/exists? entity k v more))))

(defn check-superuser
  "Check that `*current-user*` is a superuser or throw a 403. This doesn't require a DB call."
  []
  (check-403 *is-superuser?*))


;; checkp- functions: as in "check param". These functions expect that you pass a symbol so they can throw exceptions
;; w/ relevant error messages.

(defn throw-invalid-param-exception
  "Throw an `ExceptionInfo` that contains information about an invalid API params in the expected format."
  [field-name message]
  (throw (ui18n/ex-info (tru "Invalid field: {0}" field-name)
           {:status-code 400
            :errors      {(keyword field-name) message}})))

(defn checkp
  "Assertion mechanism for use inside API functions that validates individual input params.
  Checks that TEST is true, or throws an `ExceptionInfo` with FIELD-NAME and MESSAGE.

  This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is
  generated.

  `checkp` can be called with the form

      (checkp test field-name message)"
  {:style/indent 1}
  ([tst field-name message]
   (when-not tst
     (throw-invalid-param-exception (str field-name) message))))

(defn checkp-with
  "Check (F VALUE), or throw an exception with STATUS-CODE (default is 400).
   SYMB is passed in order to give the user a relevant error message about which parameter was bad.

   Returns VALUE upon success.

    (checkp-with (partial? contains? {:all :mine}) f :all)
      -> :all
    (checkp-with (partial? contains {:all :mine}) f :bad)
      -> ExceptionInfo: Invalid value ':bad' for 'f': test failed: (partial? contains?) {:all :mine}

   You may optionally pass a MESSAGE to append to the exception upon failure;
   this will be used in place of the \"test failed: ...\" message.

   MESSAGE may be either a string or a pair like `[status-code message]`."
  ([f symb value]
   (checkp-with f symb value (str "test failed: " f)))
  ([f symb value message]
   {:pre [(symbol? symb)]}
   (checkp (f value) symb (tru "Invalid value ''{0}'' for ''{1}'': {2}" (str value) symb message))
   value))

(defn checkp-contains?
  "Check that the VALUE of parameter SYMB is in VALID-VALUES, or throw a 400.
   Returns VALUE upon success.

    (checkp-contains? #{:fav :all :mine} 'f f)
    -> (check (contains? #{:fav :all :mine} f)
         [400 (str \"Invalid value '\" f \"' for 'f': must be one of: #{:fav :all :mine}\")])"
  [valid-values-set symb value]
  {:pre [(set? valid-values-set) (symbol? symb)]}
  (checkp-with (partial contains? valid-values-set) symb value
               (tru "must be one of: {0}" valid-values-set)))


;;; ---------------------------------------------- api-let, api->, etc. ----------------------------------------------

;; The following all work exactly like the corresponding Clojure versions
;; but take an additional arg at the beginning called RESPONSE-PAIR.
;; RESPONSE-PAIR is of the form `[status-code message]`.
;; ex.
;;
;;     (let [binding x] ...) -> (api-let [500 \"Not OK!\"] [binding x] ...)

(defmacro api-let
  "If TEST is true, bind it to BINDING and evaluate BODY.

    (api-let [404 \"Not found.\"] [user @*current-user*]
      (:id user))"
  {:arglists '([[status-code message] [binding test] & body]), :style/indent 2}
  [response-pair [binding test & more] & body]
  (if (seq more)
    `(api-let ~response-pair ~[binding test]
       (api-let ~response-pair ~more
         ~@body))
    `(let [test# ~test] ; bind ~test so doesn't get evaluated more than once (e.g. in case it's an expensive funcall)
       (check test# ~response-pair)
       (let [~binding test#
             ~@more]
         ~@body))))


;;; ### GENERIC RESPONSE HELPERS
;; These are basically the same as the `api-` versions but with RESPONSE-PAIR already bound

;; #### GENERIC 400 RESPONSE HELPERS
(def ^:private generic-400
  [400 (tru "Invalid Request.")])

(defn check-400
  "Throw a `400` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-400))

(defmacro let-400
  "Bind a form as with `let`; throw a 400 if it is `nil` or `false`."
  {:style/indent 1}
  [& body]
  `(api-let ~generic-400 ~@body))

;; #### GENERIC 404 RESPONSE HELPERS
(def ^:private generic-404
  [404 (tru "Not found.")])

(defn check-404
  "Throw a `404` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-404))

(defmacro let-404
  "Bind a form as with `let`; throw a 404 if it is `nil` or `false`."
  {:style/indent 1}
  [& body]
  `(api-let ~generic-404 ~@body))

;; #### GENERIC 403 RESPONSE HELPERS
;; If you can't be bothered to write a custom error message
(defn- generic-403 []
  [403 (tru "You don''t have permissions to do that.")])

(defn check-403
  "Throw a `403` (no permissions) if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg (generic-403)))
(defmacro let-403
  "Bind a form as with `let`; throw a 403 if it is `nil` or `false`."
  {:style/indent 1}
  [& body]
  `(api-let (generic-403) ~@body))

(defn throw-403
  "Throw a generic 403 (no permissions) error response."
  []
  (throw (ui18n/ex-info (tru "You don''t have permissions to do that.") {:status-code 403})))

;; #### GENERIC 500 RESPONSE HELPERS
;; For when you don't feel like writing something useful
(def ^:private generic-500
  [500 (tru "Internal server error.")])

(defn check-500
  "Throw a `500` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-500))

(defmacro let-500
  "Bind a form as with `let`; throw a 500 if it is `nil` or `false`."
  {:style/indent 1}
  [& body]
  `(api-let   ~generic-500 ~@body))

(def ^:const generic-204-no-content
  "A 'No Content' response for `DELETE` endpoints to return."
  {:status 204, :body nil})


;;; --------------------------------------- DEFENDPOINT AND RELATED FUNCTIONS ----------------------------------------

;; TODO - several of the things `defendpoint` does could and should just be done by custom Ring middleware instead
;; e.g. `auto-parse`
(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  calls `auto-parse` to automatically parse certain args. e.g. `id` is converted from `String` to `Integer` via
      `Integer/parseInt`
   -  converts ROUTE from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`
   -  sequentially applies specified annotation functions on args to validate them.
   -  executes BODY inside a `try-catch` block that handles exceptions; if exception is an instance of `ExceptionInfo`
      and includes a `:status-code`, that code will be returned
   -  automatically calls `wrap-response-if-needed` on the result of BODY
   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below)
      will automatically include the function in the generated `defroutes` form.
   -  Generates a super-sophisticated Markdown-formatted docstring"
  {:arglists '([method route docstr? args schemas-map? & body])}
  [method route & more]
  {:pre [(or (string? route)
             (vector? route))]}
  (let [fn-name                (route-fn-name method route)
        route                  (typify-route route)
        [docstr [args & more]] (u/optional string? more)
        [arg->schema body]     (u/optional (every-pred map? #(every? symbol? (keys %))) more)
        validate-param-calls   (validate-params arg->schema)]
    (when-not docstr
      (log/warn (trs "Warning: endpoint {0}/{1} does not have a docstring." (ns-name *ns*) fn-name)))
    `(def ~(vary-meta fn-name assoc
                      ;; eval the vals in arg->schema to make sure the actual schemas are resolved so we can document
                      ;; their API error messages
                      :doc (route-dox method route docstr args (m/map-vals eval arg->schema) body)
                      :is-endpoint? true)
       (~method ~route ~args
        (auto-parse ~args
          ~@validate-param-calls
          (wrap-response-if-needed (do ~@body)))))))

(defn- namespace->api-route-fns
  "Return a sequence of all API endpoint functions defined by `defendpoint` in a namespace."
  [nmspace]
  (for [[symb varr] (ns-publics nmspace)
        :when       (:is-endpoint? (meta varr))]
    symb))

(defn- api-routes-docstring [nmspace route-fns middleware]
  (str
   (format "Ring routes for %s:\n%s"
           (-> (ns-name nmspace)
               (str/replace #"^metabase\." "")
               (str/replace #"\." "/"))
           (u/pprint-to-str route-fns))
   (when (seq middleware)
     (str "\nMiddleware applied to all endpoints in this namespace:\n"
          (u/pprint-to-str middleware)))))

(defmacro define-routes
  "Create a `(defroutes routes ...)` form that automatically includes all functions created with `defendpoint` in the
  current namespace. Optionally specify middleware that will apply to all of the endpoints in the current namespace.

     (api/define-routes api/+check-superuser) ; all API endpoints in this namespace will require superuser access"
  {:style/indent 0}
  [& middleware]
  (let [api-route-fns (namespace->api-route-fns *ns*)
        routes        `(compojure/routes ~@api-route-fns)]
    `(def ~(vary-meta 'routes assoc :doc (api-routes-docstring *ns* api-route-fns middleware))
       ~(if (seq middleware)
          `(-> ~routes ~@middleware)
          routes))))

(defn +check-superuser
  "Wrap a Ring handler to make sure the current user is a superuser before handling any requests.

     (api/+check-superuser routes)"
  [handler]
  (fn [request]
    (check-superuser)
    (handler request)))


;;; ---------------------------------------- PERMISSIONS CHECKING HELPER FNS -----------------------------------------

(defn read-check
  "Check whether we can read an existing OBJ, or ENTITY with ID.
   If the object doesn't exist, throw a 404; if we don't have proper permissions, throw a 403.
   This will fetch the object if it was not already fetched, and returns OBJ if the check is successful."
  {:style/indent 2}
  ([obj]
   (check-404 obj)
   (check-403 (mi/can-read? obj))
   obj)
  ([entity id]
   (read-check (entity id)))
  ([entity id & other-conditions]
   (read-check (apply db/select-one entity :id id other-conditions))))

(defn write-check
  "Check whether we can write an existing OBJ, or ENTITY with ID.
   If the object doesn't exist, throw a 404; if we don't have proper permissions, throw a 403.
   This will fetch the object if it was not already fetched, and returns OBJ if the check is successful."
  {:style/indent 2}
  ([obj]
   (check-404 obj)
   (check-403 (mi/can-write? obj))
   obj)
  ([entity id]
   (write-check (entity id)))
  ([entity id & other-conditions]
   (write-check (apply db/select-one entity :id id other-conditions))))

;;; --------------------------------------------------- STREAMING ----------------------------------------------------

(def ^:private ^:const streaming-response-keep-alive-interval-ms
  "Interval between sending newline characters to keep Heroku from terminating requests like queries that take a long
  time to complete."
  (* 1 1000))

;; Handle ring response maps that contain a core.async chan in the :body key:
;;
;; {:status 200
;;  :body (async/chan)}
;;
;; and send strings (presumibly \n) as heartbeats to the client until the real results (a seq) is received, then
;; stream that to the client
(extend-protocol protocols/StreamableResponseBody
  clojure.core.async.impl.channels.ManyToManyChannel
  (write-body-to-stream [output-queue _ ^OutputStream output-stream]
    (log/debug (u/format-color 'green (trs "starting streaming request")))
    (with-open [out (io/writer output-stream)]
      (loop [chunk (async/<!! output-queue)]
        (cond
          (char? chunk)
          (do
            (try
              (.write out (str chunk))
              (.flush out)
              (catch org.eclipse.jetty.io.EofException e
                (log/info e (u/format-color 'yellow (trs "connection closed, canceling request")))
                (async/close! output-queue)
                (throw e)))
            (recur (async/<!! output-queue)))

          ;; An error has occurred, let the user know
          (instance? Exception chunk)
          (json/generate-stream {:error (.getMessage ^Exception chunk)} out)

          ;; We've recevied the response, write it to the output stream and we're done
          (seq chunk)
          (json/generate-stream chunk out)

          ;;chunk is nil meaning the output channel has been closed
          :else
          out)))))

(def ^:private InvokeWithKeepAliveSchema
  {;; Channel that contains any number of newlines followed by the results of the invoked query thunk
   :output-channel  (s/protocol async-proto/Channel)
   ;; This channel will have an exception if that error condition is hit before the first heartbeat time, if a
   ;; heartbeat has been sent, this channel is closed and its no longer useful
   :error-channel   (s/protocol async-proto/Channel)
   ;; Future that is invoking the query thunk. This is mainly useful for testing metadata to see if the future has been
   ;; cancelled or was completed successfully
   :response-future java.util.concurrent.Future})

(s/defn ^:private invoke-thunk-with-keepalive :- InvokeWithKeepAliveSchema
  "This function does the heavy lifting of invoking `query-thunk` on a background thread and returning it's results
  along with a heartbeat while waiting for the results. This function returns a map that includes the relevate
  execution information, see `InvokeWithKeepAliveSchema` for more information"
  [query-thunk]
  (let [response-chan (async/chan 1)
        output-chan   (async/chan 1)
        error-chan    (async/chan 1)
        response-fut  (future
                        (try
                          (async/>!! response-chan (query-thunk))
                          (catch Exception e
                            (async/>!! error-chan e)
                            (async/>!! response-chan e))
                          (finally
                            (async/close! error-chan))))]
    (async/go-loop []
      (let [[response-or-timeout c] (async/alts! [response-chan (async/timeout streaming-response-keep-alive-interval-ms)])]
        (if response-or-timeout
          ;; We have a response since it's non-nil, write the results and close, we're done
          (do
            ;; If output-chan is closed, it's already too late, nothing else we need to do
            (async/>! output-chan response-or-timeout)
            (async/close! output-chan))
          (do
            ;; We don't have a result yet, but enough time has passed, let's assume it's not an error
            (async/close! error-chan)
            ;; a newline padding character as it's harmless and will allow us to check if the client is connected. If
            ;; sending this character fails because the connection is closed, the chan will then close.  Newlines are
            ;; no-ops when reading JSON which this depends upon.
            (log/debug (u/format-color 'blue (trs "Response not ready, writing one byte & sleeping...")))
            (if (async/>! output-chan \newline)
              ;; Success put the channel, wait and see if we get the response next time
              (recur)
              ;; The channel is closed, client has given up, we should give up too
              (future-cancel response-fut))))))
    {:output-channel  output-chan
     :error-channel   error-chan
     :response-future response-fut}))

(defn cancellable-json-response
  "Invokes `cancellable-thunk` in a future. If there's an immediate exception, throw it. If there's not an immediate
  exception, return a ring response with a channel. The channel will potentially include newline characters before the
  full response is delivered as a keepalive to the client. Eventually the results of `cancellable-thunk` will be put
  to the channel"
  [cancellable-thunk]
  (let [{:keys [output-channel error-channel]} (invoke-thunk-with-keepalive cancellable-thunk)]
    ;; If there's an immediate exception, it will be in `error-chan`, if not, `error-chan` will close and we'll assume
    ;; the response is a success
    (if-let [ex (async/<!! error-channel)]
      (throw ex)
      (assoc (response/response output-channel)
        :content-type "applicaton/json"))))


;;; ------------------------------------------------ OTHER HELPER FNS ------------------------------------------------

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (check (public-settings/enable-public-sharing)
         [400 (tru "Public sharing is not enabled.")]))

(defn check-embedding-enabled
  "Is embedding of Cards or Objects (secured access via `/api/embed` endpoints with a signed JWT enabled?"
  []
  (check (public-settings/enable-embedding)
    [400 (tru "Embedding is not enabled.")]))

(defn check-not-archived
  "Check that the OBJECT exists and is not `:archived`, or throw a `404`. Returns OBJECT as-is if check passes."
  [object]
  (u/prog1 object
    (check-404 object)
    (check (not (:archived object))
      [404 {:message (tru "The object has been archived."), :error_code "archived"}])))

(s/defn column-will-change? :- s/Bool
  "Helper for PATCH-style operations to see if a column is set to change when `object-updates` (i.e., the input to the
  endpoint) is applied.

    ;; assuming we have a Collection 10, that is not currently archived...
    (api/column-will-change? :archived (Collection 10) {:archived true}) ; -> true, because value will change

    (api/column-will-change? :archived (Collection 10) {:archived false}) ; -> false, because value did not change

    (api/column-will-change? :archived (Collection 10) {}) ; -> false; value not specified in updates (request body)"
  [k :- s/Keyword, object-before-updates :- su/Map, object-updates :- su/Map]
  (boolean
   (and (contains? object-updates k)
        (not= (get object-before-updates k)
              (get object-updates k)))))

;;; ------------------------------------------ COLLECTION POSITION HELPER FNS ----------------------------------------

(s/defn reconcile-position-for-collection!
  "Compare `old-position` and `new-position` to determine what needs to be updated based on the position change. Used
  for fixing card/dashboard/pulse changes that impact other instances in the collection"
  [collection-id :- (s/maybe su/IntGreaterThanZero)
   old-position :- (s/maybe su/IntGreaterThanZero)
   new-position :- (s/maybe su/IntGreaterThanZero)]
  (let [update-fn! (fn [plus-or-minus position-update-clause]
                     (doseq [model '[Card Dashboard Pulse]]
                       (db/update-where! model {:collection_id       collection-id
                                                :collection_position position-update-clause}
                         :collection_position (htypes/call plus-or-minus :collection_position 1))))]
    (when (not= new-position old-position)
      (cond
        (and (nil? new-position)
             old-position)
        (update-fn! :-  [:> old-position])

        (and new-position (nil? old-position))
        (update-fn! :+ [:>= new-position])

        (> new-position old-position)
        (update-fn! :- [:between old-position new-position])

        (< new-position old-position)
        (update-fn! :+ [:between new-position old-position])))))

(def ^:private ModelWithPosition
  "Intended to cover Cards/Dashboards/Pulses, it only asserts collection id and position, allowing extra keys"
  {:collection_id       (s/maybe su/IntGreaterThanZero)
   :collection_position (s/maybe su/IntGreaterThanZero)
   s/Any                s/Any})

(def ^:private ModelWithOptionalPosition
  "Intended to cover Cards/Dashboards/Pulses updates. Collection id and position are optional, if they are not
  present, they didn't change. If they are present, they might have changed and we need to compare."
  {(s/optional-key :collection_id)       (s/maybe su/IntGreaterThanZero)
   (s/optional-key :collection_position) (s/maybe su/IntGreaterThanZero)
   s/Any                                 s/Any})

(s/defn maybe-reconcile-collection-position!
  "Generic function for working on cards/dashboards/pulses. Checks the before and after changes to see if there is any
  impact to the collection position of that model instance. If so, executes updates to fix the collection position
  that goes with the change. The 2-arg version of this function is used for a new card/dashboard/pulse (i.e. not
  updating an existing instance, but creating a new one)."
  ([new-model-data :- ModelWithPosition]
   (maybe-reconcile-collection-position! nil new-model-data))
  ([{old-collection-id :collection_id, old-position :collection_position, :as before-update} :- (s/maybe ModelWithPosition)
    {new-collection-id :collection_id, new-position :collection_position, :as model-updates} :- ModelWithOptionalPosition]
   (let [updated-collection? (and (contains? model-updates :collection_id)
                                  (not= old-collection-id new-collection-id))
         updated-position?   (and (contains? model-updates :collection_position)
                                  (not= old-position new-position))]
     (cond
       ;; If the collection hasn't changed, but we have a new collection position, we might need to reconcile
       (and (not updated-collection?) updated-position?)
       (reconcile-position-for-collection! old-collection-id old-position new-position)

       ;; If we have a new collection id, but no new position, reconcile the old collection, then update the new
       ;; collection with the existing position
       (and updated-collection? (not updated-position?))
       (do
         (reconcile-position-for-collection! old-collection-id old-position nil)
         (reconcile-position-for-collection! new-collection-id nil old-position))

       ;; We have a new collection id AND and new collection position
       ;; Update the old collection using the old position
       ;; Update the new collection using the new position
       (and updated-collection? updated-position?)
       (do
         (reconcile-position-for-collection! old-collection-id old-position nil)
         (reconcile-position-for-collection! new-collection-id nil new-position))))))
