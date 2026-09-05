(ns metabase.sync.db
  "Application database queries for the sync module. Every function here is a direct Toucan 2 call with no additional
  logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.set :as set]
   [honey.sql :as sql]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(def ^:private sync-tables-clause
  "Honey SQL clause selecting the Tables that take part in sync: active and not hidden."
  [:and [:= :active true] [:= :visibility_type nil]])

;;; ------------------------------------------------ Database ------------------------------------------------

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn attached-dwh-database
  "The attached data warehouse Database, or nil."
  []
  (t2/select-one :model/Database :is_attached_dwh true))

(defn database-stub?
  "Whether the Database with `database-id` is a stub."
  [database-id]
  (t2/select-one-fn :is_stub :model/Database :id database-id))

(defn database-on-demand-flags
  "A map of Database ID to its `:is_on_demand` flag for `database-ids`."
  [database-ids]
  (t2/select-pk->fn :is_on_demand :model/Database :id [:in database-ids]))

(defn synced-user-database-exists?
  "Whether any non-sample, non-audit Database has completed its initial sync."
  []
  (t2/exists? :model/Database :is_sample false :is_audit false :initial_sync_status "complete"))

(defn databases-with-schedules-reducible
  "Reducible raw Database rows whose sync schedules are the sample or default ones."
  [old-sample-metadata-cron metadata-crons cache-field-values-crons]
  (t2/reducible-query {:select [:*]
                       :from   [:metabase_database]
                       :where  [:or
                                [:and
                                 [:= :is_sample true]
                                 [:= :metadata_sync_schedule old-sample-metadata-cron]]
                                [:in :metadata_sync_schedule metadata-crons]
                                [:in :cache_field_values_schedule cache-field-values-crons]]}))

(defn update-database!
  "Apply `changes` to the Database with `database-id`."
  [database-id changes]
  (t2/update! :model/Database database-id changes))

;;; ------------------------------------------------- Table -------------------------------------------------

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn table-in-database
  "The Table with `table-id` in the Database with `database-id`, or nil."
  [database-id table-id]
  (t2/select-one :model/Table :db_id database-id :id table-id))

(defn table-by-name
  "The Table named `table-name` in the Database with `database-id`, or nil."
  [database-id table-name]
  (t2/select-one :model/Table :db_id database-id :name table-name))

(defn table-by-schema-and-name
  "The Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id schema table-name]
  (t2/select-one :model/Table :db_id database-id :name table-name :schema schema))

(defn inactive-table-by-schema-and-name
  "The inactive Table named `table-name` in `schema` of the Database with `database-id`, or nil."
  [database-id schema table-name]
  (t2/select-one :model/Table :db_id database-id :schema schema :name table-name :active false))

(defn active-table-id-by-name
  "The ID of the active Table named `table-name` in the Database with `database-id`, or nil."
  [database-id table-name]
  (t2/select-one-pk :model/Table :db_id database-id :name table-name :active true))

(defn sync-tables-by-lower-name-and-schema
  "The synced Tables of the Database with `database-id` whose lower-cased name and schema match."
  [database-id lower-name lower-schema]
  (t2/select :model/Table
             :db_id database-id
             :%lower.name lower-name
             :%lower.schema lower-schema
             {:where sync-tables-clause}))

(defn tables-by-name
  "The `columns` of the Tables of the Database with `database-id` named one of `table-names`."
  [columns database-id table-names]
  (t2/select columns :db_id database-id :name [:in table-names]))

(defn tables-to-archive
  "The inactive, unarchived, non-transform-target Tables of the Database with `database-id` deactivated before the
  SQL expression `deactivated-before`."
  [database-id deactivated-before]
  (t2/select :model/Table
             :db_id database-id
             :active false
             :archived_at nil
             :transform_target false
             :deactivated_at [:< deactivated-before]))

(defn table-database-ids
  "A map of Table ID to Database ID for `table-ids`."
  [table-ids]
  (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))

