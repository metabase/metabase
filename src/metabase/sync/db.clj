(ns metabase.sync.db
  "Application database queries for the sync module, which reads the user settings of Tables and Fields to leave the
  values users set alone."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings]
   [toucan2.core :as t2]))

(declare sync-tables-clause)

(mu/defn- synced-table-ids-query :- :map
  "The query of the ids of the Tables of the Database with `database-id` that take part in sync."
  [database-id :- ::lib.schema.id/database]
  ^:allow-subquery {:select [:id]
                    :from   [(t2/table-name :model/Table)]
                    :where  [:and (sync-tables-clause :metabase_table) [:= :db_id database-id]]})

(mu/defn- sync-tables-clause
  "Honey SQL clause matching the Tables aliased `table-alias` that take part in sync: active, with no
  `visibility_type`."
  [table-alias :- :keyword]
  [:and
   [:= (u/qualified-key table-alias :active) true]
   [:= (u/qualified-key table-alias :visibility_type) nil]])

;;; ------------------------------------------------ Database ------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn database-initial-sync-status
  "The `initial_sync_status` of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :initial_sync_status :model/Database :id database-id))

(mu/defn database-sample?
  "Whether the Database with `database-id` is the Sample Database."
  [database-id :- ::lib.schema.id/database]
  (boolean (t2/select-one-fn :is_sample :model/Database :id database-id)))

(mu/defn attached-dwh-database-id
  "The ID of the attached data warehouse Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_attached_dwh true))

(mu/defn database-stub?
  "Whether the Database with `database-id` is a stub."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :is_stub :model/Database :id database-id))

(mu/defn database-on-demand-flags
  "A map of Database ID to its `:is_on_demand` flag for `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (app-db/select-batched-map #(t2/select-pk->fn :is_on_demand :model/Database :id [:in %]) database-ids))

(mu/defn synced-user-database-exists?
  "Whether any non-sample, non-audit Database has completed its initial sync."
  []
  (t2/exists? :model/Database :is_sample false :is_audit false :initial_sync_status "complete"))

(mu/defn databases-with-schedules-reducible
  "Reducible raw Database rows whose sync schedules are the sample or default ones."
  [old-sample-metadata-cron  :- :string
   metadata-crons            :- [:set :string]
   cache-field-values-crons  :- [:set :string]]
  (t2/reducible-query {:select [:*]
                       :from   [:metabase_database]
                       :where  [:or
                                [:and
                                 [:= :is_sample true]
                                 [:= :metadata_sync_schedule old-sample-metadata-cron]]
                                [:in :metadata_sync_schedule metadata-crons]
                                [:in :cache_field_values_schedule cache-field-values-crons]]}))

;;; ------------------------------------------------- Table -------------------------------------------------

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-in-database
  "The Table with `table-id` in the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   table-id    :- ::lib.schema.id/table]
  (t2/select-one :model/Table :db_id database-id :id table-id))

(mu/defn table-by-name
  "The Table named `table-name` in the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   table-name  :- :string]
  (t2/select-one :model/Table :db_id database-id :name table-name))

