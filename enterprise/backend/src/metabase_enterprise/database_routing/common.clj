(ns metabase-enterprise.database-routing.common
  (:require
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private *anonymous-router-access?*
  "Whether work with no current user may reach a router itself; see [[do-with-anonymous-router-access]]."
  false)

(defenterprise do-with-anonymous-router-access
  "Enterprise version. Calls `thunk` with no current user, letting it reach a router itself."
  :feature :none
  [thunk]
  (binding [api/*current-user-id*      nil
            *anonymous-router-access?* true]
    (thunk)))

(defn- user-attribute
  "The user attribute the router `db`, the Lib metadata of a Database, routes on; read from the app DB only when `db` was
  converted in memory and so lacks it."
  [db]
  (if (contains? db :router-user-attribute)
    (:router-user-attribute db)
    (database-routing.db/router-user-attribute (:id db))))

(defn- router-db->destination-db-id*
  [is-anonymous-user? user-attributes is-superuser? db]
  (when-let [attr-name (user-attribute db)]
    (let [database-name (get user-attributes attr-name)]
      (cond
        is-anonymous-user?
        (when-not *anonymous-router-access?*
          (throw (ex-info (tru "Anonymous users cannot access a database with routing enabled.")
                          {:status-code              400
                           :database-routing-enabled true
                           :database-id              (:id db)
                           :database-name            (:name db)})))

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
                         :router-database-id (:id db)
                         :status-code 400}))

        :else
        (or (database-routing.db/destination-database-id (:id db) database-name)
            (throw (ex-info (tru "Database Routing error: No Destination Database with slug `{0}` found."
                                 database-name)
                            {:database-name database-name
                             :router-database-id (:id db)
                             :status-code 400})))))))

(defn router-db->destination-db-id
  "The ID of the destination database that the current user's queries against `db`, the Lib metadata of a Database,
  are routed to, or nil when `db` is not a Router Database or no user is bound in [[do-with-anonymous-router-access]];
  throws when no user is bound outside it."
  [db]
  (router-db->destination-db-id*
   (nil? api/*current-user-id*)
   (when api/*current-user-id* (api/current-user-attributes))
   api/*is-superuser?*
   db))

(defenterprise routed-database
  "Enterprise version. The Lib metadata of the destination Database that the current user's connections to `database`
  go to, or nil when
  they go to `database` itself; with no user bound, a router is refused outside [[do-with-anonymous-router-access]]."
  :feature :none
  [database]
  (when-not (and (nil? api/*current-user-id*) *anonymous-router-access?*)
    (when-let [destination-id (router-db->destination-db-id database)]
      (premium-features/assert-has-feature :database-routing (tru "Database Routing"))
      (driver.u/lib-database destination-id))))

(defenterprise routed-user?
  "Whether the current user's queries against ANY router database they can view data from resolve to a destination
  database rather than the router itself, mirroring [[router-db->destination-db-id*]]. Routers whose
  `:perms/view-data` is `:blocked` for the user are ignored: they cannot run anything against them, so routing there
  doesn't change what they see. A user whose attribute is the `__METABASE_ROUTER__` sentinel is not routed. A superuser
  missing the attribute defaults to the router, so is not routed, but a superuser whose attribute names a destination
  database is routed like anyone else. A non-admin missing the attribute would be refused at query time, so counts as
  routed here (fail closed). Uses `:feature :none` so a routed user is recognized even when the `:database-routing`
  feature is momentarily unavailable. Throws if no current user is bound."
  :feature :none
  []
  (boolean
   (if api/*current-user-id*
     (let [attributes     (api/current-user-attributes)
           routes-user?   (fn [attribute-name]
                            (let [value (get attributes attribute-name)]
                              (if (nil? value)
                                (not api/*is-superuser?*)
                                (not= "__METABASE_ROUTER__" value))))
           routing-db-ids (into []
                                (keep (fn [[db-id attribute-name]]
                                        (when (routes-user? attribute-name)
                                          db-id)))
                                (database-routing.db/all-router-user-attributes))]
       (perms/prime-database-perms-cache {:db-ids routing-db-ids})
       (some (fn [db-id]
               (not= :blocked
                     (perms/most-permissive-database-permission-for-user
                      api/*current-user-id* :perms/view-data db-id)))
             routing-db-ids))
     ;; If no *current-user-id* is bound we can't check for routing, so we should throw in this case to avoid
     ;; returning `false` for users who should actually be routed.
     (throw (ex-info (str (tru "No current user found"))
                     {:status-code 403})))))

(defenterprise routing-token-for-db
  "Database-routing fingerprint for the current user on router `db-id` (the resolved destination
  database id), or nil when the user resolves to the router db itself (admins, or non-admins
  routed via the __METABASE_ROUTER__ sentinel) or when `db-id` is not a router database. May
  throw when a routed non-admin is missing the required routing attribute."
  :feature :none
  [db-id]
  (when-let [dest (router-db->destination-db-id (driver.u/lib-database db-id))]
    {:destination-db-id dest}))

(defn assert-not-direct-destination-access!
  "Throws a 403 when `db`, the Lib metadata of a Database, is a destination database: a destination is reachable only
  through its router, and a direct query bypasses the router's attribute check, and with it tenant isolation."
  [db]
  (when (:router-database-id db)
    (throw (ex-info (tru "You cannot query a destination database directly.")
                    {:status-code 403}))))

(defenterprise check-allowed-access!
  "Throws a 403 if `db`, the Lib metadata of a Database, is a destination database: connections to a destination are only
  made through its router, by [[metabase.driver.connection/connection-database]], even while the `:database-routing`
  feature is unavailable."
  :feature :none
  [db]
  (assert-not-direct-destination-access! db))
