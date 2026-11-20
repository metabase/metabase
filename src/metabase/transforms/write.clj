(ns metabase.transforms.write
  "The write functions of Transforms, transform jobs and transform tags, through which every writer creates, updates
  and deletes them, and the shared functions the REST API and the enterprise replacement endpoint call, extracted from
  `metabase.transforms-rest.api.transform` so that non-REST modules can use them without depending on the `-rest`
  module. The run models are written by [[metabase.transforms.run-write]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.schedule :as transforms.schedule]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

(defn- row-or-select
  "`row-or-id`, or the row `select` loads when it is an id."
  [row-or-id select]
  (if (map? row-or-id) row-or-id (select row-or-id)))

;;; ---------------------------------------------------- Checks -----------------------------------------------------

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

(defn check-incremental-table-tag
  "Throws a 400 when `transform` writes an incremental table from a native query that has no table variable for the
  incremental range filter, a variable of the table of its checkpoint Field when there is one."
  [{:keys [source target]}]
  (let [transform {:source source :target target}]
    (when (and (transforms-base.u/incremental-target? transform)
               (transforms-base.u/native-query-transform? transform))
      (let [field-id (get-in source [:source-incremental-strategy :checkpoint-filter-field-id])]
        (when-not (transforms-base.u/table-template-tag-name (:query source)
                                                             (some-> field-id transforms.db/field :table_id))
          (throw (ex-info (tru "Incremental transform with a native query requires a table variable. Please add a table variable to the query and update the checkpoint field.")
                          {:status-code 400})))))))

(mu/defn check-references :- :nil
  "Throws a 400 unless what `definition` refers to outside the transform allows it: a target database with the features
  the transform needs and without DB routing, and for the parts the request writes, `written`, a query that
  preprocesses, a target schema where the driver needs one and a checkpoint column and lookback of supported types, the
  rest of the rules on a transform being those of its write functions."
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

;;; ------------------------------------------------- Transform rows -------------------------------------------------

(defn check-collection
  "Throws unless the Collection of `transform`, if any, can hold Transforms."
  [{:keys [collection_id]}]
  (when collection_id
    (collection/check-collection-namespace :model/Transform collection_id)
    (collection/check-allowed-content :model/Transform collection_id)))

(defn- source-database-id
  "The Database id the source of `transform` names, or nil when it names none, as a Python source without a
  `:source-database` does."
  [transform]
  (transforms-base.i/source-db-id (dissoc transform :target_db_id)))

(defn- derived-columns
  "The columns of `transform` computed from its source and target, whatever values it came with: `source_database_id`
  only when the source names a Database, else it is the caller's."
  [{:keys [source] :as transform}]
  (let [transform (dissoc transform :target_db_id)]
    (cond-> {:source_type  (transforms-base.u/transform-source-type source)
             :target_db_id (transforms-base.i/target-db-id transform)}
      (source-database-id transform) (assoc :source_database_id (source-database-id transform)))))

(defn- check-target-database
  "Throws a 400 unless the target Database of `transform` can hold the tables of a transform."
  [{:keys [target_db_id]}]
  (when target_db_id
    (let [database (transforms.db/database target_db_id)]
      (when-not database
        (throw (ex-info (tru "The target database cannot be found.") {:status-code 400})))
      (when (:is_sample database)
        (throw (ex-info (tru "Cannot run transforms on the sample database.") {:status-code 400})))
      (when (:is_audit database)
        (throw (ex-info (tru "Cannot run transforms on audit databases.") {:status-code 400})))
      (when (:router_database_id database)
        (throw (ex-info (tru "Cannot run transforms on a destination database of database routing.") {:status-code 400}))))))

(defn check-and-derive-definition
  "`transform`, whose source or target is being written, with the columns computed from them, after checking that the
  target Database can hold them."
  [transform]
  (let [transform (merge transform (derived-columns transform))]
    (check-target-database transform)
    transform))

(defn- check-cycle
  "Throws a 400 when the query transform `transform` has become part of a cycle of transforms feeding one another."
  [transform]
  (when (transforms-base.u/query-transform? transform)
    (when-let [{:keys [cycle-str]} (transforms-base.ordering/get-transform-cycle transform)]
      (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                      {:status-code 400})))))

(defn- unresolved-merge-key-table-id
  "The ID of the target Table of `transform` when its merge unique key still has columns known by name only, or nil."
  [{:keys [source target target_table_id]}]
  (when (and target_table_id
             (transforms-base.u/merge-target? {:source source :target target})
             (some #(nil? (:field-id %)) (get-in target [:target-incremental-strategy :unique-key])))
    target_table_id))

(defn- resolve-merge-key-field-ids
  "`transform` with the `:field-id` of the columns of its merge unique key filled from the active Fields of its target
  table, once that table exists and any are still by-name only."
  [transform]
  (if-let [table-id (unresolved-merge-key-table-id transform)]
    (let [name->id (transforms.db/active-field-ids-by-name table-id)]
      (update-in transform [:target :target-incremental-strategy :unique-key]
                 (fn [unique-key]
                   (mapv (fn [e] (cond-> e (:name e) (assoc :field-id (name->id (:name e)))))
                         unique-key))))
    transform))

(defn- checkpoint-field-changed?
  "Whether `old` had an incremental checkpoint Field that `new` replaces."
  [old new]
  (let [old-field-id (get-in old [:source :source-incremental-strategy :checkpoint-filter-field-id])
        new-field-id (get-in new [:source :source-incremental-strategy :checkpoint-filter-field-id])]
    (and old-field-id (not= old-field-id new-field-id))))

(defn- definition-changed?
  "Whether `changes` change the source or the target of a Transform."
  [changes]
  (or (contains? changes :source) (contains? changes :target)))

(defn- checked-update
  "`transform` with `changes`, after the checks of an update of a Transform and with the columns that follow from it."
  [transform changes]
  (let [new        (merge transform changes)
        _          (when (contains? changes :collection_id) (check-collection new))
        definition (when (definition-changed? changes) (check-and-derive-definition new))]
    (when (and (or (contains? changes :source_type)
                   (and (contains? changes :source_database_id) (source-database-id new)))
               (not (contains? changes :source)))
      (throw (ex-info (tru "source_type and source_database_id follow the source; change the source instead.")
                      {:status-code 400})))
    (when (and (contains? changes :target_db_id) (not definition))
      (throw (ex-info (tru "target_db_id follows the source and the target; change them instead.")
                      {:status-code 400})))
    (when definition
      (check-cycle definition))
    (cond-> new
      definition
      (merge (select-keys definition [:source_type :source_database_id :target_db_id]))

      (contains? changes :source)
      (assoc :table_dependencies nil)

      (checkpoint-field-changed? transform new)
      (assoc :last_checkpoint_value nil)

      true
      resolve-merge-key-field-ids)))

(defenterprise delete-transform-tests!
  "Deletes the tests of the transform `transform-id` through their model and publishes a delete event for each, which a
  database cascade would not; a no-op in OSS."
  metabase-enterprise.data-testing.models
  [_transform-id]
  nil)

;;; ---------------------------------------------- Transform tag links ----------------------------------------------

(mu/defn update-transform-tags! :- :nil
  "Update the tags associated with a transform using smart diff logic. Only modifies what has changed: deletes removed
  tags, updates positions for moved tags, and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [transform-id :- [:maybe ::lib.schema.id/transform]
   tag-ids      :- [:sequential ms/PositiveInt]]
  (when transform-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate while preserving order of first occurrence
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (transforms.db/transform-tag-links [transform-id])
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
            ;; Filter to only valid tags, preserving order
            new-tag-ids          (if valid-tag-ids
                                   (filterv valid-tag-ids deduped-tag-ids)
                                   [])
            ;; Calculate what needs to change
            current-set          (set current-tag-ids)
            new-set              (set new-tag-ids)
            to-delete            (set/difference current-set new-set)
            to-insert            (set/difference new-set current-set)
            ;; Build position map for new ordering
            new-positions        (zipmap new-tag-ids (range))]
        ;; Delete removed associations
        (when (seq to-delete)
          (transforms.db/delete-transform-tag-links! transform-id to-delete))
        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (transforms.db/set-transform-tag-position! transform-id tag-id new-pos)))
        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (transforms.db/insert-transform-tag-links! (for [tag-id to-insert]
                                                       {:transform_id transform-id
                                                        :tag_id       tag-id
                                                        :position     (get new-positions tag-id)})))))
    nil))