(mu/defn table-by-schema-and-name
  "The Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :db_id database-id :name table-name :schema schema))

(mu/defn inactive-table-by-schema-and-name
  "The inactive Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :db_id database-id :schema schema :name table-name :active false))

(mu/defn active-table-id-by-name
  "The ID of the active Table named `table-name` in the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   table-name  :- :string]
  (t2/select-one-pk :model/Table :db_id database-id :name table-name :active true))

(mu/defn active-tables-by-lower-names
  "The active Tables of the Database with `database-id` whose lower-cased name is one of `lower-names`, hidden ones
  included, each with its lower-cased name and schema as the database computes them under `:lower_name` and
  `:lower_schema`."
  [database-id :- ::lib.schema.id/database
   lower-names :- [:sequential {:min 1} :string]]
  (app-db/select-batched #(t2/select [:model/Table :metabase_table.* [:%lower.name :lower_name] [:%lower.schema :lower_schema]]
                                     {:where [:and
                                              [:= :db_id [:auto/param database-id]]
                                              [:in [:lower :name] [:auto/param %]]
                                              [:= :active true]]})
                         (distinct lower-names)))

(mu/defn tables-by-name
  "The `columns` of the Tables of the Database with `database-id` named one of `table-names`."
  [columns      :- [:sequential :keyword]
   database-id  :- ::lib.schema.id/database
   table-names  :- [:sequential :string]]
  (app-db/select-batched #(t2/select columns :db_id database-id :name [:in %]) (distinct table-names)))

(mu/defn tables-to-archive
  "The inactive, unarchived, non-transform-target Tables of the Database with `database-id` deactivated more than
  `amount` `unit`s (e.g. `-14 :day`) before the app DB's now."
  [database-id :- ::lib.schema.id/database
   amount      :- :int
   unit        :- :keyword]
  (t2/select :model/Table
             :db_id database-id
             :active false
             :archived_at nil
             :transform_target false
             :deactivated_at [:< (h2x/add-interval-honeysql-form (app-db/db-type) :%now amount unit)]))

(mu/defn table-database-ids
  "A map of Table ID to Database ID for `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched-map #(t2/select-pk->fn :db_id :model/Table :id [:in %]) table-ids))

(mu/defn table-schemas-reducible
  "Reducible `:schema` rows of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-select [:model/Table :schema] :db_id database-id))

(mu/defn active-table-ids-reducible
  "Reducible `:id` rows of the active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-select [:model/Table :id] :db_id database-id :active true))

(mu/defn active-table-count
  "The number of active Tables in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/count :model/Table :db_id database-id :active true))

(mu/defn sync-table-ids
  "The IDs of the synced Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-vec :id :model/Table :db_id database-id {:where (sync-tables-clause (t2/table-name :model/Table))}))

(mu/defn sync-table-schemas
  "The distinct `:schema` rows of the synced Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select-distinct [:schema]
             :from            [[(t2/table-name :model/Table) :t]]
             :where           [:and (sync-tables-clause :t) [:= :t.db_id database-id]]}))

(mu/defn sync-tables-count
  "The number of synced Tables in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/count :model/Table :db_id database-id {:where (sync-tables-clause (t2/table-name :model/Table))}))

(mu/defn sync-tables-reducible
  "Reducible synced Tables of the Database with `database-id` ordered by schema and name, optionally narrowed to
  `schema-names` and/or `table-names`."
  [database-id  :- ::lib.schema.id/database
   schema-names :- [:maybe [:or [:set [:maybe :string]] [:sequential [:maybe :string]]]]
   table-names  :- [:maybe [:or [:set :string] [:sequential :string]]]]
  (t2/reducible-select :model/Table
                       :db_id database-id
                       {:where    [:and (sync-tables-clause (t2/table-name :model/Table))
                                   (when (seq schema-names) [:in :schema schema-names])
                                   (when (seq table-names) [:in :name table-names])]
                        :order-by [[:schema :asc] [:name :asc]]}))

(mu/defn sync-tables-by-earliest-analyzed-reducible
  "Reducible synced Tables of the Database with `database-id` ordered by the earliest `last_analyzed` of their Fields."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-select :model/Table
                       {:select    [:t.*]
                        :from      [[(t2/table-name :model/Table) :t]]
                        :left-join [[^:allow-subquery {:select   [:table_id
                                                                  [[:min :last_analyzed] :earliest_last_analyzed]]
                                                       :from     [(t2/table-name :model/Field)]
                                                       :group-by [:table_id]} :sub]
                                    [:= :t.id :sub.table_id]]
                        :where     [:and (sync-tables-clause :t) [:= :t.db_id database-id]]
                        :order-by  [[:sub.earliest_last_analyzed :asc]]}))

(mu/defn table-user-settings :- [:maybe ::warehouse-schema.schema/table-user-settings]
  "The TableUserSettings of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/TableUserSettings :table_id table-id))

(mu/defn table-user-settings-for-tables :- [:sequential ::warehouse-schema.schema/table-user-settings]
  "The TableUserSettings of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/TableUserSettings :table_id [:in %]) table-ids))

(mu/defn fields
  "The Fields with `field-ids`, which `our-metadata` diffs against the warehouse."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Field :id [:in %]) field-ids))

(mu/defn fields-for-field-values
  "The columns needed to scan FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select [:model/Field :name :id :base_type :effective_type :coercion_strategy :semantic_type
                                      :visibility_type :table_id :has_field_values]
                                     :id [:in %])
                         field-ids))

(mu/defn active-fields-metadata-for-table
  "The sync metadata columns of the active Fields of the Table with `table-id`, in field order."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :name :database_type :base_type :effective_type :coercion_strategy :semantic_type
              :parent_id :id :description :database_position :nfc_path
              :database_is_auto_increment :database_required
              :database_default :database_is_generated :database_is_nullable :database_is_pk
              :database_partitioned :json_unfolding :position :preview_display :visibility_type]
             :table_id table-id
             :active true
             {:order-by [[:position :asc] [:%lower.name :asc]]}))

(mu/defn active-fields-metadata-for-tables
  "The sync metadata columns of the active Fields of the Tables with `table-ids`, with their `:table_id`."
  [table-ids :- [:sequential {:min 1} ::lib.schema.id/table]]
  (app-db/select-batched
   #(t2/select [:model/Field :table_id :name :database_type :base_type :effective_type :coercion_strategy :semantic_type
                :parent_id :id :description :database_position :nfc_path
                :database_is_auto_increment :database_required
                :database_default :database_is_generated :database_is_nullable :database_is_pk
                :database_partitioned :json_unfolding :position :preview_display :visibility_type]
               {:where [:and
                        [:in :table_id [:auto/param %]]
                        [:= :active true]]})
   table-ids))