(defn table-schemas-reducible
  "Reducible `:schema` rows of the Tables of the Database with `database-id`."
  [database-id]
  (t2/reducible-select [:model/Table :schema] :db_id database-id))

(defn active-table-ids-reducible
  "Reducible `:id` rows of the active Tables of the Database with `database-id`."
  [database-id]
  (t2/reducible-select [:model/Table :id] :db_id database-id :active true))

(defn active-table-count
  "The number of active Tables in the Database with `database-id`."
  [database-id]
  (t2/count :model/Table :db_id database-id :active true))

(defn sync-table-ids
  "The IDs of the synced Tables of the Database with `database-id`."
  [database-id]
  (t2/select-fn-vec :id :model/Table :db_id database-id {:where sync-tables-clause}))

(defn sync-table-schemas
  "The distinct `:schema` rows of the synced Tables of the Database with `database-id`."
  [database-id]
  (t2/query {:select-distinct [:schema]
             :from            [:metabase_table]
             :where           [:and sync-tables-clause [:= :db_id database-id]]}))

(defn sync-tables-count
  "The number of synced Tables in the Database with `database-id`."
  [database-id]
  (t2/count :model/Table :db_id database-id {:where sync-tables-clause}))

(defn sync-tables-reducible
  "Reducible synced Tables of the Database with `database-id` ordered by schema and name, optionally narrowed to
  `schema-names` and/or `table-names`."
  [database-id schema-names table-names]
  (t2/reducible-select :model/Table
                       :db_id database-id
                       {:where    [:and sync-tables-clause
                                   (when (seq schema-names) [:in :schema schema-names])
                                   (when (seq table-names) [:in :name table-names])]
                        :order-by [[:schema :asc] [:name :asc]]}))

(defn sync-tables-by-earliest-analyzed-reducible
  "Reducible synced Tables of the Database with `database-id` ordered by the earliest `last_analyzed` of their Fields."
  [database-id]
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

(defn insert-table!
  "Insert `table` and return the new instance."
  [table]
  (t2/insert-returning-instance! :model/Table table))

(defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id changes]
  (t2/update! :model/Table table-id changes))

(defn update-tables!
  "Apply `changes` to the Tables with `table-ids`."
  [table-ids changes]
  (t2/update! :model/Table :id [:in table-ids] changes))

(defn deactivate-tables!
  "Mark the active Tables among `table-ids` inactive."
  [table-ids]
  (t2/update! :model/Table {:id [:in table-ids] :active true} {:active false}))

(defn rename-table-schema!
  "Move the Tables of the Database with `database-id` from `schema` to `new-schema`."
  [database-id schema new-schema]
  (t2/update! :model/Table :db_id database-id :schema schema {:schema new-schema}))

(defn archive-inactive-table!
  "Archive the inactive Table with `table-id` at `archived-at` under `new-name`, returning the number of rows updated."
  [table-id archived-at new-name]
  (t2/update! :model/Table {:id table-id :active false} {:archived_at archived-at :name new-name}))

;;; ------------------------------------------------- Field -------------------------------------------------

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn fields-for-field-values
  "The columns needed to scan FieldValues of the Fields with `field-ids`."
  [field-ids]
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

(defn fields-needing-fingerprint-update
  "Up to `limit` active, visible Fields of the Table with `table-id` whose fingerprint needs to be re-calculated,
  ordered by ID. See [[needs-fingerprint-update-clause]] for the full matching criteria."
  [table-id refingerprint? version->base-types limit]
  (t2/select :model/Field
             {:where    [:and
                         [:= :table_id table-id]
                         (needs-fingerprint-update-clause refingerprint? version->base-types)]
              :order-by [[:id :asc]]
              :limit    limit}))

(defn field-fingerprint
  "The fingerprint of the Field with `field-id`."
  [field-id]
  (t2/select-one-fn :fingerprint :model/Field :id field-id))

