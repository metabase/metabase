(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [clojure.string :as str]
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
             [i18n :as ui18n :refer [deferred-trs deferred-tru tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

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

(defn- check-one [condition code message]
  (when-not condition
    (let [[message info] (if (and (map? message)
                                  (not (ui18n/localized-string? message)))
                           [(:message message) message]
                           [message])]
      (throw (ex-info (str message) (assoc info :status-code code)))))
  condition)

(defn check
  "Assertion mechanism for use inside API functions.
  Checks that `test` is true, or throws an `ExceptionInfo` with `status-code` and `message`.

  `message` can be either a plain string error message, or a map including the key `:message` and any additional
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
  {:style/indent 1, :arglists '([condition [code message] & more] [condition code message & more])}
  [condition & args]
  (let [[code message & more] (if (sequential? (first args))
                                (concat (first args) (rest args))
                                args)]
    (check-one condition code message)
    (if (seq more)
      (recur (first more) (rest more))
      condition)))

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
  (throw (ex-info (tru "Invalid field: {0}" field-name)
           {:status-code 400
            :errors      {(keyword field-name) message}})))

(defn checkp
  "Assertion mechanism for use inside API functions that validates individual input params.
  Checks that `test` is true, or throws an `ExceptionInfo` with `field-name` and `message`.

  This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is
  generated.

  `checkp` can be called with the form

      (checkp test field-name message)"
  {:style/indent 1}
  ([tst field-name message]
   (when-not tst
     (throw-invalid-param-exception (str field-name) message))))


;;; ---------------------------------------------- api-let, api->, etc. ----------------------------------------------

;; The following all work exactly like the corresponding Clojure versions
;; but take an additional arg at the beginning called RESPONSE-PAIR.
;; RESPONSE-PAIR is of the form `[status-code message]`.
;; ex.
;;
;;     (let [binding x] ...) -> (api-let [500 \"Not OK!\"] [binding x] ...)

(defmacro do-api-let
  "If `test` is true, bind it to `binding` and evaluate `body`. Intended for internal use only by macros such as
  `let-400` below.

    (api-let [404 \"Not found.\"] [user @*current-user*]
      (:id user))"
  [response-pair bindings & body]
  ;; so `response-pair` doesn't get evaluated more than once
  (let [response-pair-symb (gensym "response-pair-")]
    `(let [~response-pair-symb ~response-pair
           ~@(vec (apply concat (for [[binding test] (partition-all 2 bindings)]
                                  [binding `(check ~test ~response-pair-symb)])))]
       ~@body)))


;;; ### GENERIC RESPONSE HELPERS
;; These are basically the same as the `api-` versions but with RESPONSE-PAIR already bound

;; #### GENERIC 400 RESPONSE HELPERS
(def ^:private generic-400
  [400 (deferred-tru "Invalid Request.")])

(defn check-400
  "Throw a `400` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-400))

(defmacro let-400
  "Bind a form as with `let`; throw a 400 if it is `nil` or `false`."
  {:style/indent 1}
  [& body]
  `(do-api-let ~generic-400 ~@body))

;; #### GENERIC 404 RESPONSE HELPERS
(def ^:private generic-404
  [404 (deferred-tru "Not found.")])

(defn check-404
  "Throw a `404` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-404))

(defmacro let-404
  "Bind a form as with `let`; throw a 404 if it is `nil` or `false`."
  {:style/indent 1}
  [bindings & body]
  `(do-api-let ~generic-404 ~bindings ~@body))

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
  [bindings & body]
  `(do-api-let (generic-403) ~bindings ~@body))

(defn throw-403
  "Throw a generic 403 (no permissions) error response."
  []
  (throw (ex-info (tru "You don''t have permissions to do that.") {:status-code 403})))

;; #### GENERIC 500 RESPONSE HELPERS
;; For when you don't feel like writing something useful
(def ^:private generic-500
  [500 (deferred-tru "Internal server error.")])

(defn check-500
  "Throw a `500` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-500))

(defmacro let-500
  "Bind a form as with `let`; throw a 500 if it is `nil` or `false`."
  {:style/indent 1}
  [bindings & body]
  `(do-api-let ~generic-500 ~bindings ~@body))

(def generic-204-no-content
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

   -  converts `route` from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`

   -  sequentially applies specified annotation functions on args to validate them.

   -  automatically calls `wrap-response-if-needed` on the result of `body`

   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below) will automatically include
      the function in the generated `defroutes` form.

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
      ;; Don't i18n this, it's dev-facing only
      (log/warn (u/format-color 'red "Warning: endpoint %s/%s does not have a docstring. Go add one."
                  (ns-name *ns*) fn-name)))
    `(def ~(vary-meta fn-name
                      merge
                      (meta method)
                      ;; eval the vals in arg->schema to make sure the actual schemas are resolved so we can document
                      ;; their API error messages
                      {:doc          (route-dox method route docstr args (m/map-vals eval arg->schema) body)
                       :is-endpoint? true})
       (~method ~route ~args
        (auto-parse ~args
          ~@validate-param-calls
          (wrap-response-if-needed (do ~@body)))))))

(defmacro defendpoint-async
  "Like `defendpoint`, but generates an endpoint that accepts the usual `[request respond raise]` params."
  {:arglists '([method route docstr? args schemas-map? & body])}
  [method route & more]
  (let [fn-name                (route-fn-name method route)
        route                  (typify-route route)
        [docstr [args & more]] (u/optional string? more)
        [arg->schema body]     (u/optional (every-pred map? #(every? symbol? (keys %))) more)
        validate-param-calls   (validate-params arg->schema)]
    (when-not docstr
      (log/warn (deferred-trs "Warning: endpoint {0}/{1} does not have a docstring." (ns-name *ns*) fn-name)))
    `(def ~(vary-meta fn-name assoc
                      ;; eval the vals in arg->schema to make sure the actual schemas are resolved so we can document
                      ;; their API error messages
                      :doc (route-dox method route docstr args (m/map-vals eval arg->schema) body)
                      :is-endpoint? true)
       (~method ~route []
        (fn ~args
          ~@validate-param-calls
          ~@body)))))

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
  (fn
    ([request]
     (check-superuser)
     (handler request))
    ([request respond raise]
     (if-let [e (try
                  (check-superuser)
                  nil
                  (catch Throwable e
                    e))]
       (raise e)
       (handler request respond raise)))))


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

(defn create-check
  "NEW! Check whether the current user has permissions to CREATE a new instance of an object with properties in map `m`.

  This function was added *years* after `read-check` and `write-check`, and at the time of this writing most models do
  not implement this method. Most `POST` API endpoints instead have the `can-create?` logic for a given model
  hardcoded into this -- this should be considered an antipattern and be refactored out going forward."
  {:added "0.32.0", :style/indent 2}
  [entity m]
  (check-403 (mi/can-create? entity m)))

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
  "Check that the `object` exists and is not `:archived`, or throw a `404`. Returns `object` as-is if check passes."
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

(defmacro catch-and-raise
  "Catches exceptions thrown in `body` and passes them along to the `raise` function. Meant for writing async
  endpoints.

  You only need to `raise` Exceptions that happen outside the initial thread of the API endpoint function; things like
  normal permissions checks are usually done within the same thread that called the endpoint, meaning the middleware
  that catches Exceptions will automatically handle them."
  {:style/indent 1}
  ;; using 2+ args so we can catch cases where people forget to pass in `raise`
  [raise body & more]
  `(try
     ~body
     ~@more
     (catch Throwable e#
       (~raise e#))))