(mu/defn inactive-fields-by-lower-name
  "The inactive Fields of the Table with `table-id` under `parent-id` whose lower-cased name is one of `lower-names`."
  [table-id    :- ::lib.schema.id/table
   parent-id   :- [:maybe ms/PositiveInt]
   lower-names :- [:sequential :string]]
  (app-db/select-batched #(t2/select :model/Field
                                     :table_id table-id
                                     :%lower.name [:in %]
                                     :parent_id parent-id
                                     :active false)
                         (distinct lower-names)))

(mu/defn inactive-top-level-fields-by-lower-name-for-tables
  "The inactive top-level Fields of the Tables with `table-ids` whose lower-cased name is one of `lower-names`, each
  with its lower-cased name as the database computes it under `:lower_name`."
  [table-ids   :- [:sequential {:min 1} ::lib.schema.id/table]
   lower-names :- [:sequential {:min 1} :string]]
  (app-db/select-batched
   (fn [table-ids]
     (app-db/select-batched #(t2/select [:model/Field :metabase_field.* [:%lower.name :lower_name]]
                                        {:where [:and
                                                 [:in :table_id [:auto/param table-ids]]
                                                 [:in [:lower :name] [:auto/param %]]
                                                 [:= :parent_id nil]
                                                 [:= :active false]]})
                            (distinct lower-names)))
   table-ids))

(mr/def ::cursor
  "A keyset-pagination cursor over Field ids: zero starts before the first Field, since ids are positive."
  [:int {:min 0}])

(mu/defn- unscored-fields-clause
  "Honey SQL conditions matching the active, visible Fields of the Database with `database-id` that have no
  dimension interestingness score."
  [database-id :- ::lib.schema.id/database]
  [:and
   [:= :active true]
   [:= :dimension_interestingness nil]
   [:not-in :visibility_type ["sensitive" "retired"]]
   [:in :table_id ^:allow-subquery {:select [:id]
                                    :from   [(t2/table-name :model/Table)]
                                    :where  [:= :db_id database-id]}]])

(mu/defn unscored-field-ids-for-database :- [:sequential ::lib.schema.id/field]
  "The ids of up to `limit` active, visible Fields of the Database with `database-id` without a dimension
  interestingness score, lowest id first, starting after `after-id`.

  Selecting ids alone keeps the page cheap enough to walk a very large `metabase_field` -- the ordering and the
  `after-id` bound are served by the primary key, and the caller fetches whole Fields a page at a time through
  [[fields-for-interestingness-scoring]]."
  [database-id :- ::lib.schema.id/database
   after-id    :- ::cursor
   limit       :- ms/PositiveInt]
  ;; `select-fn-vec` gives nil rather than an empty vector when nothing matches, which is every call once the
  ;; backfill has caught up
  (or (t2/select-fn-vec :id :model/Field
                        {:select   [:id]
                         :from     [(t2/table-name :model/Field)]
                         :where    [:and (unscored-fields-clause database-id) [:> :id after-id]]
                         :order-by [[:id :asc]]
                         :limit    limit})
      []))

(mu/defn unscored-field-count-for-database :- :int
  "How many active, visible Fields of the Database with `database-id` have no dimension interestingness score."
  [database-id :- ::lib.schema.id/database]
  (t2/count :model/Field {:where (unscored-fields-clause database-id)}))

(mu/defn fields-for-interestingness-scoring :- [:sequential (ms/InstanceOf :model/Field)]
  "The Fields with `field-ids`, for interestingness scoring."
  [field-ids :- [:sequential {:min 1} ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Field :id [:in %]) field-ids))

(mu/defn top-level-field-ids-by-name
  "The IDs of the top-level Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ::lib.schema.id/table
   field-names :- [:sequential :string]]
  (not-empty (app-db/select-batched #(t2/select-pks-vec :model/Field :name [:in %] :table_id table-id :parent_id nil)
                                    (distinct field-names))))

