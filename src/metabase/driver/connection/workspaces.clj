(ns metabase.driver.connection.workspaces
  (:require
   [metabase.util.log :as log]))

(def ^:private ^:dynamic *swapped-connection-details*
  "A dynamic var that holds a map of database-id -> swapped-details-map for temporarily swapping connection details.
  When a connection spec is created for a database, if its ID is present in this map, the swap map will be
  merged into the connection `:details` before they are used to create a connection.

  This provides a mechanism for temporarily using different connection details (e.g., using alternative credentials
  for workspaces) without mutating the database record.

  The swap map is merged into the database `:details` map. The swap is applied before any connection-specific
  processing (like hash calculation for connection pooling), so different swaps will result in different
  connection pools.

  Different drivers may apply this swap at different points in their connection lifecycle, but the semantics
  are consistent: swapped details are used for the duration of the dynamic scope.

  See [[with-swapped-connection-details]] for usage."
  nil)

(defn- apply-detail-swaps
  "Merges the `swap-map` into `details`. Supports nested maps via deep merge."
  [details swap-map]
  (reduce-kv
   (fn [acc k v]
     (if (and (map? v) (map? (get acc k)))
       (assoc acc k (apply-detail-swaps (get acc k) v))
       (assoc acc k v)))
   details
   swap-map))

(defn has-connection-swap?
  "Returns true if there is an active connection detail swap for `database-id`."
  [database-id]
  (contains? *swapped-connection-details* database-id))

(defn maybe-swap-details
  "Returns the database details with any swaps applied from [[*swapped-connection-details*]].
  If no swap exists for `database-id`, returns `details` unchanged.

  Drivers should call this function when creating connections to apply any active swaps.
  For JDBC drivers, this is called in [[metabase.driver.sql-jdbc.connection/db->pooled-connection-spec]].
  For other drivers (e.g., MongoDB), this should be called in their connection creation logic."
  [database-id details]
  (if-let [swap-map (get *swapped-connection-details* database-id)]
    (do
      (log/debugf "Applying swapped connection details for database %d, swap keys: %s"
                  database-id (keys swap-map))
      (apply-detail-swaps details swap-map))
    details))

(defn do-with-swapped-connection-details
  "Implementation for [[with-swapped-connection-details]]."
  [database-id swap-map thunk]
  (when (contains? *swapped-connection-details* database-id)
    (throw (ex-info "Nested connection detail swaps are not supported for the same database"
                    {:database-id database-id})))
  (log/debugf "Entering swapped connection details scope for database %d, swap keys: %s"
              database-id (keys swap-map))
  (binding [*swapped-connection-details* (assoc *swapped-connection-details* database-id swap-map)]
    (thunk)))

(defmacro with-swapped-connection-details
  "Temporarily swap the connection details for a specific database within the dynamic scope of `body`.

  The `swap-map` is a map of detail keys to swap values. These will be merged into the database's
  connection `:details` map. Nested maps are deep-merged.

  Any code that creates a connection for `database-id` within this scope will use the modified details.

  **Important:** Nested swaps for the same database are not supported and will throw an exception.
  Different databases can have concurrent swaps.

  Example:

    ;; Swap connection to use alternate credentials
    (driver/with-swapped-connection-details 1 {:user \"workspace-user\" :password \"workspace-pass\"}
      ;; All connections created in this scope use the swapped credentials
      (qp/process-query query))"
  {:style/indent 2}
  [database-id swap-map & body]
  `(do-with-swapped-connection-details ~database-id ~swap-map (fn [] ~@body)))
