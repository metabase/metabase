(ns metabase.sync.db
  "Application database queries for the sync module. Every function here is a direct Toucan 2 call with no additional
  logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.set :as set]
   [honey.sql :as sql]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(def ^:private sync-tables-clause
  "Honey SQL clause selecting the Tables that take part in sync: active and not hidden."
  [:and [:= :active true] [:= :visibility_type nil]])

;;; ------------------------------------------------ Database ------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn attached-dwh-database
  "The attached data warehouse Database, or nil."
  []
  (t2/select-one :model/Database :is_attached_dwh true))

(mu/defn database-stub?
  "Whether the Database with `database-id` is a stub."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :is_stub :model/Database :id database-id))

(mu/defn database-on-demand-flags
  "A map of Database ID to its `:is_on_demand` flag for `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (t2/select-pk->fn :is_on_demand :model/Database :id [:in database-ids]))

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

(mu/defn update-database!
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   changes     :- ::warehouses.schema/database.update]
  (t2/update! :model/Database database-id changes))

;;; ------------------------------------------------- Table -------------------------------------------------

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
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

(mu/defn sync-tables-by-lower-name-and-schema
  "The synced Tables of the Database with `database-id` whose lower-cased name and schema match."
  [database-id  :- ::lib.schema.id/database
   lower-name   :- :string
   lower-schema :- [:maybe :string]]
  (t2/select :model/Table
             :db_id database-id
             :%lower.name lower-name
             :%lower.schema lower-schema
             {:where sync-tables-clause}))

(mu/defn tables-by-name
  "The `columns` of the Tables of the Database with `database-id` named one of `table-names`."
  [columns      :- [:sequential :keyword]
   database-id  :- ::lib.schema.id/database
   table-names  :- [:sequential :string]]
  (t2/select columns :db_id database-id :name [:in table-names]))

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
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))

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
  (t2/select-fn-vec :id :model/Table :db_id database-id {:where sync-tables-clause}))

(mu/defn sync-table-schemas
  "The distinct `:schema` rows of the synced Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select-distinct [:schema]
             :from            [:metabase_table]
             :where           [:and sync-tables-clause [:= :db_id database-id]]}))

(mu/defn sync-tables-count
  "The number of synced Tables in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/count :model/Table :db_id database-id {:where sync-tables-clause}))

(mu/defn sync-tables-reducible
  "Reducible synced Tables of the Database with `database-id` ordered by schema and name, optionally narrowed to
  `schema-names` and/or `table-names`."
  [database-id  :- ::lib.schema.id/database
   schema-names :- [:maybe [:sequential :string]]
   table-names  :- [:maybe [:sequential :string]]]
  (t2/reducible-select :model/Table
                       :db_id database-id
                       {:where    [:and sync-tables-clause
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
                        :where     [:and sync-tables-clause [:= :t.db_id database-id]]
                        :order-by  [[:sub.earliest_last_analyzed :asc]]}))

(mu/defn insert-table!
  "Insert `table` and return the new instance."
  [table :- ::warehouse-schema.schema/table.update]
  (t2/insert-returning-instance! :model/Table table))

(mu/defn update-table!
  "Apply `changes` to the Table with `table-id`, returning the number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- ::warehouse-schema.schema/table.update]
  (t2/update! :model/Table table-id changes))

(mu/defn update-tables!
  "Apply `changes` to the Tables with `table-ids`, returning the number updated."
  [table-ids :- [:sequential ::lib.schema.id/table]
   changes   :- ::warehouse-schema.schema/table.update]
  (t2/update! :model/Table :id [:in table-ids] changes))

(mu/defn deactivate-tables!
  "Mark the active Tables among `table-ids` inactive, returning the number updated."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/update! :model/Table {:id [:in table-ids] :active true} {:active false}))

(mu/defn rename-table-schema!
  "Move the Tables of the Database with `database-id` from `schema` to `new-schema`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   new-schema  :- [:maybe :string]]
  (t2/update! :model/Table :db_id database-id :schema schema {:schema new-schema}))

(mu/defn archive-inactive-table!
  "Archive the inactive Table with `table-id` now under `new-name`, returning the number of rows updated."
  [table-id :- ::lib.schema.id/table
   new-name :- :string]
  (t2/update! :model/Table {:id table-id :active false} {:archived_at :%now :name new-name}))

;;; ------------------------------------------------- Field -------------------------------------------------

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(mu/defn fields-for-field-values
  "The columns needed to scan FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select [:model/Field :name :id :base_type :effective_type :coercion_strategy :semantic_type :visibility_type
              :table_id :has_field_values]
             :id [:in field-ids]))