(mu/defn top-level-field-ids-by-schema-table-and-name-reducible
  "Reducible `:id` rows of the top-level Fields of the Database with `database-id` matching one of the
  `[schema table-name field-name]` triples in `schema+table+names`, with a nil schema spelled `\"__null__\"`."
  [database-id        :- ::lib.schema.id/database
   schema+table+names :- [:sequential [:tuple :string :string :string]]]
  (app-db/select-batched-reducible #(t2/reducible-query {:select     [[:f.id]]
                                                         :from       [[(t2/table-name :model/Field) :f]]
                                                         :inner-join [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                                                         :where      [:and
                                                                      [:in [:composite [:coalesce :t.schema "__null__"] :t.name :f.name] %]
                                                                      [:= :t.db_id database-id]
                                                                      [:= :parent_id nil]]}) schema+table+names))

(mu/defn indexed-field-ids-for-table
  "The IDs of the Fields of the Table with `table-id` marked as indexed."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :database_indexed true))

(mu/defn indexed-top-level-field-ids-for-database
  "The IDs of the top-level Fields of the Database with `database-id` marked as indexed."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Field
                     {}
                     :table_id [:in ^:allow-subquery {:select [[:t.id]]
                                                      :from   [[(t2/table-name :model/Table) :t]]
                                                      :where  [:= :t.db_id database-id]}]
                     :parent_id nil
                     :database_indexed true))

(mu/defn field-user-settings :- [:maybe ::warehouse-schema.schema/field-user-settings]
  "The FieldUserSettings of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(mu/defn database-ids-of-tables :- [:set ::lib.schema.id/database]
  "The ids of the Databases of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (set (app-db/select-batched-set #(t2/select-fn-set :db_id :model/Table :id [:in [:auto/param %]]) table-ids)))

(mu/defn database-ids-of-fields :- [:set ::lib.schema.id/database]
  "The ids of the Databases of the Tables of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (set (app-db/select-batched-set #(map :db_id (t2/query {:select-distinct [:t.db_id]
                                                          :from            [[(t2/table-name :model/Table) :t]]
                                                          :join            [[(t2/table-name :model/Field) :f]
                                                                            [:= :f.table_id :t.id]]
                                                          :where           [:in :f.id [:auto/param %]]}))
                                  field-ids)))

(mu/defn field-user-settings-for-fields :- [:sequential ::warehouse-schema.schema/field-user-settings]
  "The FieldUserSettings of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/FieldUserSettings :field_id [:in %]) field-ids))

(defn- lower-key
  "The key by which fk metadata and Fields are matched: the lower-cased schema, table and column names."
  [schema table column]
  [(some-> schema u/lower-case-en) (u/lower-case-en table) (u/lower-case-en column)])

(mu/defn fk-target-changes-for-entries :- [:sequential [:map {:closed true}
                                                        [:id ::lib.schema.id/field]
                                                        [:changes :map]
                                                        [:entry :map]]]
  "For each of `entries`, foreign key metadata with the `:fk-table-schema`, `:fk-table-name` and `:fk-column-name` of
  a Field and the `:pk-` ones of the Field it points at, in the Database with `db-id`: the id of the Field and the
  changes that point it at the target, with the entry, leaving out an entry whose Fields are missing, that already
  points there, or whose Field has a user-set target, with the Fields of all entries, then their rows and settings,
  read together."
  [db-id   :- ::lib.schema.id/database
   entries :- [:sequential :map]]
  (if (empty? entries)
    []
    (let [table-names (into [] (comp (mapcat (juxt :fk-table-name :pk-table-name)) (map u/lower-case-en) (distinct)) entries)
          candidates  (sort-by :id (app-db/select-batched
                                    #(t2/query {:select    [:f.id [:f.name :column] [:t.name :table] [:t.schema :schema]
                                                            [:u.fk_target_field_id_set :fk_set] [:u.semantic_type_set :semantic_set]]
                                                :from      [[(t2/table-name :model/Field) :f]]
                                                :join      [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                                                :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :f.id :u.field_id]]
                                                :where     [:and
                                                            [:= :t.db_id [:auto/param db-id]]
                                                            [:in [:lower :t.name] [:auto/param %]]
                                                            [:= :f.active true]
                                                            [:not= :f.visibility_type "retired"]
                                                            [:= :t.active true]
                                                            [:= :t.visibility_type nil]]
                                                :order-by  [[:f.id :asc]]})
                                    table-names))
          lowest      (fn [rows] (reduce (fn [m {:keys [id schema table column]}]
                                           (let [k (lower-key schema table column)]
                                             (cond-> m (not (contains? m k)) (assoc k id))))
                                         {}
                                         rows))
          user-set?   (fn [flag] (or (true? flag) (= 1 flag)))
          fk-ids      (lowest (remove #(or (user-set? (:fk_set %)) (user-set? (:semantic_set %))) candidates))
          pk-ids      (lowest candidates)
          resolved    (into []
                            (keep (fn [{:keys [fk-table-schema fk-table-name fk-column-name
                                               pk-table-schema pk-table-name pk-column-name] :as entry}]
                                    (let [fk-id (fk-ids (lower-key fk-table-schema fk-table-name fk-column-name))
                                          pk-id (pk-ids (lower-key pk-table-schema pk-table-name pk-column-name))]
                                      (when (and fk-id pk-id)
                                        {:id fk-id :pk-id pk-id :entry entry}))))
                            entries)]
      (if (empty? resolved)
        []
        (let [fields   (u/index-by :id (app-db/select-batched #(t2/select [:model/Field :id :fk_target_field_id :has_field_values]
                                                                          :id [:in %])
                                                              (mapv :id resolved)))
              settings (u/index-by :field_id (field-user-settings-for-fields (mapv :id resolved)))]
          (into []
                (keep (fn [{:keys [id pk-id entry]}]
                        (let [field    (fields id)
                              user-set (warehouse-schema.user-settings/user-set-field-columns (settings id))]
                          (when (and (not (user-set :fk_target_field_id)) (not= pk-id (:fk_target_field_id field)))
                            {:id      id
                             :changes (apply dissoc
                                             (cond-> {:fk_target_field_id pk-id :semantic_type :type/FK}
                                               (= :auto-list (:has_field_values field)) (assoc :has_field_values nil))
                                             user-set)
                             :entry   entry}))))
                resolved))))))

