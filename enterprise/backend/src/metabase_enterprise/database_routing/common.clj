(ns metabase-enterprise.database-routing.common
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- user-attribute
  "Which user attribute should we use for this RouterDB?"
  [db-or-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id (u/the-id db-or-id)))

(def ^:dynamic ^:private *database-routing-on* :unset)

(defn- router-db-or-id->destination-db-id*
  [is-anonymous-user? user-attributes is-superuser? db-or-id]
  (when-let [attr-name (user-attribute db-or-id)]
    (let [database-name (get user-attributes attr-name)]
      (cond
        ;; if database routing is EXPLICITLY off, e.g. in `POST /api/database/:id/sync_schema`, don't do any routing.
        (= :off *database-routing-on*)
        nil

        is-anonymous-user?
        (throw (ex-info (tru "Anonymous users cannot access a database with routing enabled.") {:status-code 400
                                                                                                :database-routing-enabled true
                                                                                                :database-or-id db-or-id
                                                                                                :database-name (t2/select-one-fn :name :model/Database (u/the-id db-or-id))}))

        (= database-name "__METABASE_ROUTER__")
        nil

        ;; superusers default to the Router Database
        (and (nil? database-name)
             is-superuser?)
        nil

        ;; non-superusers get an error
        (nil? database-name)
        (throw (ex-info (tru "Required user attribute is missing. Cannot route to a Destination Database.")
                        {:database-name database-name
                         :router-database-id (u/the-id db-or-id)
                         :status-code 400}))

        :else
        (or (t2/select-one-pk :model/Database
                              :router_database_id (u/the-id db-or-id)
                              :name database-name)
            (throw (ex-info (tru "Database Routing error: No Destination Database with slug `{0}` found."
                                 database-name)
                            {:database-name database-name
                             :router-database-id (u/the-id db-or-id)
                             :status-code 400})))))))

(defn router-db-or-id->destination-db-id
  "Given a user and a database (or id), returns the ID of the destination database that the user's query should ultimately be
  routed to. If the database is not a Router Database, returns `nil`. If the database is a Router Database but no
  current user exists, an exception will be thrown."
  [db-or-id]
  (router-db-or-id->destination-db-id*
   (nil? @api/*current-user*)
   (api/current-user-attributes)
   api/*is-superuser?*
   db-or-id))

(defenterprise routing-token-for-db
  "Database-routing fingerprint for the current user on router `db-id` (the resolved destination
  database id), or nil when the user resolves to the router db itself (admins, or non-admins
  routed via the __METABASE_ROUTER__ sentinel) or when `db-id` is not a router database. May
  throw when a routed non-admin is missing the required routing attribute."
  :feature :none
  [db-id]
  (when-let [dest (router-db-or-id->destination-db-id db-id)]
    {:destination-db-id dest}))

;; We want, at all times, a guarantee that we are not hitting a router *or* destination database without being
;; intentional about it. It would be bad to EITHER:
;;
;; - (a) accidentally hit a router database because we didn't include the middleware necessary to turn on Database
;; Routing, OR
;;
;; (b) accidentally hit a destination database when doing so is nonsensical, e.g. for database sync processes that should
;; only use router databases. In these cases we don't want database routing, we just want to ensure we're not hitting
;; a Destination Database
;;
;; `*database-routing-on*` records our intent: `:on` inside a routed query (destinations are expected), `:off` when we
;; explicitly want the router (e.g. sync), `:unset` otherwise. Concretely:
;;
;; (a) looks like:
;; - I am looking at a Router Database,
;; - the current user's attribute would route me to a *different* destination, and
;; - `*database-routing-on*` is `:on` or `:unset`.
;; A correctness concern, owned by the routing middleware (which makes the routing decision); not enforced here.
;;
;; (b) looks like:
;; - I am looking at a destination Database, and
;; - `*database-routing-on*` is not `:on` (i.e. `:off` or `:unset`).
;; A tenancy boundary, enforced by `check-allowed-access!` below.

(defenterprise with-database-routing-on-fn
  "Enterprise version. Calls the function with Database Routing allowed."
  :feature :database-routing
  [f]
  (binding [*database-routing-on* :on]
    (f)))

(defenterprise with-database-routing-off-fn
  "Enterprise version. Calls the function with Database Routing prohibited."
  :feature :database-routing
  [f]
  (binding [*database-routing-on* :off]
    (f)))

(defn- is-disallowed-destination-db-access?
  [db-or-id]
  (and (t2/exists? :model/Database :id db-or-id :router_database_id [:not= nil])
       (not= *database-routing-on* :on)))

(defn assert-not-direct-destination-access!
  "Throws a 403 when `db-or-id` is a destination database queried directly, outside a routing-on
  context. A destination is reachable only through its router; a direct query bypasses the router's
  attribute check, and with it tenant isolation."
  [db-or-id]
  (when (is-disallowed-destination-db-access? (u/the-id db-or-id))
    (throw (ex-info (tru "You cannot query a destination database directly.")
                    {:status-code 403}))))

(defenterprise check-allowed-access!
  "Throws a 403 if `db-or-id-or-spec` is a destination database accessed while database routing is
  not `:on`, i.e. a direct hit that bypasses its router. Legitimate access to a destination goes
  through its router, which turns routing `:on`."
  :feature :database-routing
  [db-or-id-or-spec]
  (when-let [db-id (u/id db-or-id-or-spec)]
    (assert-not-direct-destination-access! db-id)))
