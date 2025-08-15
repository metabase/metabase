(ns metabase.database-routing.core
  "The OSS namespace for database routing."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defenterprise with-database-routing-on-fn
  "OSS Version, does nothing"
  metabase-enterprise.database-routing.common
  [f]
  (f))

(defenterprise route-database
  "OSS version throws an error. Enterprise version hooks them up."
  metabase-enterprise.database-routing.common
  [_parent-id _destinations _options]
  (throw (ex-info (deferred-tru "Database routing is not enabled") {})))

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

(defenterprise check-allowed-access!
  "OSS version, does nothing"
  metabase-enterprise.database-routing.common
  [_db-or-id-or-spec]
  nil)

(defenterprise delete-associated-database-router!
  "OSS version, does nothing"
  metabase-enterprise.database-routing.common
  [_db-id routing-info]
  ;; todo: should this throw?
  nil)

(defenterprise delete-all-database-routing!
  "Delete any and all database routing information, usually because you are deleting the database."
  metabase-enterprise.database-routing.common
  [_db-id]
  nil)

(defenterprise create-or-update-router
  "OSS version, errors"
  metabase-enterprise.database-routing.common
  [_db-id route-info]
  ;; todo: should this throw?
  nil)

(defenterprise router-enabled?
  "OSS version returns false"
  metabase-enterprise.database-routing.common
  [_db-id route-info]
  false)
