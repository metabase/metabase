(ns metabase.transforms.crud
  "CRUD operations for transforms. Extracted from `metabase.transforms-rest.api.transform`
   so that non-REST modules (e.g. metabot-v3, workspaces) can use them without depending
   on the `-rest` module."
  (:require
   [metabase.api.common :as api]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.transforms.transform :as models.transform]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.ordering :as transforms.ordering]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql PreparedStatement)))

(set! *warn-on-reflection* true)

(defn python-source-table-ref->table-id
  "Change source of python transform from name->table-ref to name->table-id.

  We now supported table-ref as source but since FE is still expecting table-id we need to temporarily do this.
  Should update FE to fully use table-ref"
  [transform]
  (if (transforms.util/python-transform? transform)
    (update-in transform [:source :source-tables]
               (fn [source-tables]
                 (update-vals source-tables #(if (int? %) % (:table_id %)))))
    transform))

(defn check-database-feature
  "Check that the target database supports the required features for this transform."
  [transform]
  (let [database (api/check-400 (t2/select-one :model/Database (transforms.i/target-db-id transform))
                                (deferred-tru "The target database cannot be found."))
        features (transforms.util/required-database-features transform)]
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
                   (deferred-tru "The database does not support the requested transform features."))
    (api/check-400 (not (database-routing/db-routing-enabled? database))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled."))))

(defn check-feature-enabled!
  "Check that the premium features required for this transform type are enabled."
  [transform]
  (api/check (transforms.util/check-feature-enabled transform)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")]))

(defn extract-all-columns-from-query
  "Extracts column metadata (name and type) from a query.

  Returns a sequence of maps with `:name` and `:base_type` keys, or nil if extraction fails.

  The query is first compiled to native SQL, then uses PreparedStatement.getMetaData()
  to inspect the query structure. This works for most modern JDBC drivers but may not
  be supported by all drivers or for all query types."
  [driver database-id query]
  (try
    (let [{:keys [query]} (qp.compile/compile query)]
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       database-id
       {}
       (fn [conn]
         (with-open [^PreparedStatement stmt (sql-jdbc.execute/prepared-statement driver conn query [])]
           (when-let [rsmeta (.getMetaData stmt)]
             (seq (sql-jdbc.execute/column-metadata driver rsmeta)))))))
    (catch Exception e
      (log/debugf e "Failed to extract columns from query: %s" (ex-message e))
      nil)))

(defn extract-incremental-filter-columns-from-query
  "Extracts column names suitable for incremental transform checkpoint filtering.

  This function is specifically for incremental transform checkpoint column selection.
  It only returns columns with types supported for checkpoint filtering:
  - Temporal types (timestamp, timestamp with timezone)
  - Numeric types (integer, float, decimal)

  Text, boolean, and other types are filtered out as they are not supported for
  incremental checkpointing.

  Returns a vector of column names (as strings), or nil if extraction fails.

  The query is first compiled to native SQL, then uses PreparedStatement.getMetaData()
  to inspect the query structure. This works for most modern JDBC drivers but may not
  be supported by all drivers or for all query types."
  [driver database-id query]
  (some->> (extract-all-columns-from-query driver database-id query)
           (filter (comp transforms.util/supported-incremental-filter-type? :base_type))
           (mapv :name)))

(defn validate-incremental-column-type!
  "Validates that the checkpoint column for an incremental transform has a supported type.

  For MBQL/Python transforms, resolves the column from the query using the unique key.
  For native queries, extracts columns from the query and checks the checkpoint-filter column.

  Throws a 400 error if the column type is not supported or cannot be resolved."
  [{:keys [source]}]
  (when-let [{:keys [checkpoint-filter checkpoint-filter-unique-key] strategy-type :type}
             (:source-incremental-strategy source)]
    (when (and (= :query (:type source)) (= "checkpoint" strategy-type))
      (let [{:keys [query]} source
            database-id (:database query)
            database    (api/check-404 (t2/select-one :model/Database :id database-id))
            driver-name (driver/the-initialized-driver (:engine database))]
        (cond
          ;; For MBQL, resolve column from query metadata
          checkpoint-filter-unique-key
          (let [column (lib/column-with-unique-key query checkpoint-filter-unique-key)]
            (api/check-400 column (deferred-tru "Checkpoint column not found in query."))
            (api/check-400 (transforms.util/supported-incremental-filter-type? (:base-type column))
                           (deferred-tru "Checkpoint column type {0} is not supported. Only numeric and temporal types are supported for incremental filtering."
                                         (pr-str (:base-type column)))))

          ;; For native query with checkpoint-filter, validate type if we can extract the column metadata
          checkpoint-filter
          (when-some [column-metadata (seq (extract-all-columns-from-query driver-name database-id query))]
            (when-some [column (first (filter #(= checkpoint-filter (:name %)) column-metadata))]
              (api/check-400 (transforms.util/supported-incremental-filter-type? (:base_type column))
                             (deferred-tru "Checkpoint column ''{0}'' has unsupported type {1}. Only numeric and temporal columns are supported for incremental filtering."
                                           checkpoint-filter
                                           (pr-str (:base_type column)))))))))))

(defn get-transforms
  "Get a list of transforms."
  [& {:keys [last_run_start_time last_run_statuses tag_ids]}]
  (let [enabled-types (transforms.util/enabled-source-types-for-user)]
    (api/check-403 (seq enabled-types))
    (let [transforms (t2/select :model/Transform {:where    [:in :source_type enabled-types]
                                                  :order-by [[:id :asc]]})]
      (->> (t2/hydrate transforms :last_run :transform_tag_ids :creator :owner)
           (into []
                 (comp (transforms.util/->date-field-filter-xf [:last_run :start_time] last_run_start_time)
                       (transforms.util/->status-filter-xf [:last_run :status] last_run_statuses)
                       (transforms.util/->tag-filter-xf [:tag_ids] tag_ids)
                       (map #(update % :last_run transforms.util/localize-run-timestamps))
                       (map python-source-table-ref->table-id)))
           transforms.util/add-source-readable))))

(defn get-transform
  "Get a specific transform."
  [id]
  (let [{:keys [target] :as transform} (api/read-check :model/Transform id)
        target-table (transforms.util/target-table (transforms.i/target-db-id transform) target :active true)]
    (-> transform
        (t2/hydrate :last_run :transform_tag_ids :creator :owner)
        (u/update-some :last_run transforms.util/localize-run-timestamps)
        (assoc :table target-table)
        python-source-table-ref->table-id
        transforms.util/add-source-readable)))

(defn create-transform!
  "Create new transform in the appdb.
   Optionally accepts a creator-id to use instead of the current user (for workspace merges)."
  ([body]
   (create-transform! body nil))
  ([body creator-id]
   (let [creator-id (or creator-id api/*current-user-id*)
         transform  (t2/with-transaction [_]
                      (let [tag-ids       (:tag_ids body)
                            ;; Set owner_user_id to current user if not explicitly provided
                            owner-user-id (when-not (:owner_email body)
                                            (or (:owner_user_id body) creator-id))
                            transform     (t2/insert-returning-instance!
                                           :model/Transform
                                           (assoc (select-keys body [:name :description :source :target :run_trigger
                                                                     :collection_id :owner_email])
                                                  :creator_id creator-id
                                                  :owner_user_id owner-user-id))]
                        ;; Add tag associations if provided
                        (when (seq tag-ids)
                          (models.transform/update-transform-tags! (:id transform) tag-ids))
                        ;; Return with hydrated tag_ids
                        (t2/hydrate transform :transform_tag_ids :creator :owner)))]
     (events/publish-event! :event/transform-create {:object transform :user-id creator-id})
     transform)))

(defn update-transform!
  "Update a transform. Validates features, database support, cycles, and target conflicts.
   Returns the updated transform with hydrated associations."
  [id body]
  (let [transform (t2/with-transaction [_]
                    ;; Cycle detection should occur within the transaction to avoid race
                    (let [old (t2/select-one :model/Transform id)
                          new (merge old body)
                          target-fields #(-> % :target (select-keys [:schema :name]))]
                      (api/check-403 (and (mi/can-write? old) (mi/can-write? new)))

                      ;; we must validate on a full transform object
                      (check-feature-enabled! new)
                      (check-database-feature new)
                      (validate-incremental-column-type! new)
                      (when (transforms.util/query-transform? old)
                        (when-let [{:keys [cycle-str]} (transforms.ordering/get-transform-cycle new)]
                          (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                                          {:status-code 400}))))
                      (api/check (not (and (not= (target-fields old) (target-fields new))
                                           (transforms.util/target-table-exists? new)))
                                 403
                                 (deferred-tru "A table with that name already exists.")))
                    (t2/update! :model/Transform id (dissoc body :tag_ids))
                    ;; Update tag associations if provided
                    (when (contains? body :tag_ids)
                      (models.transform/update-transform-tags! id (:tag_ids body)))
                    (t2/hydrate (t2/select-one :model/Transform id) :transform_tag_ids :creator :owner))]
    (events/publish-event! :event/transform-update {:object transform :user-id api/*current-user-id*})
    (-> transform
        python-source-table-ref->table-id
        transforms.util/add-source-readable)))

(defn delete-transform!
  "Delete a transform and publish the delete event."
  [transform]
  (t2/delete! :model/Transform (:id transform))
  (events/publish-event! :event/transform-delete
                         {:object transform
                          :user-id api/*current-user-id*})
  nil)
