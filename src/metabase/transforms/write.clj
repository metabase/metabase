(ns metabase.transforms.write
  "Every user-facing write of a Transform: the best-effort checks that are not hook invariants, the statements and
  the tag links."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
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
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(mu/defn check-incremental-table-tag :- :nil
  "Throws a 400 when `transform` writes an incremental table from a native query that has no table variable for the
  incremental range filter, a variable of the table of its checkpoint Field when there is one."
  [{:keys [source target]} :- ::transforms.schema/transform.definition]
  (let [transform {:source source :target target}]
    (when (and (transforms-base.u/incremental-target? transform)
               (transforms-base.u/native-query-transform? transform))
      (let [field-id (get-in source [:source-incremental-strategy :checkpoint-filter-field-id])]
        (when-not (transforms-base.u/table-template-tag-name (:query source)
                                                             (some-> field-id transforms.db/field :table_id))
          (throw (ex-info (tru "Incremental transform with a native query requires a table variable. Please add a table variable to the query and update the checkpoint field.")
                          {:status-code 400}))))))
  nil)

(mu/defn check-cycle :- :nil
  "Throws a 400 when the query transform `transform` is part of a cycle of transforms feeding one another."
  [transform :- :map]
  (when (transforms-base.u/query-transform? transform)
    (when-let [{:keys [cycle-str]} (transforms-base.ordering/get-transform-cycle transform)]
      (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                      {:status-code 400}))))
  nil)

