;; # API Endpoints at Metabase
;;
;; We use a custom macro called `defendpoint` for defining all endpoints. It's best illustrated with an example:
;;
;; <pre><code>
;; (ns metabase.api.dashboard ...)
;;
;; (api/defendpoint GET "/"
;;  "Get `Dashboards`. With filter option `f`..."
;;  [f]
;;  {f [:maybe [:enum "all" "mine" "archived"]]}
;;  (let ...))
;;
;;  ; ...
;;
;; (api/define-routes)
;; </code></pre>
;;
;; As you can see, the arguments are:
;;
;; * **The HTTP verb.**  (`GET`, `PUT`, `POST`, etc)
;; * **The route.** This will automatically have `api` and the namespace prefixed to it, so in this case `"/"` is defining
;;   the route for `/api/dashboard/`.
;; * **A docstring.** Apart from being helpful to us, this is used for API documentation for third-party devs, so please
;;   be thorough!
;; * **A schema.** This uses [Malli's vector syntax](https://github.com/metosin/malli#vector-syntax). This is documented
;;   on Malli's page, of course, but we also have some of our own schemas defined. Start by looking in
;;   [`metabase.util.malli.schema`](#metabase.util.malli.schema)
;; * **The parameters.** This uses Compojure's
;;   [destructuring syntax](https://github.com/weavejester/compojure/wiki/Destructuring-Syntax) (a superset of Clojure's
;;   normal destructuring syntax).
;; * **The actual code for the endpoint.** The returned value could be one of several types. The Right Thing (such as
;;   converting to JSON or setting an appropriate status code) usually happens by default. Consult
;;   [Compojure's documentation](https://github.com/weavejester/compojure/blob/master/src/compojure/response.clj),
;;   but it may be more instructive to look at examples in our codebase.
;;
;;  <hr />
;;
;; ## How does defendpoint coersion work?
;;
;; The `defendpoint` macro uses the `auto-coerce` function to generate a let code which binds args to their decoded
;; values. Values are decoded by their corresponding malli schema. n.b.: Only symbols in the arg->schema map will be
;; coerced; additional aliases (eg. after the :as key) will not automatically be coerced.
;;
;; The exact coersion function [[mc/decode]], and uses the [[metabase.api.common.internal/defendpoint-transformer]],
;; and gets called with the schema, value, and transformer. see: https://github.com/metosin/malli#value-transformation
;;
;; ### Here's an example repl session showing how it works:
;;
;; <pre><code>
;; (require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
;;          '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
;;          '[malli.transform :as mtx] '[metabase.api.common.internal :refer [defendpoint-transformer]])
;; </code></pre>
;;
;; To see how a schema will be transformed, call `mc/decode` with `defendpoint-transformer`.
;;
;; With the `:keyword` schema:
;;
;; <pre><code>
;; (mc/decode :keyword "foo/bar" defendpoint-transformer)
;; ;; => :foo/bar
;; </code></pre>
;;
;; The schemas can get quite complex, ( see: https://github.com/metosin/malli#advanced-transformations ) so it's best
;; to test them out in the REPL to see how they'll be transformed.
;;
;; Example:
;; <pre><code>
;; (def DecodableKwInt
;;   [:int {:decode/string (fn kw-int->int-decoder [kw-int]
;;                           (if (int? kw-int) kw-int (parse-long (name kw-int))))}])
;;
;; (mc/decode DecodableKwInt :123 defendpoint-transformer)
;; ;; => 123
;; </code></pre>
;; <hr />

(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.tools.macro :as macro]
   [compojure.core :as compojure]
   [medley.core :as m]
   [metabase.api.common.internal
    :refer [add-route-param-schema
            auto-coerce
            route-dox
            route-fn-name
            validate-params
            wrap-response-if-needed]]
   [metabase.api.common.openapi :as openapi]
   [metabase.config :as config]
   [metabase.events :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]
   [ring.middleware.multipart-params :as mp]
   [toucan2.core :as t2]))

(declare check-403 check-404)

(p/import-vars [openapi openapi-object])

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

(def ^:dynamic ^Boolean *is-group-manager?*
  "Is the current user a group manager of at least one group?"
  false)

(def ^:dynamic *current-user-permissions-set*
  "Delay to the set of permissions granted to the current user. See documentation in [[metabase.models.permissions]] for
  more information about the Metabase permissions system."
  (atom #{}))


;;; ---------------------------------------- Precondition checking helper fns ----------------------------------------

(defn- check-one [condition code message]
  (when-not condition
    (let [[message info] (if (and (map? message)
                                  (not (i18n/localized-string? message)))
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
  {:style/indent [:form], :arglists '([condition [code message] & more] [condition code message & more])}
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
   (check-404 (apply t2/exists? entity k v more))))

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

(defn throw-403
  "Throw a generic 403 (no permissions) error response."
  ([]
   (throw-403 nil))

  ([e]
   (throw (ex-info (tru "You don''t have permissions to do that.") {:status-code 403} e))))

;; #### GENERIC 500 RESPONSE HELPERS
;; For when you don't feel like writing something useful
(def ^:private generic-500
  [500 (deferred-tru "Internal server error.")])

(defn check-500
  "Throw a `500` if `arg` is `false` or `nil`, otherwise return as-is."
  [arg]
  (check arg generic-500))

(def generic-204-no-content
  "A 'No Content' response for `DELETE` endpoints to return."
  {:status 204, :body nil})


;;; --------------------------------------- DEFENDPOINT AND RELATED FUNCTIONS ----------------------------------------

(s/def ::defendpoint-args
  (s/cat
   :method      symbol?
   :route       (some-fn string? sequential?)
   :docstr      (s/? string?)
   :args        vector?
   :arg->schema (s/? (s/map-of symbol? any?)) ;; any? is either a plumatic or malli schema
   :body        (s/* any?)))

(defn- parse-defendpoint-args [args]
  (let [parsed (s/conform ::defendpoint-args args)]
    (when (= parsed ::s/invalid)
      (throw (ex-info (str "Invalid defendpoint args: " (s/explain-str ::defendpoint-args args))
                      (s/explain-data ::defendpoint-args args))))
    (let [{:keys [method route docstr args arg->schema body]} parsed
          fn-name                                             (route-fn-name method route)
          route                                               (add-route-param-schema arg->schema route)
          ;; eval the vals in arg->schema to make sure the actual schemas are resolved so we can document
          ;; their API error messages
          route-doc                                           (route-dox method route docstr args
                                                                         (m/map-vals #_{:clj-kondo/ignore [:discouraged-var]} eval arg->schema)
                                                                         body)]
      ;; Don't i18n this, it's dev-facing only
      (when-not docstr
        (log/warn (u/format-color 'red "Warning: endpoint %s/%s does not have a docstring. Go add one."
                                  (ns-name *ns*) fn-name)))
      (assoc parsed :fn-name fn-name, :route route, :route-doc route-doc, :docstr docstr))))

(defn validate-param-values
  "Log a warning if the request body contains any parameters not included in `expected-params` (which is presumably
  populated by the defendpoint schema)"
  [{method :request-method uri :uri body :body} expected-params]
  (when (and (not config/is-prod?)
             (map? body))
    (let [extraneous-params (set/difference (set (keys body))
                                            (set expected-params))]
      (when (seq extraneous-params)
        (log/warnf "Unexpected parameters at %s: %s\nPlease add them to the schema or remove them from the API client"
                   [method uri] (vec extraneous-params))))))

(defn method-symbol->keyword
  "Convert Compojure-style HTTP method symbols (PUT, POST, etc.) to the keywords used internally by
  Compojure (:put, :post, ...)"
  [method-symbol]
  (-> method-symbol
      name
      u/lower-case-en
      keyword))

(defmacro defendpoint*
  "Impl macro for [[defendpoint]]; don't use this directly."
  [{:keys [method route fn-name route-doc docstr args body arg->schema]}]
  {:pre [(or (string? route) (vector? route))]}
  (let [method-kw       (method-symbol->keyword method)
        allowed-params  (mapv keyword (keys arg->schema))
        prep-route      #'compojure/prepare-route
        multipart?      (get (meta method) :multipart false)
        handler-wrapper (if multipart? mp/wrap-multipart-params identity)
        schema          (into [:map] (for [[k v] arg->schema]
                                       [(keyword k) v]))
        quoted-args     (list 'quote args)]
    `(def ~(vary-meta fn-name
                      merge
                      {:doc          route-doc
                       :orig-doc     docstr
                       :method       method-kw
                       :path         route
                       :schema       schema
                       :args         quoted-args
                       :is-endpoint? true}
                      (meta method))
       ;; The next form is a copy of `compojure/compile-route`, with the sole addition of the call to
       ;; `validate-param-values`. This is because to validate the request body we need to intercept the request
       ;; before the destructuring takes place. I.e., we need to validate the value of `(:body request#)`, and that's
       ;; not available if we called `compile-route` ourselves.
       (compojure/make-route
        ~method-kw
        ~(prep-route route)
        (~handler-wrapper
         (fn [request#]
           (validate-param-values request# (quote ~allowed-params))
           (compojure/let-request [~args request#]
                                  ~@body)))))))

(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  converts `route` from a simple form like `\"/:id\"` to a regex-typed one like `[\"/:id\" :id #\"[0-9]+\"]` based
      on its malli schema

   -  sequentially applies specified annotation functions on args to validate them.

   -  automatically calls `wrap-response-if-needed` on the result of `body`

   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below) will automatically include
      the function in the generated `defroutes` form.

   -  Generates a super-sophisticated Markdown-formatted docstring"
  {:arglists '([method route docstr? args schemas-map? & body])}
  [& defendpoint-args]
  (let [{:keys [args body arg->schema], :as defendpoint-args} (parse-defendpoint-args defendpoint-args)]
    `(defendpoint* ~(assoc defendpoint-args
                           :body `((auto-coerce ~args ~arg->schema
                                                ~@(validate-params arg->schema)
                                                (wrap-response-if-needed
                                                 (do ~@body))))))))

(defmacro defendpoint-async
  "Like `defendpoint`, but generates an endpoint that accepts the usual `[request respond raise]` params."
  {:arglists '([method route docstr? args schemas-map? & body])}
  [& defendpoint-args]
  (let [{:keys [args body arg->schema], :as defendpoint-args} (parse-defendpoint-args defendpoint-args)]
    `(defendpoint* ~(assoc defendpoint-args
                           :args []
                           :body `((fn ~args
                                     ~@(validate-params arg->schema)
                                     ~@body))))))

(defn- namespace->api-route-fns
  "Return a sequence of all API endpoint functions defined by `defendpoint` in a namespace."
  [nmspace]
  (for [[_symb varr] (ns-publics nmspace)
        :when       (:is-endpoint? (meta varr))]
    varr))

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
  (let [api-route-fns (vec (namespace->api-route-fns *ns*))
        routes        `(with-meta (compojure/routes ~@api-route-fns) {:routes ~api-route-fns})
        docstring     (str "Routes for " *ns*)]
    `(def ~(vary-meta 'routes assoc
                      :doc    (api-routes-docstring *ns* api-route-fns middleware)
                      :routes api-route-fns)
       ~docstring
       ~(if (seq middleware)
          `(-> ~routes ~@middleware)
          routes))))

(defmacro context
  "Replacement for `compojure.core/context`, but with metadata"
  [path args & routes]
  `(with-meta (compojure/context ~path ~args ~@routes) {:routes (vector ~@routes)
                                                        :path   ~path}))

(defmacro defroutes
  "Replacement for `compojure.core/defroutes, but with metadata"
  [name & routes]
  (let [[name routes] (macro/name-with-attributes name routes)
        name          (vary-meta name assoc :routes (vec routes))]
    `(def ~name (compojure/routes ~@routes))))

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
  "Check whether we can read an existing `obj`, or `entity` with `id`. If the object doesn't exist, throw a 404; if we
  don't have proper permissions, throw a 403. This will fetch the object if it was not already fetched, and returns
  `obj` if the check is successful."
  {:style/indent 2}
  ([obj]
   (check-404 obj)
   (try
     (check-403 (mi/can-read? obj))
     (catch clojure.lang.ExceptionInfo e
       (events/publish-event! :event/read-permission-failure {:user-id    *current-user-id*
                                                              :object     obj
                                                              :has-access false})
       (throw e)))
   obj)

  ([entity id]
   (read-check (t2/select-one entity :id id)))

  ([entity id & other-conditions]
   (read-check (apply t2/select-one entity :id id other-conditions))))

(defn write-check
  "Check whether we can write an existing `obj`, or `entity` with `id`. If the object doesn't exist, throw a 404; if we
  don't have proper permissions, throw a 403. This will fetch the object if it was not already fetched, and returns
  `obj` if the check is successful."
  {:style/indent 2}
  ([obj]
   (check-404 obj)
   (try
     (check-403 (mi/can-write? obj))
     (catch clojure.lang.ExceptionInfo e
       (events/publish-event! :event/write-permission-failure {:user-id *current-user-id*
                                                               :object obj})
       (throw e)))
   obj)
  ([entity id]
   (write-check (t2/select-one entity :id id)))
  ([entity id & other-conditions]
   (write-check (apply t2/select-one entity :id id other-conditions))))

(defn create-check
  "NEW! Check whether the current user has permissions to CREATE a new instance of an object with properties in map `m`.

  This function was added *years* after `read-check` and `write-check`, and at the time of this writing most models do
  not implement this method. Most `POST` API endpoints instead have the `can-create?` logic for a given model
  hardcoded into them -- this should be considered an antipattern and be refactored out going forward."
  {:added "0.32.0", :style/indent 2}
  [entity m]
  (try
    (check-403 (mi/can-create? entity m))
    (catch clojure.lang.ExceptionInfo e
      (events/publish-event! :event/create-permission-failure {:model entity
                                                               :user-id *current-user-id*})
      (throw e))))

(defn update-check
  "NEW! Check whether the current user has permissions to UPDATE an object by applying a map of `changes`.

  This function was added *years* after `read-check` and `write-check`, and at the time of this writing most models do
  not implement this method. Most `PUT` API endpoints instead have the `can-update?` logic for a given model hardcoded
  into them -- this should be considered an antipattern and be refactored out going forward."
  {:added "0.36.0", :style/indent 2}
  [instance changes]
  (try
    (check-403 (mi/can-update? instance changes))
    (catch clojure.lang.ExceptionInfo e
      (events/publish-event! :event/update-permission-failure {:user-id *current-user-id*
                                                               :object instance})
      (throw e))))

;;; ------------------------------------------------ OTHER HELPER FNS ------------------------------------------------

(defn check-not-archived
  "Check that the `object` exists and is not `:archived`, or throw a `404`. Returns `object` as-is if check passes."
  [object]
  (u/prog1 object
    (check-404 object)
    (check (not (:archived object))
      [404 {:message (tru "The object has been archived."), :error_code "archived"}])))

(defn check-valid-page-params
  "Check on paginated stuff that, if the limit exists, the offset exists, and vice versa."
  [limit offset]
  (check (not (and limit (not offset))) [400 (tru "When including a limit, an offset must also be included.")])
  (check (not (and offset (not limit))) [400 (tru "When including an offset, a limit must also be included.")]))

(mu/defn column-will-change? :- :boolean
  "Helper for PATCH-style operations to see if a column is set to change when `object-updates` (i.e., the input to the
  endpoint) is applied.

    ;; assuming we have a Collection 10, that is not currently archived...
    (api/column-will-change? :archived (t2/select-one Collection :id 10) {:archived true}) ; -> true, because value will change

    (api/column-will-change? :archived (t2/select-one Collection :id 10) {:archived false}) ; -> false, because value did not change

    (api/column-will-change? :archived (t2/select-one Collection :id 10) {}) ; -> false; value not specified in updates (request body)"
  [k :- :keyword object-before-updates :- :map object-updates :- :map]
  (boolean
   (and (contains? object-updates k)
        (not= (get object-before-updates k)
              (get object-updates k)))))

;;; ------------------------------------------ COLLECTION POSITION HELPER FNS ----------------------------------------

(mu/defn reconcile-position-for-collection!
  "Compare `old-position` and `new-position` to determine what needs to be updated based on the position change. Used
  for fixing card/dashboard/pulse changes that impact other instances in the collection"
  [collection-id :- [:maybe ms/PositiveInt]
   old-position  :- [:maybe ms/PositiveInt]
   new-position  :- [:maybe ms/PositiveInt]]
  (let [update-fn! (fn [plus-or-minus position-update-clause]
                     (doseq [model '[Card Dashboard Pulse]]
                       (t2/update! model {:collection_id       collection-id
                                          :collection_position position-update-clause}
                                   {:collection_position [plus-or-minus :collection_position 1]})))]
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
  [:map
   [:collection_id       [:maybe ms/PositiveInt]]
   [:collection_position [:maybe ms/PositiveInt]]])

(def ^:private ModelWithOptionalPosition
  "Intended to cover Cards/Dashboards/Pulses updates. Collection id and position are optional, if they are not
  present, they didn't change. If they are present, they might have changed and we need to compare."
  [:map
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]])

(mu/defn maybe-reconcile-collection-position!
  "Generic function for working on cards/dashboards/pulses. Checks the before and after changes to see if there is any
  impact to the collection position of that model instance. If so, executes updates to fix the collection position
  that goes with the change. The 2-arg version of this function is used for a new card/dashboard/pulse (i.e. not
  updating an existing instance, but creating a new one)."
  ([new-model-data :- ModelWithPosition]
   (maybe-reconcile-collection-position! nil new-model-data))
  ([{old-collection-id :collection_id, old-position :collection_position, :as _before-update} :- [:maybe ModelWithPosition]
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


;;; ------------------------------------------ PARAM PARSING FNS ----------------------------------------

(defn bit->boolean
  "Coerce a bit returned by some MySQL/MariaDB versions in some situations to Boolean."
  [v]
  (if (number? v)
    (not (zero? v))
    v))

(defn parse-multi-values-param
  "Parse a param that could have a single value or multiple values using `parse-fn`.
  Always return a vector.

  Used for API that can parse single value or multiple values for a param:
  e.g:
    single value: api/card/series?exclude_ids=1
    multi values: api/card/series?exclude_ids=1&exclude_ids=2

  Example usage:
    (parse-multi-values-param \"1\" parse-long)
    => [1]

    (parse-multi-values-param [\"1\" \"2\"] parse-long)
    => [1, 2]"
  [xs parse-fn]
  (if (sequential? xs)
    (map parse-fn xs)
    [(parse-fn xs)]))


;;; ---------------------------------------- SET `archived_directly` ---------------------------------

(defn updates-with-archived-directly
  "Sets `archived_directly` to `true` iff `:archived` is being set to `true`."
  [current-obj obj-updates]
  (cond-> obj-updates
    (column-will-change? :archived current-obj obj-updates)
    (assoc :archived_directly (boolean (:archived obj-updates)))

    ;; This is a hack around a frontend issue. Apparently, the undo functionality depends on calculating a diff
    ;; between the current state and the previous state. Sometimes this results in the frontend telling us to
    ;; *both* mark an item as archived *and* "move" it to the Trash.
    ;;
    ;; Let's just say that if you're marking something as archived, we throw away any `collection_id` you passed in
    ;; along with it.
    (and (column-will-change? :archived current-obj obj-updates)
         (:archived obj-updates))
    (dissoc :collection_id)))

(defn present-in-trash-if-archived-directly
  "If `:archived_directly` is `true`, set `:collection_id` to the trash collection ID."
  [item trash-collection-id]
  (cond-> item
    (:archived_directly item)
    (assoc :collection_id trash-collection-id)))

(mu/defn present-items
  "A convenience function that takes a heterogeneous collection of items. Each item should have, at minimum, a `:model`
  and an `:id`. The `f` function is called like `(f model all-items-with-that-model)` and should return a collection
  of maps. `:id` is the only required key for these maps, and order *does not matter* - `present-items` is responsible
  for reordering items the way they were."
  [f items :- [:sequential [:map
                            [:id ms/PositiveInt]
                            [:model :keyword]]]]
  (let [id+model->order (into {} (map-indexed (fn [i row] [[(:id row) (:model row)] i]) items))]
    (->> items
         (group-by :model)
         (mapcat (fn [[model items]]
                   (map #(assoc % ::model model) (f model items))))
         (sort-by (comp id+model->order (juxt :id ::model)))
         (map #(dissoc % ::model)))))
