(ns metabase.warehouse-schema.models.table
  (:require
   [medley.core :as m]
   [metabase.actions.models :as actions.models]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.driver :as driver]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.queries.card-schema :as card-schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.replacement.spec :as replacement]
   [metabase.search.spec :as search]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.app-db-copy :as warehouse-schema.app-db-copy]
   [metabase.warehouse-schema.collection-items :as warehouse-schema.collection-items]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.humanization :as humanization]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.recent-views :as warehouse-schema.recent-views]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.xrays :as warehouse-schema.xrays]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(def visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`).
   (Basically any non-nil value is a reason for hiding the table.)

  Deprecated and will eventually be replaced by data-layer"
  #{:hidden :technical :cruft})

(def data-sources
  "Valid values for data source"
  #{:unknown :ingested :metabase-transform :transform :source-data :upload})

(def writable-data-sources
  "The values of `Table.data_source` a request may set: all but `:metabase-transform`, which only transforms set."
  (disj data-sources :metabase-transform))

(def data-layers
  "Valid values for `Table.data_layer`.
  :final     - tables published for downstream consumption
  :internal  - acceptable quality, visible, synced
  :hidden    - low quality, hidden, not synced"
  #{:final :internal :hidden})

(defn visibility-type->data-layer
  "Convert legacy visibility_type to data_layer.
  Used when updating via the legacy field."
  [visibility-type]
  (if (contains? #{:hidden :retired :sensitive :technical :cruft} visibility-type)
    :hidden
    :internal))

(defn data-layer->visibility-type
  "Convert data_layer back to legacy visibility_type.
  Used for rollback compatibility to v56."
  [data-layer]
  (case data-layer
    :hidden :hidden
    ;; internal,final all map to visible (nil)
    nil))

(def field-orderings
  "Valid values for `Table.field_order`.
  `:database`     - use the same order as in the table definition in the DB;
  `:alphabetical` - order alphabetically by name;
  `:custom`       - the user manually set the order in the data model
  `:smart`        - Try to be smart and order like you'd usually want it: first PK, followed by `:type/Name`s, then
                    `:type/Temporal`s, and from there on in alphabetical order."
  #{:database :alphabetical :custom :smart})

(def writable-data-authority-types
  "Valid values we can configure for `Table.data_authority`.
  `:unconfigured`  - no data authority status has been set yet;
  `:computed`      - this table is derived/computed from other sources within metabase;
  `:ingested`      - this table is ingested from external sources, e.g. an uploaded CSV;"
  #{:unconfigured :computed :ingested})

(def readable-data-authority-types
  "Valid values we can return for `Table.data_authority`.
  `:unconfigured`  - no data authority status has been set yet;
  `:computed`      - this table is derived/computed from other sources within metabase;
  `:ingested`      - this table is ingested from external sources, e.g. an uploaded CSV;
  `:unknown`       - fallback for an unexpected value from the database, e.g. from a newer version we rolled back from."
  (conj writable-data-authority-types :unknown))

(methodical/defmethod t2/table-name :model/Table [_model] :metabase_table)

(doto :model/Table
  (derive :metabase/model)
  (derive :hook/timestamped?)
  ;; Deliberately **not** deriving from `:hook/entity-id` because we should not be randomizing the `entity_id`s on
  ;; databases, tables or fields. Since the sync process can create them in multiple instances, randomizing them would
  ;; cause duplication rather than good matching if the two instances are later linked by serdes.
  #_(derive :hook/entity-id))

(def transform-data-authority
  "Transform for a `data_authority` column. NULL passes through: the column is NOT NULL on `metabase_table`, but
  nullable in `metabase_table_user_settings`, where NULL means the user set nothing."
  {:out (fn [value]
          (when (some? value)
            (let [kw (keyword value)]
              (if (contains? writable-data-authority-types kw)
                kw
                (do (log/warnf "Unknown data_authority value from database: %s, converting to :unknown" value)
                    :unknown)))))
   :in  (fn [value]
          (when (some? value)
            (let [kw (keyword value)]
              (when-not (contains? writable-data-authority-types kw)
                (throw (ex-info (str "Illegal value for data_authority: " kw)
                                {:field         :data_authority
                                 :value         value
                                 :status-code   400
                                 :response/keys #{:field}})))
              (name kw))))})

(def legacy-data-layer->current
  "Map old medallion data_layer values to current values.
   Used to handle values from pre-v59 databases or serialization exports."
  {:copper :hidden
   :bronze :final
   :silver :final
   :gold   :final})

(t2/deftransforms :model/Table
  {:entity_type             mi/transform-keyword
   :show_in_getting_started mi/transform-boolean
   :visibility_type         mi/transform-keyword
   :data_layer              (mi/transform-validator-with-fixes
                             mi/transform-keyword
                             (partial mi/assert-optional-enum data-layers)
                             (some-fn legacy-data-layer->current identity))
   :field_order             mi/transform-keyword
   :data_source             (mi/transform-validator-with-fixes
                             mi/transform-keyword
                             (partial mi/assert-optional-enum data-sources)
                             (some-fn keyword identity))
   ;; Warning: by using a transform to handle unexpected enum values, serialization becomes lossy
   :data_authority          transform-data-authority})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(def field-order-rule
  "How should we order fields."
  warehouse-schema.db/field-order-rule)

(defn check-changes
  "Throws a 400 for a change in `changes` that `original`, the Table as stored, cannot take."
  [changes original]
  (when (contains? changes :db_id)
    (throw (ex-info (tru "You cannot move a Table to another Database.") {:status-code 400})))
  (when (and (not= (keyword (:data_authority original :unconfigured)) :unconfigured)
             (= (keyword (:data_authority changes)) :unconfigured))
    (throw (ex-info (tru "Cannot set data_authority back to unconfigured once it has been configured")
                    {:status-code 400})))
  (when (and (contains? changes :data_source)
             (= (some-> (:data_source original) keyword) :metabase-transform)
             (not= (some-> (:data_source changes) keyword) :metabase-transform))
    (throw (ex-info (tru "Cannot change data_source from metabase-transform") {:status-code 400})))
  (when (and (contains? changes :visibility_type)
             (contains? changes :data_layer)
             (not= (keyword (:visibility_type changes)) (keyword (:visibility_type original)))
             (not= (keyword (:data_layer changes)) (keyword (:data_layer original))))
    (throw (ex-info (tru "Cannot update both visibility_type and data_layer") {:status-code 400}))))

(defn- visibility-changes
  "The other half of the `visibility_type`/`data_layer` pair, derived from the half `changes` changes in `original`."
  [{:keys [visibility_type data_layer] :as changes} original]
  (cond
    (and (contains? changes :visibility_type)
         (not= (keyword visibility_type) (keyword (:visibility_type original))))
    {:data_layer (visibility-type->data-layer (keyword visibility_type))}

    (and (contains? changes :data_layer)
         (not= (keyword data_layer) (keyword (:data_layer original))))
    {:visibility_type (data-layer->visibility-type (keyword data_layer))}))

(defn- activity-changes
  "The `deactivated_at` and `archived_at` that a change of `active` in `changes` from `original` sets."
  [changes original]
  (cond
    (and (true? (:active original)) (false? (:active changes)))
    {:deactivated_at (mi/now)}

    (and (false? (:active original)) (true? (:active changes)))
    {:deactivated_at nil, :archived_at nil}))

(t2/define-before-insert :model/Table
  [table]
  (merge table
         (apply dissoc
                {:display_name   (humanization/name->human-readable-name (:name table))
                 :data_layer     :internal
                 :data_authority :unconfigured}
                (keys table))))

(t2/define-before-update :model/Table
  [table]
  (let [changes  (t2/changes table)
        original (t2/original table)]
    (check-changes changes original)
    (merge table (visibility-changes changes original) (activity-changes changes original))))

(defn- group-perm-defaults
  "Build the list of {:group-id G :perm-type PT :default-value V} triples for a new table."
  [table all-users-group non-magic-groups non-admin-groups]
  (let [au-id    (u/the-id all-users-group)
        is-audit (= (:db_id table) audit/audit-db-id)
        defaults (fn [groups perm-type value]
                   (mapv (fn [g] {:group-id (u/the-id g) :perm-type perm-type :default-value value}) groups))]
    (concat
     ;; view-data: all non-admin → :unrestricted
     (defaults non-admin-groups :perms/view-data :unrestricted)
     ;; create-queries
     (if is-audit
       (defaults non-admin-groups :perms/create-queries :no)
       (concat [{:group-id au-id :perm-type :perms/create-queries :default-value :query-builder}]
               (defaults non-magic-groups :perms/create-queries :no)))
     ;; download-results
     [{:group-id au-id :perm-type :perms/download-results :default-value :one-million-rows}]
     (defaults non-magic-groups :perms/download-results :no)
     ;; manage-table-metadata
     (defaults non-admin-groups :perms/manage-table-metadata :no))))

(defn- set-new-table-permissions!
  [table]
  (perms/with-db-scoped-permissions-lock (:db_id table)
    (let [all-users-group  (perms/all-users-group)
          non-magic-groups (perms/non-magic-groups)
          non-admin-groups (conj non-magic-groups all-users-group)]
      (perms/set-default-table-permissions!
       table
       (group-perm-defaults table all-users-group non-magic-groups non-admin-groups)))))

(defn set-new-tables-permissions!
  "Batch variant of [[set-new-table-permissions!]] for many newly-inserted
  tables on the same database. Acquires the cluster lock once and delegates
  to [[perms/set-default-table-permissions-bulk!]]. All `tables` must share
  `db-id`."
  [db-id tables]
  (when (seq tables)
    (perms/with-db-scoped-permissions-lock db-id
      (let [all-users-group  (perms/all-users-group)
            non-magic-groups (perms/non-magic-groups)
            non-admin-groups (conj non-magic-groups all-users-group)
            tables+defaults  (mapv (fn [t]
                                     [t (group-perm-defaults t all-users-group
                                                             non-magic-groups
                                                             non-admin-groups)])
                                   tables)]
        (perms/set-default-table-permissions-bulk! db-id tables+defaults)))))

(t2/define-after-select :model/Table
  [table]
  (dissoc table :is_defective_duplicate :unique_table_helper :worktree_id))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- check-permission-keys
  "Throws unless `table` has the columns its permission hydrations read."
  [table]
  (api/check-500 (some? (:id table)) "No :id is set for a Table.")
  (api/check-500 (some? (:db_id table)) "No :db_id is set for a Table."))

(defn- table-permissions
  "The current user's `perm-type` value on each of `tables`, as `{table-id value}`, from one bulk question."
  [perm-type tables]
  (perms/table-permissions-for-user (perms/user-info api/*current-user-id*)
                                    perm-type
                                    (into {} (map (juxt :id :db_id)) tables)))

(defn- remap-target-table-ids
  "The ids of the other Tables that a query of each of `tables` joins for external remaps, by Table id, read only for
  a user who is not a superuser."
  [tables]
  (if (or (empty? tables) (mi/superuser?))
    {}
    (warehouse-schema.db/external-remap-target-table-ids (into #{} (map :id) tables))))

(methodical/defmethod t2/batched-hydrate [:model/Table :can_read]
  "Whether the current user can see the metadata of each of `tables`: those they can query, and those whose metadata
  they manage."
  [_model k tables]
  (let [rows (into [] (remove nil?) tables)]
    (run! check-permission-keys rows)
    (let [queryable (query-perms/queryable-table-ids rows)
          others    (into [] (remove #(contains? queryable (:id %))) rows)
          manage    (if (seq others)
                      (table-permissions :perms/manage-table-metadata others)
                      {})]
      (for [table tables]
        (when table
          (vary-meta table assoc k (boolean (or (contains? queryable (:id table))
                                                (= :yes (get manage (:id table)))))))))))

(methodical/defmethod t2/batched-hydrate [:model/Table :can_query]
  "Whether the current user can run queries against each of `tables`, including the Tables they join for external
  remaps."
  [_model k tables]
  (let [rows (into [] (remove nil?) tables)]
    (run! check-permission-keys rows)
    (let [queryable (query-perms/queryable-table-ids rows (remap-target-table-ids rows))]
      (for [table tables]
        (when table
          (assoc table k (contains? queryable (:id table))))))))

(defenterprise table-ids-with-writable-metadata
  "OSS implementation: the ids of those of `tables` whose metadata the current user can change, which is all of them
  for a superuser and none otherwise."
  metabase-enterprise.advanced-permissions.common
  [tables]
  (if (mi/superuser?)
    (into #{} (map :id) tables)
    #{}))

(methodical/defmethod t2/batched-hydrate [:model/Table :can_write]
  "Whether the current user can change the metadata of each of `tables`, answered together, which nobody can when a
  read-only instance syncs the Table."
  [_model k tables]
  (let [rows     (into [] (remove nil?) tables)
        _        (run! check-permission-keys rows)
        unsynced (collection/remote-sync-writable-table-ids rows)
        writable (table-ids-with-writable-metadata rows)]
    (for [table tables]
      (when table
        (assoc table k (and (contains? writable (:id table))
                            (contains? unsynced (:id table))))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-batched-hydration-method with-table
  :table
  "Hydrate the Table of each of `instances` from its `table_id`, with one query for all of them."
  [instances]
  (let [table-ids (into #{} (keep :table_id) instances)
        id->table (when (seq table-ids)
                    (m/index-by :id (warehouse-schema.db/tables table-ids)))]
    (for [instance instances]
      (m/assoc-some instance :table (get id->table (:table_id instance))))))

(methodical/defmethod t2/batched-hydrate [:model/Table :owner]
  "Add owner (user) to a table. If owner_user_id is set, fetches the user.
   If owner_email is set instead, returns a map with just the email."
  [_model _k tables]
  (if-not (seq tables)
    tables
    (let [owner-user-ids (into #{} (keep :owner_user_id) tables)
          id->owner (when (seq owner-user-ids)
                      (warehouse-schema.db/user-summaries-by-id owner-user-ids))]
      (for [table tables]
        (assoc table :owner
               (cond
                 (:owner_user_id table)
                 (get id->owner (:owner_user_id table))

                 (:owner_email table)
                 {:email (:owner_email table)}))))))

(methodical/defmethod t2/batched-hydrate [:model/Table :field_values]
  "Return the FieldValues for all Fields belonging to a single `table`."
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(-> (group-by :table_id (warehouse-schema.db/full-field-values-for-tables (map :id tables)))
        (update-vals (fn [fvs] (->> fvs (map (juxt :field_id :values)) (into {})))))
   :id))

(methodical/defmethod t2/model-for-automagic-hydration [:model/Table :collection]
  "A Table has no `collection_id` of its own, so its Collection hydrates by the method below."
  [_original-model _k]
  nil)

(methodical/defmethod t2/batched-hydrate [:model/Table :collection]
  "Hydrate the Collection each of the tables is published into, nil for one that is not published."
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(warehouse-schema.db/collections-by-published-table-id (into #{} (keep :id) tables))
   :id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/Table :transform]
  "Hydrate transforms that created the tables."
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(if-let [table-ids (not-empty (into #{} (keep :id) tables))]
      (warehouse-schema.db/transforms-by-target-table-id table-ids)
      {})
   :id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/Table :pk_field]
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(warehouse-schema.db/pk-field-ids-by-table (map :id tables))
   :id))

(defn- with-objects [hydration-key fetch-objects-fn tables]
  (let [table-ids         (set (map :id tables))
        table-id->objects (group-by :table_id (when (seq table-ids)
                                                (fetch-objects-fn table-ids)))]
    (for [table tables]
      (assoc table hydration-key (get table-id->objects (:id table) [])))))

(mi/define-batched-hydration-method with-segments
  :segments
  "Efficiently hydrate the Segments for a collection of `tables`."
  [tables]
  (with-objects :segments
    (fn [table-ids]
      (warehouse-schema.db/unarchived-segments-for-tables table-ids))
    tables))

(mi/define-batched-hydration-method with-measures
  :measures
  "Efficiently hydrate the Measures for a collection of `tables`."
  [tables]
  (with-objects :measures
    (fn [table-ids]
      (warehouse-schema.db/unarchived-measures-for-tables table-ids))
    tables))

(mi/define-batched-hydration-method with-metrics
  :metrics
  "Efficiently hydrate the Metrics for a collection of `tables`.

  Consumers of a Table's `:metrics` want an id, a name and a link, never a metric's `:dimensions`, so the
  `card_schema` 24 backfill is skipped. Without that the upgrade builds the whole implicitly-joined dimension set
  for every pre-curation metric on these tables -- work proportional to (metrics x columns), then discarded --
  which is minutes of CPU and enough garbage to exhaust the heap on a wide table with many old metrics (#83937).
  Every other `card_schema` upgrade still runs."
  [tables]
  (with-objects :metrics
    (fn [table-ids]
      (->> (binding [card-schema/*skip-dimension-backfill?* true]
             (warehouse-schema.db/unarchived-metric-cards-for-tables table-ids))
           mi/readable))
    tables))

(defn with-fields
  "Efficiently hydrate the Fields for a collection of `tables`."
  [tables]
  (with-objects :fields
    (fn [table-ids]
      (warehouse-schema.db/active-fields-for-tables table-ids))
    tables))

(mi/define-batched-hydration-method fields
  :fields
  "Efficiently hydrate the Fields for a collection of `tables`"
  [tables]
  (with-fields tables))

(defn database
  "Return the `Database` associated with this `Table`."
  [table]
  (warehouse-schema.db/database (:db_id table)))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- add-default-field-orders
  "Each of the Table `rows` with the default field order of its Database's driver unless it has one, the engines of
  the Databases read in one query."
  [rows]
  (let [engines (when-let [db-ids (not-empty (into #{} (comp (remove :field_order) (keep :db_id)) rows))]
                  (warehouse-schema.db/database-engines db-ids))]
    (mapv (fn [{:keys [db_id field_order] :as row}]
            (cond-> row
              (nil? field_order) (assoc :field_order (driver/default-field-order (get engines db_id)))))
          rows)))

(defn- set-new-permissions!
  "Give the new `tables` their default permissions, those of each Database at once."
  [tables]
  (doseq [[db-id tables] (group-by :db_id tables)]
    (if (= 1 (count tables))
      (set-new-table-permissions! (first tables))
      (set-new-tables-permissions! db-id tables))))

(defn- tables-created!
  "Give the new `tables` the default permissions of a new Table and publish their create event."
  [tables]
  (set-new-permissions! tables)
  (events/publish-event! :event/table-create (events/create-event tables)))

(mu/defn create-tables! :- [:sequential ::warehouse-schema.schema/table]
  "Insert the Table `rows` in one transaction, publishing their create event, and return the inserted Tables, with the
  default field order of their driver and the default permissions of a new Table."
  [rows :- [:sequential ::warehouse-schema.schema/table.create]]
  (mdb/create-batched! :model/Table rows
                       {:before-create add-default-field-orders
                        :after-create  tables-created!}))

(defn- ordered-field-positions
  "The position of each Field of the `tables`, which share `field-order`, in that order: one read."
  [field-order tables]
  (for [[_table-id fields] (group-by :table_id (warehouse-schema.db/field-ids-for-tables-ordered
                                                (into #{} (map :id) tables)
                                                field-order))
        [position field]   (map-indexed vector fields)]
    [(:id field) position]))

(mu/defn update-field-positions!
  "Set the `:position` of the Fields of each of `tables` to their place in its `:field_order`: one read per distinct
  field order and batch of [[mdb/update-partition-size]] Tables, and one event."
  [tables :- [:sequential [:map [:id ::lib.schema.id/table] [:field_order {:optional true} [:maybe :keyword]]]]]
  (field/set-positions!
   (into {}
         (for [[field-order tables] (group-by (comp keyword :field_order) tables)
               batch                (partition-all mdb/update-partition-size tables)
               entry                (ordered-field-positions field-order batch)]
           entry))))

(defn- updated-table
  "The Table `previous`, an instance as the function read it, as an update of `changes` leaves it, with the columns its
  before-update derives and the `:updated_at` it had."
  [previous changes]
  (-> (t2.before-update/before-update :model/Table (merge previous changes))
      (assoc :updated_at (:updated_at previous))))

(defn- publish-table-updates!
  "Publish the `:event/table-update` event of `updates` over the `id->stored` Tables with the `:context` and `:writer` of
  `opts`, leaving out the rows that change nothing."
  [opts updates id->stored _id->updated]
  (events/publish-event! :event/table-update
                         (events/update-event id->stored
                                              updates
                                              (assoc opts :objects (into {}
                                                                         (keep (fn [{:keys [id] :as row}]
                                                                                 (when-let [previous (id->stored id)]
                                                                                   [id (updated-table previous (dissoc row :id))])))
                                                                         updates)))))

(defn- reordered-tables
  "The id and new field order of each of `rows` that gives its Table, one of `stored`, another field order."
  [stored rows]
  (for [{:keys [id field_order] :as row} rows
        :when (and (contains? row :field_order)
                   (contains? stored id)
                   (not= (some-> field_order keyword) (:field_order (stored id))))]
    {:id id :field_order (some-> field_order keyword)}))

(defn- tables-by-ids
  "The Tables with `ids` by id."
  [ids]
  (warehouse-schema.db/tables-by-ids (vec ids)))

(defn- prepare-table-updates!
  "Set the positions of the Fields of the Tables, among the `id->stored` ones, that `updates` give another field order,
  and return `updates`."
  [updates id->stored]
  (update-field-positions! (reordered-tables id->stored updates))
  updates)

(mu/defn update-tables! :- :nil
  "Apply `updates`, each the `:id` of a Table and the columns to change, in one transaction, publishing their update
  event with the `:context` and `:writer` of `opts`; a new field order sets the positions of their Fields."
  ([updates :- [:sequential ::warehouse-schema.schema/table.update]]
   (update-tables! updates nil))
  ([updates :- [:sequential ::warehouse-schema.schema/table.update]
    opts    :- :metabase.events.schema/write-opts]
   (mdb/update-batched! :model/Table updates
                        {:before-update prepare-table-updates!
                         :after-update  (partial publish-table-updates! opts)})))

(mu/defn change-case!
  "Set each of `columns`, such as `:name` and `:schema`, of the Tables with `table-ids` to its value in `kase`, `:lower`
  or `:upper` case, which the database computes: one read before, one statement per batch of
  [[mdb/update-partition-size]] Tables, and one read after, for the event."
  [table-ids :- [:sequential ::lib.schema.id/table]
   kase      :- [:enum :lower :upper]
   columns   :- [:sequential [:enum :name :schema :display_name]]]
  (when (seq table-ids)
    (t2/with-transaction [_conn]
      (let [stored (tables-by-ids table-ids)]
        (run! #(warehouse-schema.db/change-tables-case! (vec %) kase columns)
              (partition-all mdb/update-partition-size table-ids))
        (events/publish-event! :event/table-update
                               (events/update-event stored
                                                    (mapv #(hash-map :id %) (keys stored))
                                                    {:objects (tables-by-ids (keys stored))}))))))

(mu/defn ids-of-database :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (warehouse-schema.db/table-ids-of-database database-id))

(defn- delete-table-content-and-publish!
  "Delete the Fields of the Table rows `tables`, nested ones first, and the implicit Actions that write to them, then
  publish the Tables' delete event."
  [tables]
  (let [batches (partition-all mdb/delete-partition-size (map :id tables))]
    (field/delete-fields! (into [] (mapcat #(warehouse-schema.db/field-ids-for-tables (vec %))) batches))
    (actions.models/delete-actions! (into [] (mapcat #(actions.models/action-ids-of-tables (vec %))) batches)))
  (events/publish-event! :event/table-delete (events/delete-event tables)))

(mu/defn delete-tables! :- :nil
  "Delete the Tables with `ids`, their Fields, nested ones first, and the implicit Actions that write to them, in one
  transaction, publishing their delete event after those and before the Tables' own statements."
  [ids :- [:sequential ::lib.schema.id/table]]
  (mdb/delete-batched! :model/Table ids {:before-delete delete-table-content-and-publish!}))

(mu/defn increment-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Tables with `ids`, in one plain
  statement that publishes no event, for a usage stat no rule reads, returning the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (warehouse-schema.db/increment-table-view-counts! count->ids))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- import-owner-ids
  "A transform fn importing owner emails as User ids, keeping the local user ids that older exports copied, so that
  re-importing such files on the same instance keeps the right owner."
  [store _entities values opts]
  (mapv (fn [v id] (if (int? v) v id))
        values
        (serialization/column-ids store :model/User (map #(when-not (int? %) %) values) opts)))

(defn retired-data-authority?
  "Whether `data-authority`, a string or keyword, is the retired `authoritative`, which older exports can hold."
  [data-authority]
  (= "authoritative" (some-> data-authority name)))

(defn- import-data-authorities
  "A transform fn importing data authorities.
  Older exports can hold the retired `authoritative`, which becomes `ingested` for an upload and `unconfigured`
  otherwise, as in the app DB migration that retired it."
  [_store entities values _opts]
  (mapv (fn [{:keys [is_upload]} v]
          (if (retired-data-authority? v)
            (if is_upload :ingested :unconfigured)
            (some-> v keyword)))
        entities
        values))

(defn- storage-paths
  "The storage path of each of the Table `entities`, in the directory of its Database and schema."
  [entities _ctx]
  (mapv (fn [{:keys [db_id schema name]}]
          (conj (serialization/storage-path-prefixes [db_id schema name])
                {:label name :key name}))
        entities))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Table [_model]
  {:skip?     false
   :transform warehouse-schema.app-db-copy/transform-table})

(defmethod change-log/spec :model/Table [_model]
  {:track [:name :description :entity_type :active :db_id :display_name :visibility_type :schema :points_of_interest
           :caveats :show_in_getting_started :field_order :is_upload :database_require_filter :estimated_row_count
           :deactivated_at :archived_at :is_writable :data_authority :data_source :data_layer :owner_email
           :owner_user_id :transform_target]
   :skip  [:initial_sync_status :view_count :is_defective_duplicate :unique_table_helper]})

(defmethod serialization/spec :model/Table [_]
  {:schema              ::warehouse-schema.schema/external-table
   :identity            [:db_id :schema :name]
   :copy                [:name :description :entity_type :active :display_name :visibility_type :schema
                         :points_of_interest :caveats :show_in_getting_started :field_order :is_upload
                         :database_require_filter :is_writable :data_source :data_layer :owner_email]
   :skip                [:estimated_row_count :initial_sync_status :view_count :transform_target
                         :is_defective_duplicate :unique_table_helper]
   :transform           {:archived_at    serialization/date-transform
                         :deactivated_at serialization/date-transform
                         :db_id          serialization/database-transform
                         :owner_user_id  (assoc serialization/user-transform :import import-owner-ids)
                         :data_authority {:export serialization/export-unchanged :import import-data-authorities}}
   :defaults            {:is_upload               false
                         :show_in_getting_started false}
   :storage-paths       storage-paths
   :insert!             create-tables!
   :update!             #(do (update-tables! %) %)
   :delete!             delete-tables!
   :rows-by-refs        serialization/table-rows-by-refs})

(defmethod audit/spec :model/Table [_model]
  {:track          [:id :name :db_id]
   :track-redacted [:active :archived_at :caveats :data_authority :data_layer :data_source
                    :database_require_filter :deactivated_at :description :display_name :entity_type
                    :estimated_row_count :field_order :initial_sync_status :is_defective_duplicate
                    :is_upload :is_writable :owner_email :owner_user_id :points_of_interest :schema
                    :show_in_getting_started :transform_target :unique_table_helper
                    :visibility_type]
   :skip           [:view_count]
   :topics         {}})

(defmethod search/spec :model/Table
  [_model]
  {"table"
   {:attrs        {;; legacy search uses :active for this, but then has a rule to only ever show active tables
                   ;; so we moved that to the where clause
                   :archived        false
                   ;; For published tables with no collection, we want to show "root" as the collection id
                   :collection-id   :settings.collection_id
                   :creator-id      false
                   :database-id     :db_id
                   :view-count      true
                   :created-at      true
                   :updated-at      true
                   :is-published        [:coalesce :settings.is_published false]
                   :collection-type     :collection.type
                   :collection-location :collection.location
                   :root-collection-type {:batch-fn collection/root-collection-types}
                   :data-layer          :data_layer}
    :search-terms {:name         search/explode-camel-case
                   :display_name true
                   :description  true}
    :render-terms {:initial-sync-status        true
                   :table-id                   :id
                   :table-description          :description
                   :table-name                 :name
                   :table-schema               :schema
                   :database-name              :db.name
                   :collection-authority_level :collection.authority_level
                   ;; For published tables with no collection, show "Our analytics" as the collection name
                   :collection-name            [:coalesce :collection.name
                                                [:case
                                                 [:and :settings.is_published
                                                  [:= :settings.collection_id nil]] "Our analytics"
                                                 :else nil]]}
    :where        [:and
                   :this.active
                   [:= :this.visibility_type nil]
                   [:= :db.router_database_id nil]
                   [:not= :this.db_id [:inline audit/audit-db-id]]]
    :joins        {:db         [:model/Database   [:= :db.id :this.db_id]]
                   :settings   [:model/TableUserSettings [:= :settings.table_id :this.id]]
                   :collection [:model/Collection [:and [:= :settings.is_published true] [:= :collection.id :settings.collection_id]]]}}})

(defmethod dependencies/spec :model/Table [_model]
  {:type  :table
   :items warehouse-schema.db/dependency-table-items

   :output-columns #{:name :schema :display_name :active :visibility_type}})

(defmethod replacement/spec :model/Table [_model]
  {:source-database-id :db_id})

(defmethod collection-items/spec :model/Table [_model]
  {"table" {:items   warehouse-schema.db/collection-table-items
            :hydrate warehouse-schema.collection-items/hydrate}})

(defmethod recent-views/spec :model/Table [_model]
  {"table" {:load   warehouse-schema.db/recent-view-tables
            :render warehouse-schema.recent-views/render}})

(defmethod xrays/spec :model/Table [_model]
  {:related warehouse-schema.xrays/table-related})
