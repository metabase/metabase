(ns metabase-enterprise.advanced-permissions.driver.impersonation
  (:require
   [metabase.driver :as driver]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defenterprise set-role-if-supported!
  "Executes a `USE ROLE` or similar statement on the given connection, if connection impersonation is enabled for the
  given driver. For these drivers, the role is set to either the default role, or to a specific role configured for
  the current user, depending on the connection impersonation settings. This is a no-op for databases that do not
  support connection impersonation, or for non-EE instances."
  :feature :advanced-permissions
  [driver ^Connection conn database]
  (when (driver/database-supports? driver :connection-impersonation database)
    (try
      (let [default-role (qp.util/default-database-role driver database)
            sql          (qp.util/set-role-statement driver default-role)]
        (with-open [stmt (.createStatement conn)]
          (.execute stmt sql)))
      (catch Throwable e
        (log/debug e (trs "Error setting role on connection"))
        (throw e)))))
