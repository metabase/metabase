(ns metabase-enterprise.database-routing.common
  (:require
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(defn- user-attribute
  "Which user attribute should we use for this RouterDB?"
  [db-or-id]
  (database-routing.db/router-user-attribute (u/the-id db-or-id)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private *database-routing-on* :unset)

;; Bound together with `*database-routing-on*` by `with-database-routing-off-if-granted-fn` below, and only there: it
;; records whether whoever made the request has a Metabase account, which is the one thing a refusal needs that the
;; user bindings cannot be asked for later. The public dashcard path deliberately clears the current user before
;; running a query -- a public page must not pick up a signed-in visitor's locked parameters -- so by the time a
;; refusal is thrown, every viewer looks anonymous.
#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private *viewer-signed-in?* false)

(defn- refuse-anonymous-access!
  "Throw the query-time refusal for router database `db-id`, which no admin has granted anonymous access.

  The message is written for whoever is asking. An anonymous visitor learns only that the database refuses anonymous
  access: naming the database or the setting would tell a stranger holding a public URL how this instance is
  configured. A signed-in viewer -- in practice an admin opening their own public link -- is told which database and
  which setting to change, and `:message-for-viewer` tells the public and embedding layers that text is theirs to
  return rather than genericize (see [[metabase.api.routes.common/message-for-viewer]]).

  The warning carries the same diagnosis to the server log, so a support engineer can reach it without the link."
  [db-id]
  (let [database-name (database-routing.db/database-name db-id)]
    (log/warnf (str "Refusing an anonymous query: database %d (%s) has database routing enabled and"
                    " anonymous_access_granted is false.")
               db-id database-name)
    (throw (ex-info (tru "This database does not allow anonymous access.")
                    (cond-> {:status-code                  400
                             :anonymous-access-not-granted true
                             :router-database-id           db-id}
                      *viewer-signed-in?*
                      (assoc :message-for-viewer
                             (tru (str "{0} has database routing enabled and does not allow anonymous access, so a"
                                       " public link or guest embed on it returns no data.")
                                  database-name)))))))

(defn- router-db-or-id->destination-db-id*
  [is-anonymous-user? user-attributes is-superuser? db-or-id]
  (when-let [attr-name (user-attribute db-or-id)]
    (let [database-name (get user-attributes attr-name)]
      (cond
        ;; if database routing is EXPLICITLY off, e.g. in `POST /api/database/:id/sync_schema`, don't do any routing.
        (= :off *database-routing-on*)
        nil

        ;; The decision is the database's grant, never whoever is visiting -- that is what makes one public URL serve
        ;; the same data to every viewer, signed in or not. Granted means no routing, i.e. the router database answers.
        (= :router-if-granted *database-routing-on*)
        (when-not (database-routing.db/router-anonymous-access-granted? (u/the-id db-or-id))
          (refuse-anonymous-access! (u/the-id db-or-id)))

        is-anonymous-user?
        (throw (ex-info (tru "Anonymous users cannot access a database with routing enabled.") {:status-code 400
                                                                                                :database-routing-enabled true
                                                                                                :database-or-id db-or-id
                                                                                                :database-name (database-routing.db/database-name (u/the-id db-or-id))}))

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
        (or (database-routing.db/destination-database-id (u/the-id db-or-id) database-name)
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
;; explicitly want the router (e.g. sync), `:router-if-granted` when we want the router but only where the database
;; grants anonymous access, `:unset` otherwise. Concretely:
;;
;; (a) looks like:
;; - I am looking at a Router Database,
;; - the current user's attribute would route me to a *different* destination, and
;; - `*database-routing-on*` is `:on` or `:unset`.
;; A correctness concern, owned by the routing middleware (which makes the routing decision); not enforced here.
;;
;; (b) looks like:
;; - I am looking at a destination Database, and
;; - `*database-routing-on*` is not `:on` (i.e. `:off`, `:router-if-granted`, or `:unset`).
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

(defenterprise with-database-routing-off-if-granted-fn
  "Enterprise version. Calls the function with Database Routing prohibited, and a router database reachable only if an
  admin has granted it anonymous access.

  Every anonymous surface enters here before the layers that run the query as an admin and detach it from whoever is
  visiting, so this is also where a refusal's audience is settled: see `*viewer-signed-in?*`."
  :feature :database-routing
  [f]
  (binding [*database-routing-on* :router-if-granted
            *viewer-signed-in?*   (some? api/*current-user-id*)]
    (f)))

(defn- is-disallowed-destination-db-access?
  [db-or-id]
  (and (database-routing.db/destination-database? db-or-id)
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