(mu/defn field-id-by-name :- [:maybe ::lib.schema.id/field]
  "The ID of the Field named `field-name` of the Table with `table-id`, or nil."
  [table-id   :- ::lib.schema.id/table
   field-name :- :string]
  (t2/select-one-pk :model/Field :name field-name :table_id table-id))

(defn- data-sensitivity-to-scan-clause
  "Honey SQL clause matching Fields the data-sensitivity classifier still has to scan: unlabeled ones, plus those it
  labeled `PUBLIC` when `rescan-public?`."
  [rescan-public?]
  (if rescan-public?
    [:or [:= :data_sensitivity nil] [:= :data_sensitivity "PUBLIC"]]
    [:= :data_sensitivity nil]))

(defn- user-set-data-sensitivity-clause
  "Honey SQL clause matching Fields whose `data_sensitivity` a user set."
  []
  [:exists ^:allow-subquery {:select [1]
                             :from   [[(t2/table-name :model/FieldUserSettings) :s]]
                             :where  [:and
                                      [:= :s.field_id :metabase_field.id]
                                      [:not= :s.data_sensitivity nil]]}])

(mu/defn table-ids-with-fields-to-scan-for-data-sensitivity
  "The IDs of the active Tables of the Database with `database-id` that have active, non-retired Fields the
  data-sensitivity classifier still has to scan (see [[data-sensitivity-to-scan-clause]])."
  [database-id    :- ::lib.schema.id/database
   rescan-public? :- [:maybe :boolean]]
  (t2/select-fn-set :table_id :model/Field
                    {:select   [[:metabase_field.table_id :table_id]]
                     :from     [(t2/table-name :model/Field)]
                     :join     [(t2/table-name :model/Table) [:= :metabase_field.table_id :metabase_table.id]]
                     :where    [:and
                                [:= :metabase_table.db_id database-id]
                                [:= :metabase_table.active true]
                                [:= :metabase_field.active true]
                                [:not= :metabase_field.visibility_type "retired"]
                                (data-sensitivity-to-scan-clause rescan-public?)]
                     :group-by [:metabase_field.table_id]}))

(mu/defn tables-by-schema-and-name
  "The Tables with `table-ids`, ordered by schema and name."
  [table-ids :- [:sequential {:min 1} ::lib.schema.id/table]]
  (t2/select :model/Table {:where    [:in :id [:auto/param table-ids]]
                           :order-by [[:schema :asc] [:name :asc]]}))

