(ns metabase-enterprise.advanced-permissions.query-processor.middleware.impersonation
  (:require [metabase.driver :as driver]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.util :as qp.util]))

;; 1. Check that the driver supports connection impersonation
;; 2. If it does, fetch the role to be used for the current user, and the default role
;; 3. Generate the role statements for the database
;; 4. Add the role statements to the compiled native query
;; 5. Add a count or flag somewhere indicating that 3 statements are expected?

(defn- get-role-statements
  "Generates the role statements to be added to the query"
  []
  (let [impersonation-role      "marketing"
        default-role            "ACCOUNTADMIN"
        impersonation-role-stmt (qp.util/set-role-statement driver/*driver* impersonation-role)
        default-role-stmt       (qp.util/set-role-statement driver/*driver* default-role)]
    [impersonation-role-stmt default-role-stmt]))

(defn maybe-change-role
  "Middleware for queries that should be run with the database role temporarily changed. For these queries, USE ROLE
  statements (or equivalent) are prepended and appended to the compiled query to change the role and then reset it to
  the default role after the query is run."
  [qp]
  (fn [query rff context]
    (if (driver/database-supports? driver/*driver* :connection-impersonation (qp.store/database))
      (let [[pre-stmt post-stmt] (get-role-statements)]
        (qp
         (update-in query [:native :query] #(str pre-stmt % ";" post-stmt))
         rff
         context))
      (qp query rff context))))