(defn active-fields-metadata-for-table
  "The sync metadata columns of the active Fields of the Table with `table-id`, in field order."
  [table-id]
  (t2/select [:model/Field :name :database_type :base_type :effective_type :coercion_strategy :semantic_type
              :parent_id :id :description :database_position :nfc_path
              :database_is_auto_increment :database_required
              :database_default :database_is_generated :database_is_nullable :database_is_pk
              :database_partitioned :json_unfolding :position :preview_display]
             :table_id table-id
             :active true
             {:order-by table/field-order-rule}))

(defn normal-fields-for-table
  "Up to `limit` active, normal-visibility Fields of the Table with `table-id`, ordered by ID."
  [table-id limit]
  (t2/select :model/Field
             :table_id table-id
             :active true
             :visibility_type "normal"
             {:order-by [[:id :asc]], :limit limit}))

(defn inactive-fields-by-lower-name
  "The inactive Fields of the Table with `table-id` under `parent-id` whose lower-cased name is one of `lower-names`."
  [table-id parent-id lower-names]
  (t2/select :model/Field
             :table_id table-id
             :%lower.name [:in lower-names]
             :parent_id parent-id
             :active false))

(defn incomplete-analysis-fields-for-table
  "The active, visible Fields of the Table with `table-id` fingerprinted at `fingerprint-version` but not yet analyzed."
  [table-id fingerprint-version]
  (t2/select :model/Field
             :table_id table-id
             :active true
             :visibility_type [:not-in ["sensitive" "retired"]]
             :fingerprint_version fingerprint-version
             :last_analyzed nil))

(defn name-field-count-for-table
  "The number of active, visible Fields of the Table with `table-id` whose semantic type is `:type/Name`."
  [table-id]
  (t2/count :model/Field
            :table_id table-id
            :active true
            :visibility_type [:not-in ["sensitive" "retired"]]
            :semantic_type :type/Name))

(defn unscored-fields-for-database-reducible
  "Reducible active, visible Fields of the Database with `database-id` without a dimension interestingness score."
  [database-id]
  (t2/reducible-select :model/Field
                       {:where [:and
                                [:= :active true]
                                [:= :dimension_interestingness nil]
                                [:not-in :visibility_type ["sensitive" "retired"]]
                                [:in :table_id ^:allow-subquery {:select [:id]
                                                                 :from   [(t2/table-name :model/Table)]
                                                                 :where  [:= :db_id database-id]}]]}))

(defn top-level-field-ids-by-name
  "The IDs of the top-level Fields of the Table with `table-id` named one of `field-names`."
  [table-id field-names]
  (t2/select-pks-vec :model/Field :name [:in field-names] :table_id table-id :parent_id nil))