(mu/defn tables-by-schema-and-name-reducible
  "Reducible Tables with `table-ids`, ordered by schema and name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/reducible-select :model/Table :id [:in table-ids] {:order-by [[:schema :asc] [:name :asc]]}))

(defn- classifier-data-sensitivity-clause
  "Honey SQL clause matching Fields whose non-null `data_sensitivity` the data-sensitivity classifier wrote."
  []
  [:and
   [:not= :data_sensitivity nil]
   [:not (user-set-data-sensitivity-clause)]])

(mu/defn classifier-data-sensitivity-field-ids-of-table :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Table with `table-id` whose `data_sensitivity` the classifier wrote (see
  [[classifier-data-sensitivity-clause]])."
  [table-id :- ::lib.schema.id/table]
  (set (t2/select-pks-set :model/Field {:where [:and [:= :table_id [:auto/param table-id]] (classifier-data-sensitivity-clause)]})))

(mu/defn classifier-data-sensitivity-field-ids-of-database :- [:set ::lib.schema.id/field]
  "The ids of the Fields of every Table of the Database with `database-id` whose `data_sensitivity` the classifier
  wrote (see [[classifier-data-sensitivity-clause]])."
  [database-id :- ::lib.schema.id/database]
  (set (t2/select-pks-set :model/Field {:where [:and
                                                [:in :table_id ^:allow-subquery {:select [:id]
                                                                                 :from   [(t2/table-name :model/Table)]
                                                                                 :where  [:= :db_id [:auto/param database-id]]}]
                                                (classifier-data-sensitivity-clause)]})))

(mu/defn analyzed-field-ids-of-table :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Table with `table-id` that have a fingerprint of `fingerprint-version` and no
  `last_analyzed` yet, which analysis has just finished."
  [table-id            :- ::lib.schema.id/table
   fingerprint-version :- :int]
  (set (t2/select-pks-set :model/Field
                          :table_id            [:auto/param table-id]
                          :fingerprint_version [:auto/param fingerprint-version]
                          :last_analyzed       nil)))

(mu/defn analyzed-field-ids-of-database :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the synced Tables of the Database with `database-id` that have a fingerprint of
  `fingerprint-version` and no `last_analyzed` yet, which analysis has just finished."
  [database-id         :- ::lib.schema.id/database
   fingerprint-version :- :int]
  (set (t2/select-pks-set :model/Field
                          :table_id            [:in (synced-table-ids-query database-id)]
                          :fingerprint_version [:auto/param fingerprint-version]
                          :last_analyzed       nil)))

(mu/defn field-ids-of-table :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (set (t2/select-pks-set :model/Field :table_id [:auto/param table-id])))

(mu/defn table-ids-with-schema :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the Database with `database-id` in `schema`."
  [database-id :- ::lib.schema.id/database
   schema      :- :string]
  (set (t2/select-pks-set :model/Table :db_id [:auto/param database-id] :schema [:auto/param schema])))

;;; --------------------------------------- Metadata sync: what is sent ---------------------------------------

(mu/defn databases-named :- [:sequential (ms/InstanceOf :model/Database)]
  "The Databases named `database-name`, as the app DB's collation compares names, leaving out stubs, the audit
  Database and the destination Databases of database routing."
  [database-name :- :string]
  (t2/select :model/Database {:where    [:and
                                         [:= :name [:auto/param database-name]]
                                         [:= :is_stub false]
                                         [:= :is_audit false]
                                         [:= :router_database_id nil]]
                              :order-by [[:id :asc]]}))

(mr/def ::described-table
  "The columns of a Table that the pages of metadata are made from."
  [:map {:closed true}
   [:id                  ::lib.schema.id/table]
   [:schema              [:maybe :string]]
   [:name                :string]
   [:estimated_row_count [:maybe :int]]])

(mu/defn described-tables :- [:sequential ::described-table]
  "The `id`, `schema`, `name` and `estimated_row_count` of the active Tables of the Database with `database-id`, hidden
  ones included, except the defective duplicates: legacy rows with the key of another Table, which the unique index
  on Tables leaves out."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select [:id :schema :name :estimated_row_count]
             :from   [(t2/table-name :model/Table)]
             :where  [:and
                      [:= :db_id [:auto/param database-id]]
                      [:= :active true]
                      [:= :is_defective_duplicate false]]}))

