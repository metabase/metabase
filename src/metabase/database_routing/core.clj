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
  "Turns database routing off. Access to a mirror database within this block will result in an error."
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
  metabase-enterprise.database-routing.model
  [_db-id]
  nil)
