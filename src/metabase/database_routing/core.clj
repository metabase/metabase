(ns metabase.database-routing.core
  "The OSS namespace for database routing."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise with-database-routing-on-fn
  "OSS Version, does nothing"
  metabase-enterprise.database-routing.common
  [f]
  (f))

(defmacro with-database-routing-on
  "Turns database routing on. Access to a Router Database in this block will be an error (unless things are configured
  that way, of course.)"
  [& body]
  `(with-database-routing-on-fn
     (fn []
       ~@body)))

(defenterprise with-database-routing-off-fn
  "OSS version, does nothing"
  metabase-enterprise.database-routing.common
  [f]
  (f))

(defmacro with-database-routing-off
  "Turns database routing off. Access to a destination database within this block will result in an error."
  [& body]
  `(with-database-routing-off-fn
     (fn []
       ~@body)))

(defenterprise with-database-routing-off-if-granted-fn
  "OSS version, does nothing"
  metabase-enterprise.database-routing.common
  [f]
  (f))

(defmacro with-database-routing-off-if-granted
  "Like [[with-database-routing-off]], but a router database is reachable only where an admin has granted it
  anonymous access; otherwise access to it is an error."
  [& body]
  `(with-database-routing-off-if-granted-fn
     (fn []
       ~@body)))

(defenterprise check-allowed-access!
  "OSS version, does nothing"
  metabase-enterprise.database-routing.common
  [_db-or-id-or-spec]
  nil)

(defenterprise delete-associated-database-router!
  "OSS version, does nothing"
  metabase-enterprise.database-routing.models
  [_db-id]
  nil)

(defenterprise db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database."
  metabase-enterprise.database-routing.models
  [_db-or-id]
  false)

(defenterprise refuses-anonymous-access?
  "OSS version, always false: with no routing feature there is no router database, so nothing restricts anonymous
  access."
  metabase-enterprise.database-routing.models
  [_database-id]
  false)