(mu/defn tables-with-ids :- [:sequential ::warehouse-schema.schema/table]
  "The Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn- described-field-clause
  "Honey SQL clause matching the Fields aliased `field-alias` that metadata sync sends: active and not retired, and
  not a defective duplicate, a legacy row with the name of another Field. A nested Field is sent too, unless an
  ancestor is not."
  [field-alias :- :keyword]
  [:and
   [:= (u/qualified-key field-alias :active) true]
   [:= (u/qualified-key field-alias :is_defective_duplicate) false]
   [:or
    [:= (u/qualified-key field-alias :visibility_type) nil]
    [:not= (u/qualified-key field-alias :visibility_type) "retired"]]])

(mu/defn- top-level-field-clause
  "Honey SQL clause matching the Fields aliased `field-alias` that metadata sync sends and that are top-level: the
  Fields an FK or field values are sent for."
  [field-alias :- :keyword]
  [:and
   (described-field-clause field-alias)
   [:= (u/qualified-key field-alias :parent_id) nil]])

(mu/defn- field-values-field-clause
  "Honey SQL clause matching the Fields aliased `field-alias` whose field values metadata sync sends: the top-level
  Fields it sends that sync keeps a list of values for. That is a Field that is not sensitive or hidden, whose
  `has_field_values` is a list, whose `preview_display` is not false, and whose Table takes part in sync. Any other
  Field can still have a row of values from before it changed, which is out of date, and can hold values that a
  person meant to hide. The Field's Table is aliased `table-alias`."
  [field-alias :- :keyword
   table-alias :- :keyword]
  [:and
   (top-level-field-clause field-alias)
   [:or
    [:= (u/qualified-key field-alias :visibility_type) nil]
    [:not-in (u/qualified-key field-alias :visibility_type) ["sensitive" "hidden"]]]
   [:in (u/qualified-key field-alias :has_field_values) ["list" "auto-list"]]
   [:or
    [:= (u/qualified-key field-alias :preview_display) nil]
    [:= (u/qualified-key field-alias :preview_display) true]]
   (sync-tables-clause table-alias)])

(mu/defn described-fields :- [:sequential ::warehouse-schema.schema/field]
  "The Fields of the Tables with `table-ids` that metadata sync sends: active and not retired, nested ones too."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Field {:select   [:f.*]
                           :from     [[(t2/table-name :model/Field) :f]]
                           :where    [:and
                                      [:in :f.table_id table-ids]
                                      (described-field-clause :f)]
                           :order-by [:f.table_id :f.database_position :f.name]}))

(mu/defn described-field-counts :- [:sequential [:map {:closed true}
                                                 [:table_id    ::lib.schema.id/table]
                                                 [:field_count :int]]]
  "The count of the Fields that metadata sync sends, for each Table of the Database with `database-id` that
  has any."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select   [:f.table_id [[:count :*] :field_count]]
             :from     [[(t2/table-name :model/Field) :f]]
             :join     [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
             :where    [:and
                        [:= :t.db_id [:auto/param database-id]]
                        (described-field-clause :f)]
             :group-by [:f.table_id]}))

(mu/defn fk-links-of-tables :- [:sequential [:map {:closed true}
                                             [:table_id          ::lib.schema.id/table]
                                             [:field_name        :string]
                                             [:target_table_id   ::lib.schema.id/table]
                                             [:target_field_name :string]
                                             [:user_set          [:maybe :boolean]]]]
  "The FK targets of the described top-level Fields (active, not retired) of the Tables with `table-ids` whose target
  is a described Field too: each with its Field's name, the target's Table id and name, and whether a user set it."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select    [:f.table_id
                         [:f.name :field_name]
                         [:tf.table_id :target_table_id]
                         [:tf.name :target_field_name]
                         [:s.fk_target_field_id_set :user_set]]
             :from      [[(t2/table-name :model/Field) :f]]
             :join      [[(t2/table-name :model/Field) :tf] [:= :tf.id :f.fk_target_field_id]]
             :left-join [[(t2/table-name :model/FieldUserSettings) :s] [:= :s.field_id :f.id]]
             :where  [:and
                      [:in :f.table_id table-ids]
                      (top-level-field-clause :f)
                      (top-level-field-clause :tf)]}))

(mu/defn described-fk-counts :- [:sequential [:map {:closed true}
                                              [:table_id ::lib.schema.id/table]
                                              [:fk_count :int]]]
  "The count of the FK targets of the described top-level Fields (active, not retired) of each Table of the Database
  with `database-id` whose target is a described Field too, for the Tables that have any."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select   [:f.table_id [[:count :*] :fk_count]]
             :from     [[(t2/table-name :model/Field) :f]]
             :join     [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]
                        [(t2/table-name :model/Field) :tf] [:= :tf.id :f.fk_target_field_id]]
             :where    [:and
                        [:= :t.db_id [:auto/param database-id]]
                        (top-level-field-clause :f)
                        (top-level-field-clause :tf)]
             :group-by [:f.table_id]}))