;;; ------------------------------------------------ Transform reads -------------------------------------------------

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

;;; ------------------------------------------------ Transform writes ------------------------------------------------

(mu/defn create-transform! :- ::transforms.schema/transform
  "Create new transform in the appdb, for the REST API and the replacement endpoint.
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

(mu/defn change-transform! :- :int
  "Apply `changes` to `transform-or-id`, a Transform the caller already loaded or the id of one, and publish its update
  event, returning the number of Transforms updated; for the replacement endpoint, revision revert, checkpoint saves and
  the SerDes import, whose `:import?` changes nothing, as master's hooks checked imports too."
  [transform-or-id :- [:or ::lib.schema.id/transform :map]
   changes         :- ::transforms.schema/transform.changes
   opts            :- ::transforms.schema/write-opts]
  (let [transform (row-or-select transform-or-id transforms.db/transform)
        changes   (when transform (changed transform changes))]
    (if (empty? changes)
      0
      (let [row     (checked-update transform changes)
            written (cond-> (changed transform row)
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-event-context (select-keys opts [:revision-message])
          (events/with-batched-events
            (when (definition-changed? changes)
              (table-index/mark-for-revalidation! (:id transform)))
            (u/prog1 (transforms.db/update-transform! (:id transform) written)
              (events/updated! :model/Transform (merge transform written) transform))))))))

(mu/defn update-transform! :- ::transforms.schema/transform
  "Update a transform, validating its features, what it refers to and its target conflicts, and return it with its
  associations hydrated; for the REST API."
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
                      (change-transform! old (dissoc body :tag_ids) {})
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

(mu/defn delete-transforms! :- :int
  "Delete the Transforms with `ids`, their tests and, through the database, their links, and publish their delete
  events, returning the number deleted; for the deletion of a Database, remote sync and the SerDes import."
  [ids   :- [:maybe [:sequential ::lib.schema.id/transform]]
   _opts :- ::transforms.schema/write-opts]
  (let [transforms (when (seq ids) (transforms.db/transforms ids))]
    (if (empty? transforms)
      0
      (events/with-batched-events
        (events/deleting! :model/Transform transforms
                          (fn []
                            (run! (comp delete-transform-tests! :id) transforms)
                            (transforms.db/delete-transforms! (mapv :id transforms))))))))

(mu/defn delete-transform! :- :nil
  "Delete a transform, for the REST API."
  [transform :- ::transforms.schema/transform]
  (delete-transforms! [(:id transform)] {})
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

(defmethod mi/write-fns :model/Transform
  [_model]
  {:update! change-transform!
   :delete! delete-transforms!})

;;; ------------------------------------------------- Transform tags -------------------------------------------------

(defn check-tag-name-free
  "Throws a 400 when the `:name` of `tag` belongs to another TransformTag."
  [{tag-name :name, :keys [id]}]
  (when-let [tag-name (not-empty (str tag-name))]
    (let [taken-by (transforms.db/tag-id-by-name tag-name)]
      (when (and taken-by (not= taken-by id))
        (throw (ex-info (tru "A tag with the name ''{0}'' already exists." tag-name) {:status-code 400}))))))

(mu/defn translated-tag-name :- [:map {:closed true} [:name [:maybe mu/localized-string-schema]]]
  "The name of the built-in `tag` in the language of the instance, which no other tag has."
  [tag :- [:or ::transforms.schema/transform-tag ::transforms.schema/transform-tag.update]]
  (let [values {"hourly"  (i18n/deferred-trs "hourly")
                "daily"   (i18n/deferred-trs "daily")
                "weekly"  (i18n/deferred-trs "weekly")
                "monthly" (i18n/deferred-trs "monthly")}
        name (get values (:built_in_type tag))]
    {:name name}))

(mu/defn create-tag! :- ::transforms.schema/transform-tag
  "Create a TransformTag named `tag-name`, for the REST API."
  [tag-name :- :string]
  (transforms.db/insert-tag! {:name tag-name}))

(mu/defn update-tag! :- :int
  "Apply `changes` to `tag-or-id`, a TransformTag the caller already loaded or the id of one, and publish its update
  event, returning the number of tags updated; a built-in tag that is written becomes a custom one, as master's hook
  made it; for the REST API and the SerDes import."
  [tag-or-id :- [:or ms/PositiveInt :map]
   changes   :- ::transforms.schema/transform-tag.changes
   opts      :- ::transforms.schema/write-opts]
  (let [tag     (row-or-select tag-or-id transforms.db/tag)
        changes (when tag (changed tag changes))]
    (if (empty? changes)
      0
      (let [new     (merge tag changes)
            _       (when (contains? changes :name) (check-tag-name-free new))
            row     (if (or (nil? (:built_in_type tag)) (empty? (dissoc changes :updated_at)))
                      new
                      (-> (merge new (translated-tag-name new) {:built_in_type nil} changes)
                          (update :name str)))
            written (cond-> (changed tag row)
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-event-context (select-keys opts [:revision-message])
          (events/with-batched-events
            (u/prog1 (transforms.db/update-tag! (:id tag) written)
              (events/updated! :model/TransformTag (merge tag written) tag))))))))

(mu/defn delete-tags! :- :int
  "Delete the TransformTags with `ids`, which the database removes from their Transforms and jobs, and publish their
  delete events, returning the number deleted; for the REST API and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::transforms.schema/write-opts]
  (let [tags (when (seq ids) (transforms.db/tags ids))]
    (if (empty? tags)
      0
      (events/with-batched-events
        (events/deleting! :model/TransformTag tags
                          #(transforms.db/delete-tags! (mapv :id tags)))))))

(mu/defn delete-tag! :- :int
  "Delete the TransformTag with `id`, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::transforms.schema/write-opts]
  (delete-tags! [id] opts))

(defmethod mi/write-fns :model/TransformTag
  [_model]
  {:update! update-tag!
   :delete! delete-tags!})

;;; -------------------------------------------------- Transform jobs -------------------------------------------------

(mu/defn translated-job-name-and-description :- [:map {:closed true}
                                                 [:name        [:maybe mu/localized-string-schema]]
                                                 [:description [:maybe mu/localized-string-schema]]]
  "The name and description of the built-in `job` in the language of the instance, which no other job has."
  [job :- [:or ::transforms.schema/transform-job ::transforms.schema/transform-job.update]]
  (let [values {"hourly"
                [(i18n/deferred-trs "Hourly job")
                 (i18n/deferred-trs "Executes transforms tagged with ''hourly'' every hour")]

                "daily"
                [(i18n/deferred-trs "Daily job")
                 (i18n/deferred-trs "Executes transforms tagged with ''daily'' once per day")]

                "weekly"
                [(i18n/deferred-trs "Weekly job")
                 (i18n/deferred-trs "Executes transforms tagged with ''weekly'' once per week")]

                "monthly"
                [(i18n/deferred-trs "Monthly job")
                 (i18n/deferred-trs "Executes transforms tagged with ''monthly'' once per month")]}
        [name description] (get values (:built_in_type job))]
    {:name name :description description}))

(mu/defn sync-job-trigger! :- :nil
  "Make the Quartz trigger of the job with `job-id` match its row: scheduled while the job is active, removed otherwise."
  [job-id :- ms/PositiveInt]
  (let [{:keys [active schedule] :as job} (transforms.db/job job-id)]
    (if active
      (when-not (= schedule (:schedule (transforms.schedule/existing-trigger job-id)))
        (transforms.schedule/initialize-job! job))
      (transforms.schedule/delete-trigger! job-id))
    nil))

(mu/defn create-job! :- ::transforms.schema/transform-job
  "Create the TransformJob `job` linked to the tags `tag-ids`, for the REST API."
  [job     :- ::transforms.schema/transform-job.update
   tag-ids :- [:maybe [:sequential ms/PositiveInt]]]
  (events/with-batched-events
    (let [job (transforms.db/insert-job! job)]
      (when (seq tag-ids)
        (transforms.db/insert-job-tag-links!
         (map-indexed (fn [idx tag-id]
                        {:job_id   (:id job)
                         :tag_id   tag-id
                         :position idx})
                      tag-ids)))
      job)))

(mu/defn update-job-tags! :- :nil
  "Update the tags associated with a job using smart diff logic.
   Only modifies what has changed: deletes removed tags, updates positions for moved tags,
   and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [job-id  :- [:maybe ms/PositiveInt]
   tag-ids :- [:sequential ms/PositiveInt]]
  (when job-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate, just in case
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (transforms.db/job-tag-links [job-id])
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
            ;; Filter to only valid tags, preserving order
            new-tag-ids          (if valid-tag-ids
                                   (filterv valid-tag-ids deduped-tag-ids)
                                   [])
            ;; Calculate what needs to change
            current-set          (set current-tag-ids)
            new-set              (set new-tag-ids)
            to-delete            (set/difference current-set new-set)
            to-insert            (set/difference new-set current-set)
            ;; Build position map for new ordering
            new-positions        (zipmap new-tag-ids (range))]
        ;; Delete removed associations
        (when (seq to-delete)
          (transforms.db/delete-job-tag-links! job-id to-delete))
        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (transforms.db/set-job-tag-position! job-id tag-id new-pos)))
        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (transforms.db/insert-job-tag-links! (for [tag-id to-insert]
                                                 {:job_id   job-id
                                                  :tag_id   tag-id
                                                  :position (get new-positions tag-id)})))))
    nil))

(mu/defn update-job! :- :int
  "Apply `changes` to `job-or-id`, a TransformJob the caller already loaded or the id of one, publish its update event
  and make its Quartz trigger match its row, returning the number of jobs updated; a built-in job that is written
  becomes a custom one, as master's hook made it; for the REST API and the SerDes import."
  [job-or-id :- [:or ms/PositiveInt :map]
   changes   :- ::transforms.schema/transform-job.changes
   opts      :- ::transforms.schema/write-opts]
  (let [job     (row-or-select job-or-id transforms.db/job)
        changes (when job (changed job changes))]
    (if (empty? changes)
      0
      (let [new     (merge job changes)
            row     (if (nil? (:built_in_type job))
                      new
                      (-> (merge new (translated-job-name-and-description new) {:built_in_type nil} changes)
                          (update :name str)
                          (update :description str)))
            written (cond-> (changed job row)
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-event-context (select-keys opts [:revision-message])
          (events/with-batched-events
            (u/prog1 (transforms.db/update-job! (:id job) written)
              (events/updated! :model/TransformJob (merge job written) job)
              (sync-job-trigger! (:id job)))))))))

(mu/defn delete-jobs! :- :int
  "Delete the TransformJobs with `ids`, their Quartz jobs and, through the database, their tag links, and publish their
  delete events, returning the number deleted; for the REST API and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::transforms.schema/write-opts]
  (let [jobs (when (seq ids) (transforms.db/jobs ids))]
    (if (empty? jobs)
      0
      (events/with-batched-events
        (events/deleting! :model/TransformJob jobs
                          (fn []
                            (run! (comp transforms.schedule/delete-job! :id) jobs)
                            (transforms.db/delete-jobs! (mapv :id jobs))))))))

(mu/defn delete-job! :- :int
  "Delete the TransformJob with `id`, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::transforms.schema/write-opts]
  (delete-jobs! [id] opts))

(mu/defn- active-flip-lock-name :- :keyword
  "Per-job cluster-lock keyword used to serialize `:active` flips of the same job across the
  cluster. Concurrent flips of *different* jobs run in parallel."
  [job-id :- ms/PositiveInt]
  (keyword "metabase.transforms.transform-job-active" (str job-id)))

(mu/defn- set-job-active! :- :nil
  "Set `:active` of the job `job-id` to `active`, unless it already is."
  [job-id :- ms/PositiveInt
   active :- :boolean]
  (cluster-lock/with-cluster-lock (active-flip-lock-name job-id)
    (when-let [job (transforms.db/job job-id)]
      (when (not= active (boolean (:active job)))
        (update-job! job {:active active} {})))
    nil))

(mu/defn activate-job! :- :nil
  "Activate a transform job: set `:active` to true, which creates its Quartz trigger from the
  job's stored schedule so cron firings begin again. Idempotent — calling on an already-active
  job is a no-op.

  Concurrent activate/deactivate of the same job is serialized by a per-job cluster lock so
  the app-DB row and the Quartz trigger cannot diverge. The lock is held across the trigger
  write."
  [job-id :- ms/PositiveInt]
  (set-job-active! job-id true))

(mu/defn deactivate-job! :- :nil
  "Deactivate a transform job: set `:active` to false, which removes its Quartz trigger so cron
  firings stop. Manual runs via the API still work. Idempotent — calling on an already-inactive
  job is a no-op.

  Concurrent activate/deactivate of the same job is serialized by a per-job cluster lock — see
  [[activate-job!]]."
  [job-id :- ms/PositiveInt]
  (set-job-active! job-id false))

(defmethod mi/write-fns :model/TransformJob
  [_model]
  {:update! update-job!
   :delete! delete-jobs!})
