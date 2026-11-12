(ns metabase.transforms.crud
  "CRUD operations for transforms. Extracted from `metabase.transforms-rest.api.transform`
   so that non-REST modules (e.g. metabot-v3) can use them without depending
   on the `-rest` module."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.models.transform :as transform.model]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn check-database-feature :- :nil
  "Check that the target database supports the required features for this transform."
  [transform :- ::transforms.schema/transform.definition]
  (let [database (api/check-400 (transforms.db/database (transforms-base.i/target-db-id transform))
                                (deferred-tru "The target database cannot be found."))
        features (transforms-base.u/required-database-features transform)]
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
                   (deferred-tru "The database does not support the requested transform features."))
    (api/check-400 (not (database-routing/db-routing-enabled? (driver.u/lib-database (:id database))))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled."))
    nil))

(mu/defn check-feature-enabled! :- :nil
  "Check that the premium features required for this transform type are enabled."
  [transform :- ::transforms.schema/transform.definition]
  (api/check (transforms.u/check-feature-enabled transform)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")])
  nil)

(mu/defn validate-transform-query! :- :nil
  "Validate that the transform query is valid. Throws a 400 error if validation fails."
  [transform :- ::transforms.schema/transform.definition]
  (when-let [error (transforms-base.u/validate-transform-query transform)]
    (throw (ex-info (:error error)
                    (assoc error
                           :status-code 400)))))

(mu/defn validate-target-schema! :- :nil
  "Require a non-blank `:target.schema` when the target database supports schemas.

  On schemas-supporting drivers a nil schema makes post-run sync miss the physical table
  and leaves the Metabase table with zero fields."
  [transform :- ::transforms.schema/transform.definition]
  (let [db-id (transforms-base.i/target-db-id transform)
        db    (transforms.db/database db-id)]
    (when (and db (driver.u/supports? (:engine db) :schemas db))
      (api/check-400 (not (str/blank? (get-in transform [:target :schema])))
                     (deferred-tru "A target schema is required for this database.")))
    nil))

(mu/defn- field->column :- :metabase.transforms-base.schema/column-types
  "Adapt a t2 Field row to the kebab-case column shape `lib.types.isa` predicates expect."
  [field :- :metabase.warehouse-schema.schema/field]
  {:base-type (:base_type field), :effective-type (:effective_type field)})

(mu/defn validate-incremental-column-type! :- :nil
  "Validates that the checkpoint column for an incremental transform has a supported type.

  Resolves the field by ID and checks that its base-type is numeric or temporal.
  Throws a 400 error if the field cannot be found or its type is not supported."
  [{:keys [source] :as transform} :- ::transforms.schema/transform.definition]
  (when (transforms-base.u/checkpoint-source? transform)
    (let [checkpoint-filter-field-id (get-in source [:source-incremental-strategy :checkpoint-filter-field-id])
          field (transforms.db/field checkpoint-filter-field-id)]
      (api/check-400 field (deferred-tru "Checkpoint field not found."))
      (let [column (field->column field)]
        (api/check-400 (transforms-base.u/supported-checkpoint-column? column)
                       (deferred-tru "Checkpoint column ''{0}'' has unsupported type {1}. Only numeric and temporal columns are supported for incremental filtering."
                                     (:name field)
                                     (pr-str (lib.types.isa/column-type column)))))))
  nil)

(mu/defn validate-lookback! :- :nil
  "Validates a configured lookback window: only date and datetime checkpoint columns support one
  (time-only columns wrap at midnight), and date-only columns need a day-or-coarser unit."
  [{:keys [source] :as transform} :- ::transforms.schema/transform.definition]
  (let [{:keys [lookback checkpoint-filter-field-id]} (:source-incremental-strategy source)]
    (when-let [{:keys [unit]} (and (transforms-base.u/checkpoint-source? transform) lookback)]
      (when-let [field (transforms.db/field checkpoint-filter-field-id)]
        (let [column (field->column field)]
          (api/check-400 (lib.types.isa/date-or-datetime? column)
                         (deferred-tru "A lookback window is only supported for date or datetime checkpoint columns."))
          (when (lib.types.isa/date-without-time? column)
            (api/check-400 (contains? #{"day" "week" "month" "quarter" "year"} unit)
                           (deferred-tru "A lookback window on a date checkpoint column must use days or a coarser unit.")))))))
  nil)

(mu/defn validate-incremental-table-tag! :- :nil
  "Reject a table-incremental native-query transform whose source query has no table template tag for
  the incremental range filter to target.

  Without that table variable the incremental filter has nowhere to be injected, so the transform is
  in a broken state. This surfaces the error eagerly at create/update time instead of only when the
  transform is run."
  [transform :- ::transforms.schema/transform.definition]
  (when (and (transforms-base.u/incremental-target? transform)
             (transforms-base.u/native-query-transform? transform))
    (api/check-400 (transforms-base.u/incremental-table-tag-name transform)
                   (deferred-tru "Incremental transform with a native query requires a table variable. Please add a table variable to the query and update the checkpoint field."))
    nil))

(mu/defn get-transforms :- [:sequential ::transforms.schema/transform]
  "Get a list of transforms."
  [& {:keys [last-run-start-time last-run-statuses tag-ids database-id]}
   :- [:maybe [:map {:closed true}
               [:last-run-start-time {:optional true} [:maybe ms/NonBlankString]]
               [:last-run-statuses   {:optional true} [:maybe [:sequential [:enum "started" "succeeded" "failed" "timeout"]]]]
               [:tag-ids             {:optional true} [:maybe [:sequential ms/IntGreaterThanOrEqualToZero]]]
               [:database-id         {:optional true} [:maybe ms/PositiveInt]]]]]
  (let [enabled-types (transforms.gating/enabled-source-types-for-user)]
    (api/check-403 (seq enabled-types))
    (let [transforms (transforms.db/transforms-of-source-types enabled-types database-id)]
      (->> (t2/hydrate transforms :last_run :transform_tag_ids :creator :owner :can_read :can_write :can_execute)
           (into []
                 (comp (transforms-base.u/->date-field-filter-xf [:last_run :start_time] last-run-start-time)
                       (transforms-base.u/->status-filter-xf [:last_run :status] last-run-statuses)
                       (transforms-base.u/->tag-filter-xf [:tag_ids] tag-ids)
                       (map transforms.u/add-source-readable)))))))

(mu/defn requestable-indexes :- [:maybe ::transforms.schema/requestable-indexes]
  "The index methods the target db's driver can create on `transform`'s target table, or nil when none are available."
  [transform :- ::transforms.schema/transform.definition]
  (when-let [db-id (transforms-base.i/target-db-id transform)]
    (when-let [database (when (transforms.db/database-exists? db-id)
                          (driver.u/lib-database db-id))]
      (let [methods (try
                      (driver/supported-index-methods (:engine database) database)
                      (catch Throwable e
                        (log/warn "Failed to fetch supported index methods for transform" (:id transform) (ex-message e))
                        nil))]
        (not-empty methods)))))

(mu/defn get-transform :- ::transforms.schema/transform
  "Get a specific transform."
  [id :- ::lib.schema.id/transform]
  (let [{:keys [target] :as transform} (api/read-check :model/Transform id)
        target-table (transforms-base.u/target-table (transforms-base.i/target-db-id transform) target :active true)]
    (-> transform
        (t2/hydrate :last_run :transform_tag_ids :creator :owner :can_read :can_write :can_execute)
        (assoc :table target-table)
        transforms.u/add-source-readable)))

(mu/defn create-transform! :- ::transforms.schema/transform
  "Create new transform in the appdb.
   Optionally accepts a creator-id to use instead of the current user."
  ([body :- ::transforms.schema/transform.create]
   (create-transform! body nil))
  ([body       :- ::transforms.schema/transform.create
    creator-id :- [:maybe ::lib.schema.id/user]]
   (let [definition (transforms.u/->definition body)]
     (when (transforms-base.u/query-transform? definition)
       (validate-transform-query! definition))
     (validate-target-schema! definition)
     (validate-incremental-table-tag! definition)
     (validate-lookback! definition))
   (let [creator-id (or creator-id api/*current-user-id*)
         transform  (t2/with-transaction [_]
                      (let [tag-ids       (:tag_ids body)
                            ;; Set owner_user_id to current user if not explicitly provided
                            owner-user-id (when-not (:owner_email body)
                                            (or (:owner_user_id body) creator-id))
                            transform     (transforms.db/insert-transform!
                                           (assoc (select-keys body [:name :description :source :target :run_trigger
                                                                     :collection_id :owner_email])
                                                  :creator_id creator-id
                                                  :owner_user_id owner-user-id))]
                        ;; Add tag associations if provided
                        (when (seq tag-ids)
                          (transform.model/update-transform-tags! (:id transform) tag-ids))
                        ;; Return with hydrated tag_ids
                        (t2/hydrate transform :transform_tag_ids :creator :owner :can_read :can_write :can_execute)))]
     (events/publish-event! :event/transform-create {:object transform :user-id creator-id})
     transform)))

(mu/defn update-transform! :- ::transforms.schema/transform
  "Update a transform. Validates features, database support, cycles, and target conflicts.
   Returns the updated transform with hydrated associations."
  [id   :- ::lib.schema.id/transform
   body :- ::transforms.schema/transform.create]
  (let [transform (t2/with-transaction [_]
                    ;; Cycle detection should occur within the transaction to avoid race
                    (let [old           (api/read-check :model/Transform id)
                          new           (merge old body)
                          definition    (transforms.u/->definition new)
                          target-fields #(-> % :target (select-keys [:schema :name]))]
                      (api/update-check old body)
                      ;; we must validate on a full transform object
                      (check-feature-enabled! definition)
                      (check-database-feature definition)
                      (when (contains? body :target)
                        (validate-target-schema! definition))
                      (when (contains? body :source)
                        (validate-incremental-column-type! definition))
                      (when (or (contains? body :source) (contains? body :target))
                        (validate-incremental-table-tag! definition)
                        (validate-lookback! definition))
                      (when (transforms-base.u/query-transform? old)
                        (validate-transform-query! definition)
                        (when-let [{:keys [cycle-str]} (transforms-base.ordering/get-transform-cycle new)]
                          (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                                          {:status-code 400}))))
                      (api/check (not (and (not= (target-fields old) (target-fields new))
                                           (transforms-base.u/planned-target-table-exists? new)))
                                 409
                                 (deferred-tru "A table with that name already exists.")))
                    (transforms.db/update-transform! id (dissoc body :tag_ids))
                    ;; Update tag associations if provided
                    (when (contains? body :tag_ids)
                      (transform.model/update-transform-tags! id (:tag_ids body)))
                    (t2/hydrate (transforms.db/transform id) :transform_tag_ids :creator :owner :can_read :can_write :can_execute))]
    (events/publish-event! :event/transform-update {:object transform :user-id api/*current-user-id*})
    (-> transform
        transforms.u/add-source-readable)))

(mu/defn delete-transform! :- :nil
  "Delete a transform and publish the delete event."
  [transform :- ::transforms.schema/transform]
  (transforms.db/delete-transform! (:id transform))
  (events/publish-event! :event/transform-delete
                         {:object transform
                          :user-id api/*current-user-id*})
  nil)
