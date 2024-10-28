(ns metabase.models.table
  (:require
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.serialization :as serdes]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.search :as search]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Constants + Entity -----------------------------------------------

(def visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`).
   (Basically any non-nil value is a reason for hiding the table.)"
  #{:hidden :technical :cruft})

(def field-orderings
  "Valid values for `Table.field_order`.
  `:database`     - use the same order as in the table definition in the DB;
  `:alphabetical` - order alphabetically by name;
  `:custom`       - the user manually set the order in the data model
  `:smart`        - Try to be smart and order like you'd usually want it: first PK, followed by `:type/Name`s, then
                    `:type/Temporal`s, and from there on in alphabetical order."
  #{:database :alphabetical :custom :smart})

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(def Table
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all the Table symbol in our codebase."
  :model/Table)

(methodical/defmethod t2/table-name :model/Table [_model] :metabase_table)

(doto :model/Table
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Table
  {:entity_type     mi/transform-keyword
   :visibility_type mi/transform-keyword
   :field_order     mi/transform-keyword})

(methodical/defmethod t2/model-for-automagic-hydration [:default :table]
  [_original-model _k]
  :model/Table)

(t2/define-before-insert :model/Table
  [table]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name table))
                  :field_order  (driver/default-field-order (t2/select-one-fn :engine :model/Database :id (:db_id table)))}]
    (merge defaults table)))

(t2/define-before-delete :model/Table
  [table]
  ;; We need to use toucan to delete the fields instead of cascading deletes because MySQL doesn't support columns with cascade delete
  ;; foreign key constraints in generated columns. #44866
  (t2/delete! :model/Field :table_id (:id table)))

(defn- set-new-table-permissions!
  [table]
  (t2/with-transaction [_conn]
    (let [all-users-group  (perms-group/all-users)
          non-magic-groups (perms-group/non-magic-groups)
          non-admin-groups (conj non-magic-groups all-users-group)]
      ;; Data access permissions
      (if (= (:db_id table) audit/audit-db-id)
        (do
         ;; Tables in audit DB should start out with no query access in all groups
          (data-perms/set-new-table-permissions! non-admin-groups table :perms/view-data :unrestricted)
          (data-perms/set-new-table-permissions! non-admin-groups table :perms/create-queries :no))
        (do
          ;; Normal tables start out with unrestricted data access in all groups, but query access only in All Users
          (data-perms/set-new-table-permissions! (conj non-magic-groups all-users-group) table :perms/view-data :unrestricted)
          (data-perms/set-new-table-permissions! [all-users-group] table :perms/create-queries :query-builder)
          (data-perms/set-new-table-permissions! non-magic-groups table :perms/create-queries :no)))
      ;; Download permissions
      (data-perms/set-new-table-permissions! [all-users-group] table :perms/download-results :one-million-rows)
      (data-perms/set-new-table-permissions! non-magic-groups table :perms/download-results :no)
      ;; Table metadata management
      (data-perms/set-new-table-permissions! non-admin-groups table :perms/manage-table-metadata :no))))

(t2/define-after-insert :model/Table
  [table]
  (u/prog1 table
    (set-new-table-permissions! table)))

(defmethod mi/can-read? :model/Table
  ([instance]
   (and (data-perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/view-data
         :unrestricted
         (:db_id instance)
         (:id instance))
        (data-perms/user-has-permission-for-table?
         api/*current-user-id*
         :perms/create-queries
         :query-builder
         (:db_id instance)
         (:id instance))))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Table pk))))

(defenterprise current-user-can-write-table?
  "OSS implementation. Returns a boolean whether the current user can write the given field."
  metabase-enterprise.advanced-permissions.common
  [_instance]
  (mi/superuser?))

(defmethod mi/can-write? :model/Table
  ([instance]
   (current-user-can-write-table? instance))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/Table pk))))

(defmethod serdes/hash-fields :model/Table
  [_table]
  [:schema :name (serdes/hydrated-hash :db)])

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
                                                         (mdb.query/isa :semantic_type :type/PK)       0
                                                         (mdb.query/isa :semantic_type :type/Name)     1
                                                         (mdb.query/isa :semantic_type :type/Temporal) 2
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
  (t2/update! Table (u/the-id table) {:field_order :custom})
  (doall
   (map-indexed (fn [position field-id]
                  (t2/update! :model/Field field-id {:position        position
                                                     :custom_position position}))
                field-order)))

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

(methodical/defmethod t2/batched-hydrate [:model/Table :pk_field]
  [_model k tables]
  (mi/instances-with-hydrated-data
   tables k
   #(t2/select-fn->fn :table_id :id
                      :model/Field
                      :table_id        [:in (map :id tables)]
                      :semantic_type   (mdb.query/isa :type/PK)
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
(defmethod serdes/dependencies "Table" [table]
  [[{:model "Database" :id (:db_id table)}]])

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
    (t2/select-one Table :name table-name :db_id db-id :schema schema-name)))

(defmethod serdes/make-spec "Table" [_model-name _opts]
  {:copy      [:name :description :entity_type :active :display_name :visibility_type :schema
               :points_of_interest :caveats :show_in_getting_started :field_order :initial_sync_status :is_upload
               :database_require_filter]
   :skip      [:estimated_row_count :view_count]
   :transform {:created_at (serdes/date)
               :db_id      (serdes/fk :model/Database :name)}})

(defmethod serdes/storage-path "Table" [table _ctx]
  (concat (serdes/storage-path-prefixes (serdes/path table))
          [(:name table)]))

;;; -------------------------------------------------- Audit Log Table -------------------------------------------------

(defmethod audit-log/model-details Table
  [table _event-type]
  (select-keys table [:id :name :db_id]))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "table"
  {:model        :model/Table
   :context      {:collection_id nil
                  :database_id   :db_id
                  :table_id      :id}
   :archived     [:not :active]
   :search-terms [:name :description :display_name]

   :render-terms [:initial_sync_status
                  [:description :table_description]
                  [:name :table_name]
                  [:schema :table_schema]
                  [:db.name :database_name]]

   :created-at   true
   :updated-at   true

   :skip         {:visibility_type [:not nil]
                  :db_id           audit/audit-db-id}

   :joins        {:db [:model/Database [:= :db.id :this.db_id]]}})

(search/define-spec "segment"
  {:model        :model/Segment
   :context      {:collection_id :id
                  :database_id   :table.db_id
                  :table_id      :table_id}
   :archived     :archived
   :search-terms [:name :description]

   :render-terms [[:table.description :table_description]
                  [:table.schema :table_schema]
                  [:table.name :table_name]]

   :created-at   true
   :updated-at   true

   :joins        {:table [:model/Table [:= :table.id :this.table_id]]}})

(search/define-spec "collection"
  {:model        :model/Collection
   :context      {:collection_id :id
                  :database_id   nil
                  :table_id      nil}
   :archived     :archived
   :search-terms [:name]

   :render-terms [[:type :collection_type]
                  [:name :collection_name]
                  [:authority_level :collection_authority_level]
                  :archived_directly
                  ;; why not make this a search term?
                  :description
                  ;; bookmark (inserted just-in-time from join for ranking and rendering)
                  :location]

   :created-at   true
   :updated-at   false

   :skip         {:namespace [:not nil]}

   ;; depends on the current user, used for rendering and ranking
   :bookmark     [:model/CollectionBookmark [:and
                                             [:= :bookmark.collection_id :this.id]
                                             ;; a magical alias, :current_user (or perhaps this clause can be implicit)
                                             [:= :bookmark.user_id :current_user/id]]]})

(search/define-spec "card"
  {:model        :model/Card
   :context      {:collection_id :collection_id
                  :database_id   nil
                  :table_id      nil}
   :archived     :archived
   ;; TODO :dataset_query if native
   :search-terms [:name :description]

   :render-terms [[:collection.name :collection_name]
                  [:collection.type :collection_type]
                  [:collection.location :collection_location]
                  [:collection.authority_level :collection_authority_level]
                  :archived_directly
                  :collection_position
                  :creator_id
                  ;; dashboard count (TODO oh, best query this when rendering)
                  [:r.timestamp :last_edited_at]
                  [:r.user_id :last_editor_id]
                  [:mr.status :moderated_status]
                  :display
                  :dataset_query]

   :bookmark     [:model/CardBookmark [:and
                                       [:= :bookmark.card_id :this.id]
                                       [:= :bookmark.user_id :current_user/id]]]

   :skip         {:this.type            [:not "question"]
                  :collection.namespace [:not nil]}

   :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                  :r          [:model/Revision [:and
                                                [:= :r.model_id :this.id]
                                                ;; Interesting for inversion - this is a condition on whether to do the update.
                                                ;; For now let's just swallow up spurious updates (should be 2x amplification)
                                                [:= :r.most_recent true]
                                                [:= :r.model "Card"]]]
                  :mr         [:model/ModerationReview [:and
                                                        [:= :mr.moderated_item_type "card"]
                                                        [:= :mr.moderated_item_id :this.id]
                                                        [:= :mr.most_recent true]]]}

   :created-at   true
   :updated-at   true})