(mu/defn check-references :- :nil
  "Throws a 400 unless what `definition` refers to outside the transform allows it: a target database with the features
  the transform needs and without DB routing, and for the parts the request writes, `written`, a query that
  preprocesses, a target schema where the driver needs one and a checkpoint column and lookback of supported types, the
  rest of the rules on a transform being those of its model hooks."
  [definition :- ::transforms.schema/transform.definition
   written    :- [:set [:enum :source :target]]]
  (let [database (api/check-400 (some-> (transforms-base.i/target-db-id definition) transforms.db/database)
                                (deferred-tru "The target database cannot be found."))]
    (api/check-400 (every? (fn [feature] (driver.u/supports? (:engine database) feature database))
                           (transforms-base.u/required-database-features definition))
                   (deferred-tru "The database does not support the requested transform features."))
    (api/check-400 (not (database-routing/db-routing-enabled? (driver.u/lib-database (:id database))))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled.")))
  (when (transforms-base.u/query-transform? definition)
    (validate-transform-query! definition))
  (when (contains? written :target)
    (validate-target-schema! definition))
  (when (contains? written :source)
    (validate-incremental-column-type! definition))
  (when (seq written)
    (check-incremental-table-tag definition)
    (validate-lookback! definition))
  nil)

(defn- definition-changed?
  "Whether `new` has a source or a target other than that of `old`."
  [old new]
  (not= (select-keys old [:source :target]) (select-keys new [:source :target])))

(defn- written-parts
  "The source and target of a transform that the request `body` writes, as a set."
  [body]
  (into #{} (filter #(contains? body %)) [:source :target]))

(mu/defn check-target-table-free :- :nil
  "Throws a 409 when the table `definition` would write to already exists in the target database."
  [definition :- ::transforms.schema/transform.definition]
  (api/check (not (transforms-base.u/planned-target-table-exists? definition))
             409
             (deferred-tru "A table with that name already exists."))
  nil)

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

(mu/defn update-transform-tags! :- :nil
  "Replace the tags of a transform with `tag-ids` in that order, deleting the links of removed tags, moving those that
  stay and inserting the new ones; duplicate and unknown ids are dropped."
  [transform-id :- [:maybe ::lib.schema.id/transform]
   tag-ids      :- [:sequential ms/PositiveInt]]
  (when transform-id
    (t2/with-transaction [_conn]
      (let [deduped-tag-ids      (vec (distinct tag-ids))
            current-associations (transforms.db/transform-tag-links [transform-id])
            current-tag-ids      (mapv :tag_id current-associations)
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
            new-tag-ids          (if valid-tag-ids
                                   (filterv valid-tag-ids deduped-tag-ids)
                                   [])
            current-set          (set current-tag-ids)
            new-set              (set new-tag-ids)
            to-delete            (set/difference current-set new-set)
            to-insert            (set/difference new-set current-set)
            new-positions        (zipmap new-tag-ids (range))]
        (when (seq to-delete)
          (transforms.db/delete-transform-tag-links! transform-id to-delete))
        (doseq [tag-id (filter current-set new-tag-ids)]
          (transforms.db/set-transform-tag-position! transform-id tag-id (get new-positions tag-id)))
        (when (seq to-insert)
          (transforms.db/insert-transform-tag-links! (for [tag-id to-insert]
                                                       {:transform_id transform-id
                                                        :tag_id       tag-id
                                                        :position     (get new-positions tag-id)})))))
    nil))

(mu/defn create-transform! :- ::transforms.schema/transform
  "Create new transform in the appdb.
   Optionally accepts a creator-id to use instead of the current user."
  ([body :- ::transforms.schema/transform.create]
   (create-transform! body nil))
  ([body       :- ::transforms.schema/transform.create
    creator-id :- [:maybe ::lib.schema.id/user]]
   (let [definition (transforms.u/->definition body)]
     (check-references definition (written-parts body))
     (check-target-table-free definition))
   (let [creator-id (or creator-id api/*current-user-id*)
         transform  (events/with-batched-events
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
                          (update-transform-tags! (:id transform) tag-ids))
                        ;; Return with hydrated tag_ids
                        (t2/hydrate transform :transform_tag_ids :creator :owner :can_read :can_write :can_execute)))]
     transform)))

(mu/defn update-transform! :- ::transforms.schema/transform
  "Update a transform, validating its features, what it refers to and its target conflicts, and return it with its
  associations hydrated."
  [id   :- ::lib.schema.id/transform
   body :- ::transforms.schema/transform.create]
  (let [transform (events/with-batched-events
                    (let [old           (api/read-check :model/Transform id)
                          new           (merge old body)
                          definition    (transforms.u/->definition new)
                          target-fields #(-> % :target (select-keys [:schema :name]))]
                      (api/update-check old body)
                      ;; we must validate on a full transform object
                      (check-feature-enabled! definition)
                      (check-references definition (written-parts body))
                      (when (definition-changed? old new)
                        (check-cycle (dissoc new :tag_ids)))
                      (transforms.db/update-transform! id (dissoc body :tag_ids))
                      (api/check (not (and (not= (target-fields old) (target-fields new))
                                           (transforms-base.u/planned-target-table-exists? new)))
                                 409
                                 (deferred-tru "A table with that name already exists.")))
                    ;; Update tag associations if provided
                    (when (contains? body :tag_ids)
                      (update-transform-tags! id (:tag_ids body)))
                    (t2/hydrate (transforms.db/transform id) :transform_tag_ids :creator :owner :can_read :can_write :can_execute))]
    (-> transform
        transforms.u/add-source-readable)))

(mu/defn reset-checkpoint! :- :nil
  "Clear the stored checkpoint value of the transform with `id`, which the current user must be able to write."
  [id :- ::lib.schema.id/transform]
  (api/write-check :model/Transform id)
  (transforms.db/update-transform! id {:last_checkpoint_value nil})
  nil)

(mu/defn delete-transform! :- :nil
  "Delete a transform."
  [transform :- ::transforms.schema/transform]
  (transforms.db/delete-transform! (:id transform))
  nil)

(mu/defn delete-transforms-folder! :- :nil
  "Delete the transforms folder `collection`, its subfolders and every Transform in them. With `delete-tables?`,
  drop the output table of each Transform first. Throws a 400 unless `collection` is in the transforms namespace,
  and a 403 unless the current user can write the folder, every subfolder and every Transform inside; nothing is
  deleted then. Returns nil."
  [collection     :- :metabase.collections.schema/collection
   delete-tables? :- :boolean]
  (api/check-400 (= collections/transforms-ns (:namespace collection))
                 (deferred-tru "Only a transforms folder can be deleted this way."))
  (let [collection-ids (cons (:id collection) (collections/descendant-ids collection))
        folders        (transforms.db/collections-by-ids collection-ids)
        transforms     (transforms.db/transforms-in-collections collection-ids)]
    ;; The delete removes every subfolder, so it needs write permission on each of them, as an archive does.
    (run! api/write-check folders)
    ;; Write permission on the folder does not cover its Transforms: theirs comes from the databases they read and
    ;; write, and from the premium feature of their type.
    (run! api/write-check transforms)
    ;; Drop the tables before the transaction, in the order of the single delete in the frontend (table, then
    ;; transform). A failed drop stops the delete with every Transform row in place, so the user can retry; the tables
    ;; dropped before it stay dropped. `delete-target-table!` needs the Transform row to find its target.
    (when delete-tables?
      (run! transforms-base.u/delete-target-table! transforms))
    (t2/with-transaction [_]
      ;; One delete per Transform, so each one publishes its delete events. The Collection `before-delete` hook
      ;; deletes the subfolders.
      (run! delete-transform! transforms)
      (transforms.db/delete-collection! (:id collection)))
    nil))
