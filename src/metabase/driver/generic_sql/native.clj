(ns metabase.driver.generic-sql.native
  "The `native` query processor."
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
  (driver/class->base-type (type v)))

(defn process-and-run
  "Process and run a native (raw SQL) QUERY."
  {:arglists '([query])}
  [{{sql :query} :native, database-id :database, :as query}]
  {:pre [(string? sql)
         (integer? database-id)]}
  (log/debug "QUERY: \n"
             (with-out-str (clojure.pprint/pprint (update query :driver class))))
  (try (let [database (sel :one [Database :engine :details] :id database-id)
             db (-> database
                    db->korma-db
                    korma.db/get-connection)
             [columns & [first-row :as rows]] (jdbc/with-db-transaction [conn db :read-only? true]
                                                ;; If timezone is specified in the Query and the driver supports setting the timezone
                                                ;; then execute SQL to set it
                                                (when-let [timezone (or (-> query :native :timezone)
                                                                        (driver/report-timezone))]
                                                  (when (seq timezone)
                                                    (let [{:keys [features timezone->set-timezone-sql]} (driver/engine->driver (:engine database))]
                                                      (when (contains? features :set-timezone)
                                                        (log/debug "Setting timezone to:" timezone)
                                                        (jdbc/db-do-prepared conn (timezone->set-timezone-sql timezone))))))
                                                (jdbc/query conn sql :as-arrays? true))]
         ;; TODO - Why don't we just use annotate?
         {:rows    rows
          :columns columns
          :cols    (map (fn [column first-value]
                          {:name      column
                           :base_type (value->base-type first-value)})
                        columns first-row)})
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second)             ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
