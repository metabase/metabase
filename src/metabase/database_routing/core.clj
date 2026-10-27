(ns metabase.database-routing.core
  "The OSS namespace for database routing."
  (:require
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]))

(defenterprise-schema routed-database :- [:maybe ::lib.schema.metadata/database]
  "The Lib metadata of the destination Database that the current user's connections to the Lib metadata `database` go
  to, or nil when they go to `database` itself; OSS has no database routing, so it is always nil."
  metabase-enterprise.database-routing.common
  [_database :- ::lib.schema.metadata/database]
  nil)

(defenterprise do-with-anonymous-router-access
  "Calls `thunk` with no current user, letting it reach a router itself; outside it, work with no user is refused on a
  router. OSS has no routers, so there is nothing to allow."
  metabase-enterprise.database-routing.common
  [thunk]
  (thunk))

(defmacro with-anonymous-router-access
  "Runs body with no current user, letting work whose results every user shares, such as sync or a guest embed, reach a
  router itself."
  [& body]
  `(do-with-anonymous-router-access (fn [] ~@body)))

(defenterprise-schema check-allowed-access! :- :nil
  "Throws if the Lib metadata `db` of a Database may not be connected to directly; OSS has no destinations, so it does
  nothing."
  metabase-enterprise.database-routing.common
  [_db :- ::lib.schema.metadata/database]
  nil)

(defenterprise delete-associated-database-router!
  "OSS version, does nothing"
  metabase-enterprise.database-routing.models
  [_db-id]
  nil)

(defenterprise-schema db-routing-enabled? :- :boolean
  "Returns whether or not the Lib metadata `db` of a Database is either a router or destination database."
  metabase-enterprise.database-routing.models
  [_db :- ::lib.schema.metadata/database]
  false)