(defn top-level-field-ids-by-schema-table-and-name-reducible
  "Reducible `:id` rows of the top-level Fields of the Database with `database-id` matching one of the
  `[schema table-name field-name]` triples in `schema+table+names`, with a nil schema spelled `\"__null__\"`."
  [database-id schema+table+names]
  (t2/reducible-query {:select     [[:f.id]]
                       :from       [[(t2/table-name :model/Field) :f]]
                       :inner-join [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                       :where      [:and
                                    [:in [:composite [:coalesce :t.schema "__null__"] :t.name :f.name] schema+table+names]
                                    [:= :t.db_id database-id]
                                    [:= :parent_id nil]]}))

(defn indexed-field-ids-for-table
  "The IDs of the Fields of the Table with `table-id` marked as indexed."
  [table-id]
  (t2/select-pks-set :model/Field :table_id table-id :database_indexed true))

(defn indexed-top-level-field-ids-for-database
  "The IDs of the top-level Fields of the Database with `database-id` marked as indexed."
  [database-id]
  (t2/select-pks-set :model/Field
                     :table_id [:in ^:allow-subquery {:select [[:t.id]]
                                                      :from   [[(t2/table-name :model/Table) :t]]
                                                      :where  [:= :t.db_id database-id]}]
                     :parent_id nil
                     :database_indexed true))

(defn insert-fields!
  "Insert the Field `rows` and return their IDs."
  [rows]
  (t2/insert-returning-pks! :model/Field rows))

(defn update-field!
  "Apply `changes` to the Field with `field-id`."
  [field-id changes]
  (t2/update! :model/Field field-id changes))

(defn update-field-by-name!
  "Apply `changes` to the Field named `field-name` of the Table with `table-id`."
  [table-id field-name changes]
  (t2/update! :model/Field {:name field-name, :table_id table-id} changes))

(defn reactivate-fields!
  "Mark the Fields with `field-ids` active."
  [field-ids]
  (t2/update! :model/Field {:id [:in field-ids]} {:active true}))

(defn set-fields-fingerprint-version!
  "Set the fingerprint version of the Fields with `field-ids` to `fingerprint-version`."
  [field-ids fingerprint-version]
  (t2/update! :model/Field :id [:in field-ids] {:fingerprint_version fingerprint-version}))

(defn set-table-fields-indexed!
  "Mark the Fields of the Table with `table-id` whose id is in `indexed-field-ids` as indexed, and all its other
  Fields as not indexed."
  [table-id indexed-field-ids]
  (t2/update! :model/Field {:table_id table-id}
              {:database_indexed (if (seq indexed-field-ids)
                                   [:case [:in :id indexed-field-ids] true :else false]
                                   false)}))

(defn set-top-level-fields-indexed!
  "Set `database_indexed` of the top-level Fields with `field-ids` to `indexed?`."
  [field-ids indexed?]
  (t2/update! :model/Field :parent_id nil :id [:in field-ids] {:database_indexed indexed?}))

(defn mark-incomplete-fields-analyzed-for-table!
  "Stamp `last_analyzed` on the Fields of the Table with `table-id` fingerprinted at `fingerprint-version` but not
  yet analyzed."
  [table-id fingerprint-version]
  (t2/update! :model/Field
              {:table_id table-id, :fingerprint_version fingerprint-version, :last_analyzed nil}
              {:last_analyzed :%now}))

(defn mark-incomplete-fields-analyzed-for-database!
  "Stamp `last_analyzed` on the Fields of the synced Tables of the Database with `database-id` fingerprinted at
  `fingerprint-version` but not yet analyzed."
  [database-id fingerprint-version]
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

(defn mark-fk!
  "Set the `fk_target_field_id` of the Field at `[fk-table-schema fk-table-name fk-column-name]` in the Database with
  `db-id` to the id of the Field at `[pk-table-schema pk-table-name pk-column-name]`, unless it already points there.
  Returns 1 if a Field was updated, 0 otherwise."
  [db-id fk-table-schema fk-table-name fk-column-name pk-table-schema pk-table-name pk-column-name]
  (t2/query-one (mark-fk-statement db-id fk-table-schema fk-table-name fk-column-name
                                   pk-table-schema pk-table-name pk-column-name)))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(defn field-values-exist?
  "Whether the Field with `field-id` has FieldValues."
  [field-id]
  (t2/exists? :model/FieldValues :field_id field-id))

(defn- before-max-age-value
  "Honey SQL `[:< …]` value expression matching a timestamp more than `max-age-days` days before now."
  [max-age-days]
  [:< (h2x/add-interval-honeysql-form (app-db/db-type) :%now (- max-age-days) :day)])

(defn advanced-field-values-count-before
  "The number of FieldValues of `types` for the Field with `field-id` created more than `max-age-days` days ago."
  [field-id types max-age-days]
  (t2/count :model/FieldValues :field_id field-id :type [:in types]
            :created_at (before-max-age-value max-age-days)))

(defn delete-advanced-field-values-before!
  "Delete the FieldValues of `types` for the Field with `field-id` created more than `max-age-days` days ago."
  [field-id types max-age-days]
  (t2/delete! :model/FieldValues :field_id field-id :type [:in types]
              :created_at (before-max-age-value max-age-days)))