(defn- base-types->descendants
  "Given a set of `base-types`, an expanded set including those types and all their descendants in the type
  hierarchy, as qualified strings so HoneySQL doesn't confuse them for columns."
  [base-types]
  (into #{}
        (comp (mapcat (fn [base-type] (cons base-type (descendants base-type))))
              (map u/qualified-name))
        base-types))

(defn- fingerprint-version-clauses
  "Honey SQL `:or` disjuncts, one per fingerprint version older than the latest that hasn't already been superseded,
  matching Fields whose `base_type` (or a descendant) was re-fingerprinted at that version. `version->base-types` is
  a map of fingerprint version to the set of base types re-fingerprinted at that version."
  [version->base-types]
  (let [versions+base-types (reverse (sort-by first (seq version->base-types)))
        already-seen        (atom #{})]
    (into [:or]
          (keep (fn [[version base-types]]
                  (let [not-yet-seen (set/difference (base-types->descendants base-types) @already-seen)]
                    (when (seq not-yet-seen)
                      (swap! already-seen set/union not-yet-seen)
                      [:and
                       [:< :fingerprint_version version]
                       [:in :base_type not-yet-seen]]))))
          versions+base-types)))

(def ^:private fields-to-fingerprint-base-clause
  [:and
   [:= :active true]
   [:or
    [:not (app-db/isa :semantic_type :type/PK)]
    [:= :semantic_type nil]]
   [:not-in :visibility_type ["retired" "sensitive"]]
   [:not-in :base_type (conj (app-db/type-keyword->descendants :type/fingerprint-unsupported)
                             (u/qualified-name :type/*))]])

(defn- needs-fingerprint-update-clause
  "Honey SQL clause matching Fields whose fingerprint needs to be re-calculated: active, non-`PK`/no-semantic-type,
  non-retired/sensitive-visibility, non-fingerprint-unsupported `base_type`, and, unless `refingerprint?`, without a
  fingerprint or whose fingerprint version can be updated per `version->base-types` (a map of fingerprint version to
  the set of base types that should be re-fingerprinted at that version)."
  [refingerprint? version->base-types]
  (cond-> fields-to-fingerprint-base-clause
    (not refingerprint?) (conj (fingerprint-version-clauses version->base-types))))

(mu/defn fields-needing-fingerprint-update
  "Up to `limit` active, visible Fields of the Table with `table-id` whose fingerprint needs to be re-calculated,
  ordered by ID. See [[needs-fingerprint-update-clause]] for the full matching criteria."
  [table-id           :- ::lib.schema.id/table
   refingerprint?     :- :boolean
   version->base-types :- [:map-of :int [:set [:or :keyword :string]]]
   limit              :- ms/PositiveInt]
  (t2/select :model/Field
             {:where    [:and
                         [:= :table_id table-id]
                         (needs-fingerprint-update-clause refingerprint? version->base-types)]
              :order-by [[:id :asc]]
              :limit    limit}))

(mu/defn field-fingerprint
  "The fingerprint of the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :fingerprint :model/Field :id field-id))

(mu/defn active-fields-metadata-for-table
  "The sync metadata columns of the active Fields of the Table with `table-id`, in field order."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :name :database_type :base_type :effective_type :coercion_strategy :semantic_type
              :parent_id :id :description :database_position :nfc_path
              :database_is_auto_increment :database_required
              :database_default :database_is_generated :database_is_nullable :database_is_pk
              :database_partitioned :json_unfolding :position :preview_display]
             :table_id table-id
             :active true
             {:order-by table/field-order-rule}))

(mu/defn normal-fields-for-table
  "Up to `limit` active, normal-visibility Fields of the Table with `table-id`, ordered by ID."
  [table-id :- ::lib.schema.id/table
   limit    :- ms/PositiveInt]
  (t2/select :model/Field
             :table_id table-id
             :active true
             :visibility_type "normal"
             {:order-by [[:id :asc]], :limit limit}))

(mu/defn inactive-fields-by-lower-name
  "The inactive Fields of the Table with `table-id` under `parent-id` whose lower-cased name is one of `lower-names`."
  [table-id    :- ::lib.schema.id/table
   parent-id   :- [:maybe ms/PositiveInt]
   lower-names :- [:sequential :string]]
  (t2/select :model/Field
             :table_id table-id
             :%lower.name [:in lower-names]
             :parent_id parent-id
             :active false))

(mu/defn incomplete-analysis-fields-for-table
  "The active, visible Fields of the Table with `table-id` fingerprinted at `fingerprint-version` but not yet analyzed."
  [table-id            :- ::lib.schema.id/table
   fingerprint-version :- :int]
  (t2/select :model/Field
             :table_id table-id
             :active true
             :visibility_type [:not-in ["sensitive" "retired"]]
             :fingerprint_version fingerprint-version
             :last_analyzed nil))

(mu/defn name-field-count-for-table
  "The number of active, visible Fields of the Table with `table-id` whose semantic type is `:type/Name`."
  [table-id :- ::lib.schema.id/table]
  (t2/count :model/Field
            :table_id table-id
            :active true
            :visibility_type [:not-in ["sensitive" "retired"]]
            :semantic_type :type/Name))

(mu/defn unscored-fields-for-database-reducible
  "Reducible active, visible Fields of the Database with `database-id` without a dimension interestingness score."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-select :model/Field
                       {:where [:and
                                [:= :active true]
                                [:= :dimension_interestingness nil]
                                [:not-in :visibility_type ["sensitive" "retired"]]
                                [:in :table_id ^:allow-subquery {:select [:id]
                                                                 :from   [(t2/table-name :model/Table)]
                                                                 :where  [:= :db_id database-id]}]]}))

(mu/defn top-level-field-ids-by-name
  "The IDs of the top-level Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ::lib.schema.id/table
   field-names :- [:sequential :string]]
  (t2/select-pks-vec :model/Field :name [:in field-names] :table_id table-id :parent_id nil))

(mu/defn top-level-field-ids-by-schema-table-and-name-reducible
  "Reducible `:id` rows of the top-level Fields of the Database with `database-id` matching one of the
  `[schema table-name field-name]` triples in `schema+table+names`, with a nil schema spelled `\"__null__\"`."
  [database-id        :- ::lib.schema.id/database
   schema+table+names :- [:sequential [:tuple :string :string :string]]]
  (t2/reducible-query {:select     [[:f.id]]
                       :from       [[(t2/table-name :model/Field) :f]]
                       :inner-join [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                       :where      [:and
                                    [:in [:composite [:coalesce :t.schema "__null__"] :t.name :f.name] schema+table+names]
                                    [:= :t.db_id database-id]
                                    [:= :parent_id nil]]}))

(mu/defn indexed-field-ids-for-table
  "The IDs of the Fields of the Table with `table-id` marked as indexed."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :database_indexed true))

(mu/defn indexed-top-level-field-ids-for-database
  "The IDs of the top-level Fields of the Database with `database-id` marked as indexed."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Field
                     :table_id [:in ^:allow-subquery {:select [[:t.id]]
                                                      :from   [[(t2/table-name :model/Table) :t]]
                                                      :where  [:= :t.db_id database-id]}]
                     :parent_id nil
                     :database_indexed true))

(mu/defn insert-fields!
  "Insert the Field `rows` and return their IDs."
  [rows :- [:sequential ::warehouse-schema.schema/field.update]]
  (t2/insert-returning-pks! :model/Field rows))

(mu/defn update-field!
  "Apply `changes` to the Field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- ::warehouse-schema.schema/field.update]
  (t2/update! :model/Field field-id changes))

(mu/defn update-field-by-name!
  "Apply `changes` to the Field named `field-name` of the Table with `table-id`, returning the number updated."
  [table-id   :- ::lib.schema.id/table
   field-name :- :string
   changes    :- ::warehouse-schema.schema/field.update]
  (t2/update! :model/Field {:name field-name, :table_id table-id} changes))

(mu/defn reactivate-fields!
  "Mark the Fields with `field-ids` active, returning the number updated."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/update! :model/Field {:id [:in field-ids]} {:active true}))

(mu/defn set-fields-fingerprint-version!
  "Set the fingerprint version of the Fields with `field-ids` to `fingerprint-version`, returning the number updated."
  [field-ids           :- [:sequential ::lib.schema.id/field]
   fingerprint-version :- :int]
  (t2/update! :model/Field :id [:in field-ids] {:fingerprint_version fingerprint-version}))

(mu/defn set-table-fields-indexed!
  "Mark the Fields of the Table with `table-id` whose id is in `indexed-field-ids` as indexed, and all its other
  Fields as not indexed, returning the number updated."
  [table-id          :- ::lib.schema.id/table
   indexed-field-ids :- [:maybe [:sequential ::lib.schema.id/field]]]
  (t2/update! :model/Field {:table_id table-id}
              {:database_indexed (if (seq indexed-field-ids)
                                   [:case [:in :id indexed-field-ids] true :else false]
                                   false)}))

(mu/defn set-top-level-fields-indexed!
  "Set `database_indexed` of the top-level Fields with `field-ids` to `indexed?`, returning the number updated."
  [field-ids :- [:sequential ::lib.schema.id/field]
   indexed?  :- :boolean]
  (t2/update! :model/Field :parent_id nil :id [:in field-ids] {:database_indexed indexed?}))

(mu/defn mark-incomplete-fields-analyzed-for-table!
  "Stamp `last_analyzed` on the Fields of the Table with `table-id` fingerprinted at `fingerprint-version` but not
  yet analyzed, returning the number updated."
  [table-id            :- ::lib.schema.id/table
   fingerprint-version :- :int]
  (t2/update! :model/Field
              {:table_id table-id, :fingerprint_version fingerprint-version, :last_analyzed nil}
              {:last_analyzed :%now}))

(mu/defn mark-incomplete-fields-analyzed-for-database!
  "Stamp `last_analyzed` on the Fields of the synced Tables of the Database with `database-id` fingerprinted at
  `fingerprint-version` but not yet analyzed, returning the number updated."
  [database-id         :- ::lib.schema.id/database
   fingerprint-version :- :int]
  (t2/update! :model/Field
              {:fingerprint_version fingerprint-version
               :last_analyzed       nil
               :table_id            [:in ^:allow-subquery
                                     {:select [:id]
                                      :from   [(t2/table-name :model/Table)]
                                      :where  [:and sync-tables-clause [:= :db_id database-id]]}]}
              {:last_analyzed :%now}))

(defn- fk-field-id-subquery
  "Subquery selecting the (lowest) id of the Field named `column-name` on the Table `[table-schema table-name]` in
  the Database with `db-id`, excluding Fields with a user-set foreign key target or semantic type. `min` limits the
  subquery to one result (MySQL disallows `LIMIT` in subqueries), needed because schema/table/column names can be
  non-unique when lower-cased for some DBs."
  [db-id table-schema table-name column-name]
  ^:allow-subquery
  {:select    [[[:min :f.id] :id]]
   :from      [[:metabase_field :f]]
   :join      [[:metabase_table :t] [:= :f.table_id :t.id]]
   :left-join [[:metabase_field_user_settings :u] [:= :f.id :u.field_id]]
   :where     [:and
               [:= :u.fk_target_field_id nil]
               [:= :u.semantic_type nil]
               [:= :t.db_id db-id]
               [:= [:lower :f.name] (u/lower-case-en column-name)]
               [:= [:lower :t.name] (u/lower-case-en table-name)]
               [:= [:lower :t.schema] (some-> table-schema u/lower-case-en)]
               [:= :f.active true]
               [:not= :f.visibility_type "retired"]
               [:= :t.active true]
               [:= :t.visibility_type nil]]})

(defn- fk-target-changed-clause
  "Honey SQL clause true when the Field's `fk_target_field_id` is not already `pk-id-expr`."
  [pk-id-expr]
  [:or
   [:= :f.fk_target_field_id nil]
   [:not= :f.fk_target_field_id pk-id-expr]])

(defn- mark-fk-statement
  "`[sql & params]` updating the `fk_target_field_id` of the Field at `[fk-table-schema fk-table-name
  fk-column-name]` in the Database with `db-id` to the id of the Field at `[pk-table-schema pk-table-name
  pk-column-name]`, unless it already points there, per the application DB's dialect."
  [db-id fk-table-schema fk-table-name fk-column-name pk-table-schema pk-table-name pk-column-name]
  (let [fk-field-id-query (fk-field-id-subquery db-id fk-table-schema fk-table-name fk-column-name)
        pk-field-id-query (fk-field-id-subquery db-id pk-table-schema pk-table-name pk-column-name)
        q (case (app-db/db-type)
            :mysql
            {:update [:metabase_field :f]
             :join   [[fk-field-id-query :fk] [:= :fk.id :f.id]
                      [pk-field-id-query :pk]
                      (fk-target-changed-clause :pk.id)]
             :set    {:fk_target_field_id :pk.id
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}}
            :postgres
            {:update [:metabase_field :f]
             :from   [[fk-field-id-query :fk]]
             :join   [[pk-field-id-query :pk] true]
             :set    {:fk_target_field_id :pk.id
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :fk.id :f.id]
                      (fk-target-changed-clause :pk.id)]}
            :h2
            {:update [:metabase_field :f]
             :set    {:fk_target_field_id pk-field-id-query
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :f.id fk-field-id-query]
                      [:not= pk-field-id-query nil]
                      (fk-target-changed-clause pk-field-id-query)]})]
    (sql/format q :dialect (app-db/quoting-style (app-db/db-type)))))

(mu/defn mark-fk!
  "Set the `fk_target_field_id` of the Field at `[fk-table-schema fk-table-name fk-column-name]` in the Database with
  `db-id` to the id of the Field at `[pk-table-schema pk-table-name pk-column-name]`, unless it already points there.
  Returns 1 if a Field was updated, 0 otherwise."
  [db-id            :- ::lib.schema.id/database
   fk-table-schema  :- [:maybe :string]
   fk-table-name    :- :string
   fk-column-name   :- :string
   pk-table-schema  :- [:maybe :string]
   pk-table-name    :- :string
   pk-column-name   :- :string]
  (t2/query-one (mark-fk-statement db-id fk-table-schema fk-table-name fk-column-name
                                   pk-table-schema pk-table-name pk-column-name)))

;;; ------------------------------------------ Field data sensitivity ------------------------------------------

(defn- data-sensitivity-to-scan-clause
  "Honey SQL clause matching Fields the data-sensitivity classifier still has to scan: unlabeled ones, plus those it
  labeled `PUBLIC` when `rescan-public?`."
  [rescan-public?]
  (if rescan-public?
    [:or [:= :data_sensitivity nil] [:= :data_sensitivity "PUBLIC"]]
    [:= :data_sensitivity nil]))

(mu/defn fields-to-scan-for-data-sensitivity
  "The active, non-retired Fields of the Table with `table-id` that the data-sensitivity classifier still has to scan
  (see [[data-sensitivity-to-scan-clause]]), ordered by ID."
  [table-id       :- ::lib.schema.id/table
   rescan-public? :- [:maybe :boolean]]
  (t2/select :model/Field
             {:where    [:and
                         [:= :table_id table-id]
                         [:= :active true]
                         [:not= :visibility_type "retired"]
                         (data-sensitivity-to-scan-clause rescan-public?)]
              :order-by [[:id :asc]]}))

(mu/defn table-ids-with-fields-to-scan-for-data-sensitivity
  "The IDs of the active Tables of the Database with `database-id` that have active, non-retired Fields the
  data-sensitivity classifier still has to scan (see [[data-sensitivity-to-scan-clause]])."
  [database-id    :- ::lib.schema.id/database
   rescan-public? :- [:maybe :boolean]]
  (t2/select-fn-set :table_id :model/Field
                    {:select   [[:metabase_field.table_id :table_id]]
                     :from     [:metabase_field]
                     :join     [[:metabase_table] [:= :metabase_field.table_id :metabase_table.id]]
                     :where    [:and
                                [:= :metabase_table.db_id database-id]
                                [:= :metabase_table.active true]
                                [:= :metabase_field.active true]
                                [:not= :metabase_field.visibility_type "retired"]
                                (data-sensitivity-to-scan-clause rescan-public?)]
                     :group-by [:metabase_field.table_id]}))

(mu/defn tables-by-schema-and-name-reducible
  "Reducible Tables with `table-ids`, ordered by schema and name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/reducible-select :model/Table :id [:in table-ids] {:order-by [[:schema :asc] [:name :asc]]}))

(mu/defn update-field-data-sensitivity!
  "Set the `data_sensitivity` of the Field with `field-id` to `data-sensitivity`, returning the number updated."
  [field-id         :- ::lib.schema.id/field
   data-sensitivity :- [:or :keyword :string]]
  (t2/update! :model/Field field-id {:data_sensitivity data-sensitivity}))

(def ^:private classifier-data-sensitivity-clause
  "Honey SQL clause matching Fields whose non-null `data_sensitivity` has no value in the `FieldUserSettings` mirror,
  i.e. was written by the data-sensitivity classifier rather than a user."
  [:and
   [:not= :data_sensitivity nil]
   [:not [:exists ^:allow-subquery {:select [1]
                                    :from   [[:metabase_field_user_settings :s]]
                                    :where  [:and
                                             [:= :s.field_id :metabase_field.id]
                                             [:not= :s.data_sensitivity nil]]}]]])

(mu/defn reset-classifier-data-sensitivity-for-table!
  "Clear the classifier-written `data_sensitivity` (see [[classifier-data-sensitivity-clause]]) of the Fields of the
  Table with `table-id`. Returns the number of Fields cleared."
  [table-id :- ::lib.schema.id/table]
  (t2/query-one {:update :metabase_field
                 :set    {:data_sensitivity nil}
                 :where  [:and [:= :table_id table-id] classifier-data-sensitivity-clause]}))

(mu/defn reset-classifier-data-sensitivity-for-database!
  "Clear the classifier-written `data_sensitivity` (see [[classifier-data-sensitivity-clause]]) of the Fields of every
  Table of the Database with `database-id`. Returns the number of Fields cleared."
  [database-id :- ::lib.schema.id/database]
  (t2/query-one {:update :metabase_field
                 :set    {:data_sensitivity nil}
                 :where  [:and
                          [:in :table_id ^:allow-subquery {:select [:id]
                                                           :from   [:metabase_table]
                                                           :where  [:= :db_id database-id]}]
                          classifier-data-sensitivity-clause]}))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(mu/defn field-values-exist?
  "Whether the Field with `field-id` has FieldValues."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/FieldValues :field_id field-id))

(defn- before-max-age-value
  "Honey SQL `[:< …]` value expression matching a timestamp more than `max-age-days` days before now."
  [max-age-days]
  [:< (h2x/add-interval-honeysql-form (app-db/db-type) :%now (- max-age-days) :day)])

(mu/defn advanced-field-values-count-before
  "The number of FieldValues of `types` for the Field with `field-id` created more than `max-age-days` days ago."
  [field-id     :- ::lib.schema.id/field
   types        :- [:set :keyword]
   max-age-days :- :int]
  (t2/count :model/FieldValues :field_id field-id :type [:in types]
            :created_at (before-max-age-value max-age-days)))

(mu/defn delete-advanced-field-values-before!
  "Delete the FieldValues of `types` for the Field with `field-id` created more than `max-age-days` days ago."
  [field-id     :- ::lib.schema.id/field
   types        :- [:set :keyword]
   max-age-days :- :int]
  (t2/delete! :model/FieldValues :field_id field-id :type [:in types]
              :created_at (before-max-age-value max-age-days)))
