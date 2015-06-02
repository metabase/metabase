(ns metabase.driver.generic-sql.native
  "The `native` query processor."
  (:import com.metabase.corvus.api.ApiException)
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (korma [core :as korma]
                   db)
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql.util :refer :all]
            [metabase.models.database :refer [Database]]))

(def ^:dynamic *timezone->set-timezone-sql*
  " This function is called whenever `timezone` is specified in a native query, at the beginning of
   the DB transaction.

   If implemented, it should take a timestamp like `\"US/Pacific\"` and return a SQL
   string that can be executed to set the timezone within the context of a transaction,
   e.g. `\"SET LOCAL timezone to 'US/Pacific'\"`.

   Because not all DB engines support timestamps (e.g., H2), the default implementation is a no-op.
   Engines that *do* support timestamps (e.g., Postgres) should override this function."
  (fn [_]))

(defn- value->base-type
  "Attempt to match a value we get back from the DB with the corresponding base-type`."
  [v]
  (if-not v :UnknownField
          (or (driver/class->base-type (type v))
              (do (log/warn (format "Missing base type mapping for %s in driver/class->base-type. Please add an entry."
                                    (str (type v))))
                  :UnknownField))))

(defn process-and-run
  "Process and run a native (raw SQL) QUERY."
  {:arglists '([query])}
  [{{sql :query} :native
    database-id :database :as query}]
  {:pre [(string? sql)
         (integer? database-id)]}
  (log/debug "QUERY: \n"
             (with-out-str (clojure.pprint/pprint query)))
  (try (let [database (sel :one Database :id database-id)
             db (-> database
                    db->korma-db
                    korma.db/get-connection)
             [columns & [first-row :as rows]] (jdbc/with-db-transaction [conn db :read-only? true]
                                                ;; If timezone is specified in the Query and the driver supports setting the timezone then execute SQL to set it
                                                (when-let [timezone (or (-> query :native :timezone)
                                                                        (-> @(:organization database) :report_timezone))]
                                                  (when-let [set-timezone-sql (*timezone->set-timezone-sql* timezone)]
                                                    (log/debug "Setting timezone to:" timezone)
                                                    (jdbc/db-do-prepared conn set-timezone-sql)))
                                                (jdbc/query conn sql :as-arrays? true))]
         {:rows rows
          :columns columns
          :cols (map (fn [column first-value]
                       {:name       column
                        :base_type  (value->base-type first-value)
                        :field_type :info})
                     columns first-row)})
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second)             ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
