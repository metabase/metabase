(ns metabase.warehouse-schema.models.table
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Constants + Entity -----------------------------------------------

(def visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`).
   (Basically any non-nil value is a reason for hiding the table.)

  Deprecated and will eventually be replaced by data-layer"
  #{:hidden :technical :cruft})

(def data-sources
  "Valid values for data source"
  #{:unknown :ingested :metabase-transform :transform :source-data :upload})

(def data-layers
  "Valid values for `Table.data_layer`.
  :final     - tables published for downstream consumption
  :internal  - acceptable quality, visible, synced
  :hidden    - low quality, hidden, not synced"
  #{:final :internal :hidden})

(defn- visibility-type->data-layer
  "Convert legacy visibility_type to data_layer.
  Used when updating via the legacy field."
  [visibility-type]
  (if (contains? #{:hidden :retired :sensitive :technical :cruft} visibility-type)
    :hidden
    :internal))

(defn- data-layer->visibility-type
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
  `:authoritative` - this table is the authoritative source of truth;
  `:computed`      - this table is derived/computed from other authoritative sources within metabase;
  `:ingested`      - this table is ingested from external sources;"
  #{:unconfigured :authoritative :computed :ingested})

(def readable-data-authority-types
  "Valid values we can return for `Table.data_authority`.
  `:unconfigured`  - no data authority status has been set yet;
  `:authoritative` - this table is the authoritative source of truth;
  `:computed`      - this table is derived/computed from other authoritative sources within metabase;
  `:ingested`      - this table is ingested from external sources;
  `:unknown`       - fallback for an unexpected value from the database, e.g. from a newer version we rolled back from."
  (conj writable-data-authority-types :unknown))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/Table [_model] :metabase_table)

(doto :model/Table
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?)
  ;; Deliberately **not** deriving from `:hook/entity-id` because we should not be randomizing the `entity_id`s on
  ;; databases, tables or fields. Since the sync process can create them in multiple instances, randomizing them would
  ;; cause duplication rather than good matching if the two instances are later linked by serdes.
  #_(derive :hook/entity-id))

(def ^:private transform-data-authority
  {:out (fn [value]
          (let [kw (some-> value keyword)]
            (if (contains? writable-data-authority-types kw)
              kw
              (do (log/warnf "Unknown data_authority value from database: %s, converting to :unknown" value)
                  :unknown))))
   :in  (fn [value]
          (let [kw (some-> value keyword)]
            (when-not (contains? writable-data-authority-types kw)
              (throw (ex-info (str "Illegal value for data_authority: " kw)
                              {:field       :data_authority
                               :value       value
                               :status-code 400}))))
          (some-> value name))})

(t2/deftransforms :model/Table
  {:entity_type     mi/transform-keyword
   :visibility_type mi/transform-keyword
   :data_layer      (mi/transform-validator mi/transform-keyword (partial mi/assert-optional-enum data-layers))
   :field_order     mi/transform-keyword
   :data_source     (mi/transform-validator mi/transform-keyword (partial mi/assert-optional-enum data-sources))
   ;; Warning: by using a transform to handle unexpected enum values, serialization becomes lossy
   :data_authority  transform-data-authority})

(methodical/defmethod t2/model-for-automagic-hydration [:default :table]
  [_original-model _k]
  :model/Table)

(t2/define-after-select :model/Table
  [table]
  (dissoc table :is_defective_duplicate :unique_table_helper))

(defn- sync-visibility-fields
  "Sync visibility_type and data_layer fields, ensuring only one is updated at a time.
  Returns updated changes map with both fields in sync for rollback compatibility."
  [{:keys [visibility_type data_layer] :as changes}
   {original-v1 :visibility_type, original-v2 :data_layer}]
  (let [v1-changing? (and (contains? changes :visibility_type)
                          (not= (keyword visibility_type)
                                (keyword original-v1)))
        v2-changing? (and (contains? changes :data_layer)
                          (not= (keyword data_layer)
                                (keyword original-v2)))]
    (cond
      ;; Error: don't allow updating both at once
      (and v1-changing? v2-changing?)
      (throw (ex-info "Cannot update both visibility_type and data_layer"
                      {:status-code 400}))

      ;; Legacy field update -> convert to new field and sync back
      v1-changing?
      (assoc changes :data_layer (visibility-type->data-layer (keyword visibility_type)))

      ;; New field update -> sync back to legacy field for rollback
      v2-changing?
      (assoc changes :visibility_type
             (data-layer->visibility-type (keyword data_layer)))

      :else changes)))

(t2/define-before-insert :model/Table
  [table]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name table))
                  :field_order  (driver/default-field-order (t2/select-one-fn :engine :model/Database :id (:db_id table)))
                  :data_layer   :internal}]
    (merge defaults table)))

(t2/define-before-delete :model/Table
  [table]
  ;; We need to use toucan to delete the fields instead of cascading deletes because MySQL doesn't support columns with cascade delete
  ;; foreign key constraints in generated columns. #44866
  (t2/delete! :model/Field :table_id (:id table)))

(t2/define-before-update :model/Table
  [table]
  (let [changes        (t2/changes table)
        original-table (t2/original table)
        current-active (:active original-table)
        new-active     (:active changes)]

    ;; Prevent setting data_authority back to unconfigured once configured
    (when (and (not= (keyword (:data_authority original-table :unconfigured)) :unconfigured)
               (= (keyword (:data_authority changes)) :unconfigured))
      (throw (ex-info "Cannot set data_authority back to unconfigured once it has been configured"
                      {:status-code 400})))

    ;; Prevent changing data_source to/from metabase-transform
    (when (contains? changes :data_source)
      (let [original-data-source (:data_source original-table)
            new-data-source      (:data_source changes)]
        (when (and (= original-data-source :metabase-transform)
                   (not= new-data-source :metabase-transform))
          (throw (ex-info "Cannot change data_source from metabase-transform"
                          {:status-code 400})))
        (when (and (not= original-data-source :metabase-transform)
                   (= new-data-source :metabase-transform))
          (throw (ex-info "Cannot set data_source to metabase-transform"
                          {:status-code 400})))))

    ;; Sync visibility_type and data_layer fields
    (let [changes (sync-visibility-fields changes original-table)]
      (cond
        ;; active: true -> false (table being deactivated)
        (and (true? current-active) (false? new-active))
        (assoc changes :deactivated_at (mi/now))

        ;; active: false -> true (table being reactivated)
        (and (false? current-active) (true? new-active))
        (assoc changes
               :deactivated_at nil
               :archived_at nil)

        :else (merge table changes)))))

(defn- set-new-table-permissions!
  [table]
  (t2/with-transaction [_conn]
    (let [all-users-group  (perms/all-users-group)
          non-magic-groups (perms/non-magic-groups)
          non-admin-groups (conj non-magic-groups all-users-group)]
      ;; Data access permissions
      (if (= (:db_id table) audit/audit-db-id)
        (do
         ;; Tables in audit DB should start out with no query access in all groups
          (perms/set-new-table-permissions! non-admin-groups table :perms/view-data :unrestricted)
          (perms/set-new-table-permissions! non-admin-groups table :perms/create-queries :no))
        (do
          ;; Normal tables start out with unrestricted data access in all groups, but query access only in All Users
          (perms/set-new-table-permissions! non-admin-groups table :perms/view-data :unrestricted)
          (perms/set-new-table-permissions! [all-users-group] table :perms/create-queries :query-builder)
          (perms/set-new-table-permissions! non-magic-groups table :perms/create-queries :no)))
      ;; Download permissions
      (perms/set-new-table-permissions! [all-users-group] table :perms/download-results :one-million-rows)
      (perms/set-new-table-permissions! non-magic-groups table :perms/download-results :no)
      ;; Table metadata management
      (perms/set-new-table-permissions! non-admin-groups table :perms/manage-table-metadata :no))))

(t2/define-after-insert :model/Table
  [table]
  (u/prog1 table
    (set-new-table-permissions! table)))

(defmethod mi/can-read? :model/Table
  ;; Check if user can see this table's metadata.
  ;; True if user has:
  ;; - Data access permissions (and (view-data :unrestricted) (create-queries :query-builder)), OR
  ;; - Metadata management permission (manage-table-metadata :yes), OR
  ;; - Access via published table in a collection (EE feature)
  ([instance]
   (or
    ;; Has data access permissions
    (and (perms/user-has-permission-for-table?
          api/*current-user-id*
          :perms/view-data
          :unrestricted
          (:db_id instance)
          (:id instance))
         (perms/user-has-permission-for-table?
          api/*current-user-id*
          :perms/create-queries
          :query-builder
          (:db_id instance)
          (:id instance)))
    ;; Has manage-table-metadata permission (allows viewing metadata without data access)
    (perms/user-has-permission-for-table?
     api/*current-user-id*
     :perms/manage-table-metadata
     :yes
     (:db_id instance)
     (:id instance))
    ;; Can access via published collection (EE feature)
    (perms/can-access-via-collection? instance)))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Table pk))))

(defmethod mi/can-query? :model/Table
  ;; Check if user can execute queries against this table.
  ;; True if user has:
  ;; - Both view-data AND create-queries permissions, OR
  ;; - Access via published table in a collection (EE feature)
  ([instance]
   (or
    ;; Has both view-data and create-queries permissions
    (and (perms/user-has-permission-for-table?
          api/*current-user-id*
          :perms/view-data
          :unrestricted
          (:db_id instance)
          (:id instance))
         (perms/user-has-permission-for-table?
          api/*current-user-id*
          :perms/create-queries
          :query-builder
          (:db_id instance)
          (:id instance)))
    ;; Can access via published collection (EE feature)
    (perms/can-access-via-collection? instance)))
  ([_ pk]
   (mi/can-query? (t2/select-one :model/Table pk))))

(defenterprise current-user-can-write-table?
  "OSS implementation. Returns a boolean whether the current user can write the given table.
   Checks both that the user is a superuser and that the table is editable (not in a remote-synced
   collection in read-only mode)."
  metabase-enterprise.advanced-permissions.common
  [instance]
  (and (remote-sync/table-editable? instance)
       (mi/superuser?)))

(defmethod mi/can-write? :model/Table
  ;; Check if user can modify this table's metadata.
  ;; Requires the manage-table-metadata permission
  ([instance]
   (current-user-can-write-table? instance))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/Table pk))))

(methodical/defmethod t2/batched-hydrate [:model/Table :can_write]
  "Batched hydration for :can_write on tables. Pre-fetches collection is_remote_synced values
   to avoid N+1 queries when checking remote-sync permissions for multiple tables."
  [_model k tables]
  (let [;; Get all unique collection IDs (excluding nil)
        collection-ids (->> tables
                            (keep :collection_id)
                            distinct)
        ;; Batch fetch is_remote_synced for all collections
        collection-synced-map (if (seq collection-ids)
                                (into {}
                                      (map (juxt :id :is_remote_synced))
                                      (t2/select :model/Collection :id [:in collection-ids]))
                                {})
        ;; Associate collection info with each table so table-editable? doesn't need to query
        tables-with-collection (for [table tables]
                                 (if-let [coll-id (:collection_id table)]
                                   (assoc table :collection {:id coll-id
                                                             :is_remote_synced (get collection-synced-map coll-id false)})
                                   table))]
    (mi/instances-with-hydrated-data
     tables k
     #(u/index-by :id mi/can-write? tables-with-collection)
     :id
     {:default false})))

(methodical/defmethod t2/batched-hydrate [:model/Table :owner]
  "Add owner (user) to a table. If owner_user_id is set, fetches the user.
   If owner_email is set instead, returns a map with just the email."
  [_model _k tables]
  (if-not (seq tables)
    tables
    (let [owner-user-ids (into #{} (keep :owner_user_id) tables)
          id->owner (when (seq owner-user-ids)
                      (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                                        :id [:in owner-user-ids]))]
      (for [table tables]
        (assoc table :owner
               (cond
                 (:owner_user_id table)
                 (get id->owner (:owner_user_id table))

                 (:owner_email table)
                 {:email (:owner_email table)}))))))

;;; ------------------------------------------------ SQL Permissions ------------------------------------------------

(mu/defmethod mi/visible-filter-clause :model/Table
  [_                  :- :keyword
   column-or-exp      :- :any
   user-info          :- perms/UserInfo
   permission-mapping :- perms/PermissionMapping]
  (perms/visible-table-filter-with-cte column-or-exp user-info permission-mapping))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Table
  [_table]
  [:schema :name (serdes/hydrated-hash :db :db_id)])

;;; ------------------------------------------------ Field ordering -------------------------------------------------

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(defn update-field-positions!
  "Update `:position` of field belonging to table `table` accordingly to `:field_order`"
  [table]
  (doall
   (map-indexed (fn [new-position field]
                  (t2/update! :model/Field (u/the-id field) {:position new-position}))
                ;; Can't use `select-field` as that returns a set while we need an ordered list
                (t2/select [:model/Field :id]
                           :table_id  (u/the-id table)
                           {:order-by (case (:field_order table)
                                        :custom       [[:custom_position :asc]]
                                        :smart        [[[:case
                                                         (app-db/isa :semantic_type :type/PK)       0
                                                         (app-db/isa :semantic_type :type/Name)     1
                                                         (app-db/isa :semantic_type :type/Temporal) 2
                                                         :else                                     3]
                                                        :asc]
                                                       [:%lower.name :asc]]
                                        :database     [[:database_position :asc]]
                                        :alphabetical [[:%lower.name :asc]])}))))

(defn- valid-field-order?
  "Field ordering is valid if all the fields from a given table are present and only from that table."
  [table field-ordering]
  (= (t2/select-pks-set :model/Field
                        :table_id (u/the-id table)
                        :active   true)
     (set field-ordering)))

(defn custom-order-fields!
  "Set field order to `field-order`."
  [table field-order]
  {:pre [(valid-field-order? table field-order)]}
  (t2/with-transaction [_]
    (t2/update! :model/Table (u/the-id table) {:field_order :custom})
    (dorun
     (map-indexed (fn [position field-id]
                    (t2/update! :model/Field field-id {:position        position
                                                       :custom_position position}))
                  field-order))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Table :field_values]
  "Return the FieldValues for all Fields belonging to a single `table`."
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(-> (group-by :table_id (t2/select [:model/FieldValues :field_id :values :field.table_id]
                                       {:join  [[:metabase_field :field] [:= :metabase_fieldvalues.field_id :field.id]]
                                        :where [:and
                                                [:in :field.table_id [(map :id tables)]]
                                                [:= :field.visibility_type  "normal"]
                                                [:= :metabase_fieldvalues.type "full"]]}))
        (update-vals (fn [fvs] (->> fvs (map (juxt :field_id :values)) (into {})))))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/Table :transform]
  "Hydrate transforms that created the tables."
  [_model k tables]
  (if config/ee-available?
    (mi/instances-with-hydrated-data
     tables k
     #(let [table-ids                (map :id tables)
            table-id->transform-id   (t2/select-fn->fn :from_entity_id :to_entity_id :model/Dependency
                                                       :from_entity_type "table"
                                                       :from_entity_id [:in table-ids]
                                                       :to_entity_type "transform")
            transform-id->transform  (when-let [transform-ids (seq (vals table-id->transform-id))]
                                       (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))]
        (update-vals table-id->transform-id transform-id->transform))
     :id
     {:default nil})
    ;; EE not available, so no transforms
    tables))

(methodical/defmethod t2/batched-hydrate [:model/Table :pk_field]
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(t2/select-fn->fn :table_id :id
                      :model/Field
                      :table_id        [:in (map :id tables)]
                      :semantic_type   (app-db/isa :type/PK)
                      :visibility_type [:not-in ["sensitive" "retired"]])
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
      (t2/select :model/Segment :table_id [:in table-ids], :archived false, {:order-by [[:name :asc]]}))
    tables))

(mi/define-batched-hydration-method with-measures
  :measures
  "Efficiently hydrate the Measures for a collection of `tables`."
  [tables]
  (with-objects :measures
    (fn [table-ids]
      (t2/select :model/Measure :table_id [:in table-ids], :archived false, {:order-by [[:name :asc]]}))
    tables))

(mi/define-batched-hydration-method with-metrics
  :metrics
  "Efficiently hydrate the Metrics for a collection of `tables`."
  [tables]
  (with-objects :metrics
    (fn [table-ids]
      (->> (t2/select :model/Card
                      :table_id [:in table-ids],
                      :archived false,
                      :type :metric,
                      {:order-by [[:name :asc]]})
           (filter mi/can-read?)))
    tables))

(defn with-fields
  "Efficiently hydrate the Fields for a collection of `tables`."
  [tables]
  (with-objects :fields
    (fn [table-ids]
      (t2/select :model/Field
                 :active          true
                 :table_id        [:in table-ids]
                 :visibility_type [:not= "retired"]
                 {:order-by       field-order-rule}))
    tables))

(mi/define-batched-hydration-method fields
  :fields
  "Efficiently hydrate the Fields for a collection of `tables`"
  [tables]
  (with-fields tables))

;;; ------------------------------------------------ Convenience Fns -------------------------------------------------

(defn database
  "Return the `Database` associated with this `Table`."
  [table]
  (t2/select-one :model/Database :id (:db_id table)))

;;; ------------------------------------------------- Serialization -------------------------------------------------
(defmethod serdes/dependencies "Table" [{:keys [db_id collection_id]}]
  (cond-> [[{:model "Database" :id db_id}]]
    collection_id (conj [{:model "Collection" :id collection_id}])))

(defmethod serdes/descendants "Table" [_model-name id {:keys [skip-archived]}]
  (let [fields   (into {} (for [field-id (t2/select-pks-set :model/Field {:where [:= :table_id id]})]
                            {["Field" field-id] {"Table" id}}))
        segments (into {} (for [segment-id (t2/select-pks-set :model/Segment
                                                              {:where [:and
                                                                       [:= :table_id id]
                                                                       (when skip-archived [:not :archived])]})]
                            {["Segment" segment-id] {"Table" id}}))
        measures (into {} (for [measure-id (t2/select-pks-set :model/Measure
                                                              {:where [:and
                                                                       [:= :table_id id]
                                                                       (when skip-archived [:not :archived])]})]
                            {["Measure" measure-id] {"Table" id}}))]
    (merge fields segments measures)))

(defmethod serdes/generate-path "Table" [_ table]
  (let [db-name (t2/select-one-fn :name :model/Database :id (:db_id table))]
    (filterv some? [{:model "Database" :id db-name}
                    (when (:schema table)
                      {:model "Schema" :id (:schema table)})
                    {:model "Table" :id (:name table)}])))

(defmethod serdes/entity-id "Table" [_ {:keys [name]}]
  name)

(defmethod serdes/load-find-local "Table"
  [path]
  (let [db-name     (-> path first :id)
        schema-name (when (= 3 (count path))
                      (-> path second :id))
        table-name  (-> path last :id)
        db-id       (t2/select-one-pk :model/Database :name db-name)]
    (t2/select-one :model/Table :name table-name :db_id db-id :schema schema-name)))

(defmethod serdes/make-spec "Table" [_model-name _opts]
  {:copy      [:name :description :entity_type :active :display_name :visibility_type :schema
               :points_of_interest :caveats :show_in_getting_started :field_order :initial_sync_status :is_upload
               :database_require_filter :is_defective_duplicate :unique_table_helper :is_writable :data_authority
               :data_source :owner_email :owner_user_id :is_published]
   :skip      [:estimated_row_count :view_count]
   :transform {:created_at     (serdes/date)
               :archived_at    (serdes/date)
               :deactivated_at (serdes/date)
               :data_layer     (serdes/optional-kw)
               :db_id          (serdes/fk :model/Database :name)
               :collection_id  (serdes/fk :model/Collection)}})

(defmethod serdes/storage-path "Table" [table _ctx]
  (concat (serdes/storage-path-prefixes (serdes/path table))
          [(:name table)]))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "table"
  {:model        :model/Table
   :attrs        {;; legacy search uses :active for this, but then has a rule to only ever show active tables
                  ;; so we moved that to the where clause
                  :archived      false
                  ;; For published tables with no collection, we want to show "root" as the collection id
                  :collection-id true
                  :creator-id    false
                  :database-id   :db_id
                  :view-count    true
                  :created-at    true
                  :updated-at    true
                  :is-published  :is_published}
   :search-terms {:name         search.spec/explode-camel-case
                  :display_name true
                  :description  true}
   :render-terms {:initial-sync-status        true
                  :table-id                   :id
                  :table-description          :description
                  :table-name                 :name
                  :table-schema               :schema
                  :database-name              :db.name
                  :collection-authority_level :collection.authority_level
                  :collection-location        :collection.location
                  ;; For published tables with no collection, show "Our analytics" as the collection name
                  :collection-name            [:coalesce :collection.name
                                               [:case
                                                [:and :this.is_published
                                                 [:= :this.collection_id nil]] [:inline "Our analytics"]
                                                :else nil]]
                  :collection-type            :collection.type}
   :where        [:and
                  :active
                  [:= :visibility_type nil]
                  [:= :db.router_database_id nil]
                  [:not= :db_id [:inline audit/audit-db-id]]]
   :joins        {:db         [:model/Database   [:= :db.id :this.db_id]]
                  :collection [:model/Collection [:and [:= :this.is_published true] [:= :collection.id :this.collection_id]]]}})
