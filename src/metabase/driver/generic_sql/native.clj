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
                                                  (when-let [timezone->set-timezone-sql (:timezone->set-timezone-sql (driver/database-id->driver database-id))]
                                                    (log/debug "Setting timezone to:" timezone)
                                                    (jdbc/db-do-prepared conn (timezone->set-timezone-sql timezone))))
                                                (jdbc/query conn sql :as-arrays? true))]
         {:rows rows
          :columns columns
          :cols (map (fn [column first-value]
                       {:name column
                        :base_type (value->base-type first-value)})
                     columns first-row)})
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second)             ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