(mu/defn described-full-field-values-counts :- [:sequential [:map {:closed true}
                                                             [:table_id           ::lib.schema.id/table]
                                                             [:field_values_count :int]]]
  "The count of the FieldValues rows of type `:full` of the Fields whose values are sent (see
  [[field-values-field-clause]]) of each Table of the Database with `database-id`, for the Tables that have any. It
  reads no values."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select   [:f.table_id [[:count :*] :field_values_count]]
             :from     [[(t2/table-name :model/FieldValues) :v]]
             :join     [[(t2/table-name :model/Field) :f] [:= :f.id :v.field_id]
                        [(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
             :where    [:and
                        [:= :t.db_id [:auto/param database-id]]
                        (field-values-field-clause :f :t)
                        [:= :v.type "full"]]
             :group-by [:f.table_id]}))

(mu/defn full-field-values-of-tables :- [:sequential [:map {:closed true}
                                                      [:id                    pos-int?]
                                                      [:table_id              ::lib.schema.id/table]
                                                      [:field_name            :string]
                                                      [:values                [:maybe ms/FieldValues]]
                                                      [:has_more_values       [:maybe :boolean]]
                                                      [:updated_at            (ms/InstanceOfClass
                                                                               java.time.OffsetDateTime)]]]
  "The FieldValues of type `:full` of the Fields whose values are sent (see [[field-values-field-clause]]) of the
  Tables with `table-ids`: each with its Table id and its Field's name. Per-user kinds are left out."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (map #(into {} %)
       (t2/select [:model/FieldValues :id [:f.table_id :table_id] [:f.name :field_name] :values :has_more_values
                   :metabase_fieldvalues.updated_at]
                  {:join  [[(t2/table-name :model/Field) :f] [:= :f.id :metabase_fieldvalues.field_id]
                           [(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                   :where [:and
                           [:in :f.table_id table-ids]
                           (field-values-field-clause :f :t)
                           [:= :metabase_fieldvalues.type "full"]]})))

(mu/defn table-user-settings-of-tables :- [:sequential ::warehouse-schema.schema/table-user-settings]
  "The TableUserSettings of the Tables with `table-ids` that have one."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/TableUserSettings :table_id [:in table-ids]))

(mu/defn tables-named :- [:sequential ::warehouse-schema.schema/table]
  "The Tables of the Database with `database-id` named one of `table-names`, active or not, in any schema."
  [database-id :- ::lib.schema.id/database
   table-names :- [:sequential :string]]
  (t2/select :model/Table {:where [:and
                                   [:= :db_id [:auto/param database-id]]
                                   [:in :name table-names]]}))

(mu/defn top-level-fields-of-tables :- [:sequential [:map {:closed true}
                                                     [:id                 ::lib.schema.id/field]
                                                     [:table_id           ::lib.schema.id/table]
                                                     [:name               :string]
                                                     [:fk_target_field_id [:maybe ::lib.schema.id/field]]
                                                     [:base_type          :string]
                                                     [:visibility_type    [:maybe :string]]
                                                     [:has_field_values   [:maybe :string]]
                                                     [:preview_display    [:maybe :boolean]]]]
  "The Fields of the Tables with `table-ids` that a link can start or end at, and that field values can be for:
  active, top-level and not retired. Each has its `id`, `table_id`, `name` and `fk_target_field_id`, and the columns
  that say whether it can have field values, as the app DB holds them: strings, not keywords."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select [:f.id :f.table_id :f.name :f.fk_target_field_id :f.base_type :f.visibility_type
                      :f.has_field_values :f.preview_display]
             :from   [[(t2/table-name :model/Field) :f]]
             :where  [:and
                      [:in :f.table_id table-ids]
                      (top-level-field-clause :f)]}))

(mu/defn field-user-settings-of-fields :- [:sequential ::warehouse-schema.schema/field-user-settings]
  "The FieldUserSettings of the Fields with `field-ids` that have one."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select :model/FieldUserSettings :field_id [:in field-ids]))

(mu/defn field-ids-with-field-values :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Tables with `table-ids` that have FieldValues of any type."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (into #{}
        (map :field_id)
        (t2/query {:select-distinct [:v.field_id]
                   :from            [[(t2/table-name :model/FieldValues) :v]]
                   :join            [[(t2/table-name :model/Field) :f] [:= :f.id :v.field_id]]
                   :where           [:in :f.table_id table-ids]})))
