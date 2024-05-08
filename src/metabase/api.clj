#_{:clj-kondo/ignore [:consistent-alias]}
(ns metabase.api
  "API namespace for the Metabase REST API module."
  [:require
   [metabase.api.common :as api.common]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.permission-graph :as api.permission-graph]
   [metabase.api.routes :as api.routes]
   [potemkin :as p]])

(comment
  api.common/keep-me
  api.dataset/keep-me
  api.permission-graph/keep-me
  api.routes/keep-me)

(p/import-vars
  [api.common
   check
   check-404
   check-500
   check-not-archived ; TODO: this seems more like a models thing than a REST API thing
   column-will-change?
   maybe-reconcile-collection-position!
   read-check ; TODO -- should this go in a permissions module?
   throw-403]
  [api.dataset
   export-format-regex]
  [api.permission-graph
   StrictData]
  [api.routes
   routes])

;;; TODO -- all of this stuff maybe belongs in its own `metabase.session` module or something like that, it is sorta
;;; related to the REST API but we also use it in other stuff like task-triggered query execution.

(defn current-user-id
  "The ID of the User associated with the current REST API request.

  This is fetched automatically as part of every REST API request, so you can call this with no performance penalty.

  This will be `nil` if we're not currently in a REST API request context."
  []
  api.common/*current-user-id*)

(defn current-user
  "The User associated with the current REST API request. Unlike [[current-user-id]], this is not fetched automatically
  on every request, so prefer [[current-user-id]], [[current-user-permissions-set]], or [[is-superuser?]] unless you
  really need other information associated with the current User.

  This is fetched when first used and cached for the duration of each REST API request.

  This will return `nil` if we're not currently in a REST API request context, but so
  would [[current-user-id]] (HINT)."
  []
  @api.common/*current-user*)

(defmacro with-current-user-id
  "Execute `body` with the [[current-user-id]] bound to `current-user-id`."
  {:style/indent [:defn]}
  [current-user-id & body]
  `(binding [api.common/*current-user-id* ~current-user-id]
     ~@body))

(defn current-user-permissions-set
  "Set of permissions associated with the User associated with the current REST API request.

  This is fetched when first used and cached for the duration of each REST API request.

  This will return `#{}` (empty permissions set) if we're not currently in a REST API request context."
  []
  @api.common/*current-user-permissions-set*)

(defn is-superuser?
  "Whether the User associated with the current REST API request is a superuser (admin).

  This is fetched when first used and cached for the duration of each REST API request.

  This will return `false` if we're not currently in a REST API request context."
  []
  api.common/*is-superuser?*)
