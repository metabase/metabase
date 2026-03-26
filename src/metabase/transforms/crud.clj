(ns metabase.transforms.crud
  "CRUD operations for transforms. Extracted from `metabase.transforms-rest.api.transform`
   so that non-REST modules (e.g. metabot-v3, workspaces) can use them without depending
   on the `-rest` module."
  (:require
   [metabase.api.common :as api]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.transforms.transform :as transform.model]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn check-database-feature
  "Check that the target database supports the required features for this transform."
  [transform]
  (let [database (api/check-400 (t2/select-one :model/Database (transforms-base.i/target-db-id transform))
                                (deferred-tru "The target database cannot be found."))
        features (transforms-base.u/required-database-features transform)]
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
  (api/check (transforms.u/check-feature-enabled transform)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")]))

(defn validate-transform-query!
  "Validate that the transform query is valid. Throws a 400 error if validation fails."
  [transform]
  (when-let [error (transforms-base.u/validate-transform-query transform)]
    (throw (ex-info (:error error)
                    (assoc error
                           :status-code 400)))))

(defn validate-incremental-column-type!
  "Validates that the checkpoint column for an incremental transform has a supported type.

  Resolves the field by ID and checks that its base-type is numeric or temporal.
  Throws a 400 error if the field cannot be found or its type is not supported."
  [{:keys [source]}]
  (when-let [{:keys [checkpoint-filter-field-id] strategy-type :type}
             (:source-incremental-strategy source)]
    (when (= "checkpoint" strategy-type)
      (let [field (t2/select-one :model/Field checkpoint-filter-field-id)]
        (api/check-400 field (deferred-tru "Checkpoint field not found."))
        (api/check-400 (transforms-base.u/supported-incremental-filter-type? (:base_type field))
                       (deferred-tru "Checkpoint column ''{0}'' has unsupported type {1}. Only numeric and temporal columns are supported for incremental filtering."
                                     (:name field)
                                     (pr-str (:base_type field))))))))

(defn get-transforms
  "Get a list of transforms."
  [& {:keys [last-run-start-time last-run-statuses tag-ids]}]
  (let [enabled-types (transforms.u/enabled-source-types-for-user)]
    (api/check-403 (seq enabled-types))
    (let [transforms (t2/select :model/Transform {:where    [:in :source_type enabled-types]
                                                  :order-by [[:id :asc]]})]
      (->> (t2/hydrate transforms :last_run :transform_tag_ids :creator :owner)
           (into []
                 (comp (transforms-base.u/->date-field-filter-xf [:last_run :start_time] last-run-start-time)
                       (transforms-base.u/->status-filter-xf [:last_run :status] last-run-statuses)
                       (transforms-base.u/->tag-filter-xf [:tag_ids] tag-ids)
                       (map #(update % :last_run transforms-base.u/localize-run-timestamps))
                       (map transforms.u/add-source-readable)))))))

(defn get-transform
  "Get a specific transform."
  [id]
  (let [{:keys [target] :as transform} (api/read-check :model/Transform id)
        target-table (transforms-base.u/target-table (transforms-base.i/target-db-id transform) target :active true)]
    (-> transform
        (t2/hydrate :last_run :transform_tag_ids :creator :owner)
        (u/update-some :last_run transforms-base.u/localize-run-timestamps)
        (assoc :table target-table)
        transforms.u/add-source-readable)))

(defn create-transform!
  "Create new transform in the appdb.
   Optionally accepts a creator-id to use instead of the current user (for workspace merges)."
  ([body]
   (create-transform! body nil))
  ([body creator-id]
   (when (transforms-base.u/query-transform? body)
     (validate-transform-query! body))
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
                          (transform.model/update-transform-tags! (:id transform) tag-ids))
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
                      (when (transforms-base.u/query-transform? old)
                        (validate-transform-query! new)
                        (when-let [{:keys [cycle-str]} (transforms-base.ordering/get-transform-cycle new)]
                          (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                                          {:status-code 400}))))
                      (api/check (not (and (not= (target-fields old) (target-fields new))
                                           (transforms-base.u/target-table-exists? new)))
                                 403
                                 (deferred-tru "A table with that name already exists.")))
                    (t2/update! :model/Transform id (dissoc body :tag_ids))
                    ;; Update tag associations if provided
                    (when (contains? body :tag_ids)
                      (transform.model/update-transform-tags! id (:tag_ids body)))
                    (t2/hydrate (t2/select-one :model/Transform id) :transform_tag_ids :creator :owner))]
    (events/publish-event! :event/transform-update {:object transform :user-id api/*current-user-id*})
    (-> transform
        transforms.u/add-source-readable)))

(defn delete-transform!
  "Delete a transform and publish the delete event."
  [transform]
  (t2/delete! :model/Transform (:id transform))
  (events/publish-event! :event/transform-delete
                         {:object transform
                          :user-id api/*current-user-id*})
  nil)
