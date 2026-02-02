(ns metabase-enterprise.database-routing.common
  (:require
   [metabase.api.common :as api]
   [metabase.config.core :as config]
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

        ;; Anonymous users (guest embeds) default to the Router Database
        is-anonymous-user?
        nil

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
;; The former looks like:
;; - I am looking at a Router Database,
;; - `router-db-or-id->destination-db-id` returns a *different* database ID, and
;; - `*database-routing-on*` is `:on` or `:unset`
;;
;; The latter looks like:
;; - I am looking at a destination Database,
;; - `*database-routing-on*` is `:off` or `:unset`

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

(defn- is-disallowed-router-db-access?
  [db-or-id]
  (and (some-> (router-db-or-id->destination-db-id db-or-id)
               (not= db-or-id))
       (not= *database-routing-on* :off)))

(defn- is-disallowed-destination-db-access?
  [db-or-id]
  (and (t2/exists? :model/Database :id db-or-id :router_database_id [:not= nil])
       (not= *database-routing-on* :on)))

(defenterprise check-allowed-access!
  "This is intended as a safety harness. In dev/testing, if any access to a router or destination database is detected
  outside those circumstances where we've explicitly declared it okay, throw an exception.

  In production, skip this (fairly expensive) check.

  The idea here is that at all times we should be aware of whether:

  - we're explicitly accessing a router database (e.g. sync) and DO NOT want to reroute to a destination database, or

  - we're explicitly using the Database Routing feature (e.g. a query) and DO NOT want to access the router
  database (unless that was the user's intent, i.e. the user's attribute was `__METABASE_ROUTER__`) "
  :feature :database-routing
  [db-or-id-or-spec]
  (when-let [db-id (and (not config/is-prod?)
                        (u/id db-or-id-or-spec))]
    (when (is-disallowed-router-db-access? db-id)
      (throw (ex-info "Forbidden access to Router Database without `with-database-routing-off`" {})))
    (when (is-disallowed-destination-db-access? db-id)
      (throw (ex-info "Forbidden access to Destination Database without `with-database-routing-on`" {})))))
