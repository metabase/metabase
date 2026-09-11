(ns metabase.warehouse-schema-overlay.core
  "How a query names the Fields and Tables it reads.

  A user's values for a Field live in `metabase_field_user_settings` and for a Table in
  `metabase_table_user_settings`, so selecting `metabase_field` or `metabase_table` on its own shows what sync wrote
  rather than what the user set. [[field-query]] and [[table-query]] are the subqueries that merge each pair.

  This module sits below `warehouse-schema` so that everything reading a Field or Table can reach it, the application
  database and model layers included. The `:metabase/table-or-field-query` linter checks that they do."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def user-settable-field-columns
  "The Field columns users can set. Their user values live in `metabase_field_user_settings`, never in `metabase_field`."
  #{:semantic_type :description :display_name :visibility_type :has_field_values :effective_type :coercion_strategy
    :fk_target_field_id :caveats :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity})

(def field-user-settings-flags
  "The user-settable Field columns that are nullable on the Field and also written by sync, mapped to the
  `metabase_field_user_settings` flag recording that the user made the call: for these a user's NULL beats the sync
  value."
  {:description        :description_set
   :semantic_type      :semantic_type_set
   :fk_target_field_id :fk_target_field_id_set})

(def field-columns
  "Every column of `metabase_field`. Spelled out rather than read from `:metabase.warehouse-schema.schema/field`,
  which lives in a module above this one; `metabase.warehouse-schema-overlay.core-test` fails if the two drift."
  #{:active :base_type :caveats :coercion_strategy :created_at :custom_position :data_sensitivity :database_default
    :database_indexed :database_is_auto_increment :database_is_generated :database_is_nullable :database_is_pk
    :database_partitioned :database_position :database_required :database_type :description
    :dimension_interestingness :display_name :effective_type :fingerprint :fingerprint_version :fk_target_field_id
    :has_field_values :id :is_defective_duplicate :json_unfolding :last_analyzed :name :nfc_path :parent_id
    :points_of_interest :position :preview_display :semantic_type :settings :table_id :unique_field_helper
    :updated_at :visibility_type})

(def ^:private sync-owned-field-columns
  "The columns of `metabase_field` users cannot set."
  (sort (remove user-settable-field-columns field-columns)))

(mu/defn- field-user-settings-join
  "The `:left-join` entries joining `metabase_field_user_settings` as `settings-alias` to the Field table aliased
  `field-alias`; see [[field-user-settings-column]]."
  [field-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/FieldUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :field_id) (u/qualified-key field-alias :id)]])

(mu/defn- field-user-settings-column
  "Honey SQL expression for the user-settable Field column `column` as users see it: the value in
  `metabase_field_user_settings` (aliased `settings-alias`) when the user set it, else the Field's (aliased
  `field-alias`). A user's NULL counts as set for the [[field-user-settings-flags]] when their flag is true, and for
  `coercion_strategy` whenever the user set `effective_type`. Requires [[field-user-settings-join]]."
  [column         :- (into [:enum] user-settable-field-columns)
   field-alias    :- :keyword
   settings-alias :- :keyword]
  (let [field-column    (u/qualified-key field-alias column)
        settings-column (u/qualified-key settings-alias column)
        flag            (field-user-settings-flags column)]
    (cond
      flag
      [:case [:= (u/qualified-key settings-alias flag) true] settings-column :else field-column]

      (= column :coercion_strategy)
      [:case [:not= (u/qualified-key settings-alias :effective_type) nil] settings-column :else field-column]

      ;; a CASE on the boolean gives every app DB a value its JDBC driver reads back as a boolean or a number
      (= column :json_unfolding)
      [:case [:= [:coalesce settings-column field-column] true] true :else false]

      :else
      [:coalesce settings-column field-column])))

(mu/defn field-query :- [:tuple :any :keyword]
  "The source a query over Fields reads from, for its `:from` or a join: a subquery over `metabase_field` left joined
  to `metabase_field_user_settings`, projecting every Field column with the user-settable ones replaced by the value
  users see.

    (t2/select :model/Field :table_id table-id {:from [(field-query)]})

  By default it stands in under the Field table's own name, so kv-args, column subsets and `:order-by` keep working
  untouched. Pass `:alias` when the query joins something else and has to qualify its columns:

    (t2/select :model/Field {:from  [(field-query {:alias :f})]
                             :join  [[:metabase_table :t] [:= :f.table_id :t.id]]
                             :where [:= :t.db_id database-id]})

  `{:user-settings? false}` asks for sync's own values instead, which sync needs where it diffs the columns it last
  wrote against the warehouse.

  Application DBs flatten the subquery, so a predicate on a sync-owned column still reaches that column's index."
  ([]
   (field-query nil))

  ([{:keys [alias user-settings?]
     :or   {alias          (t2/table-name :model/Field)
            user-settings? true}} :- [:maybe [:map
                                              [:alias          {:optional true} :keyword]
                                              [:user-settings? {:optional true} :boolean]]]]
   [(if user-settings?
      ^:allow-subquery
      {:select    (into (mapv #(u/qualified-key :f %) sync-owned-field-columns)
                        (map (fn [column] [(field-user-settings-column column :f :u) column]))
                        (sort user-settable-field-columns))
       :from      [[(t2/table-name :model/Field) :f]]
       :left-join (field-user-settings-join :f :u)}
      ;; nothing to merge, so no subquery: this is `metabase_field` itself, which keeps the shape usable anywhere a
      ;; plain table reference was, including the subqueries sync feeds to an UPDATE
      (t2/table-name :model/Field))
    alias]))

(def user-settable-table-columns
  "The Table columns users can set. Their user values live in `metabase_table_user_settings`, never in
  `metabase_table`."
  #{:display_name :description :entity_type :visibility_type :caveats :points_of_interest :data_layer :data_source
    :owner_email :owner_user_id :field_order :show_in_getting_started :data_authority :is_published :collection_id})

(def table-user-settings-flags
  "The user-settable Table columns that are nullable on the Table, mapped to the
  `metabase_table_user_settings` flag recording that the user made the call: for these a user's NULL beats the sync
  value, which a NULL alone could not say. The columns that are NOT NULL on `metabase_table` need no flag -- a NULL
  there can only mean the user set nothing -- and `collection_id` rides along with `is_published`, which is one of
  them."
  {:display_name       :display_name_set
   :description        :description_set
   :entity_type        :entity_type_set
   :visibility_type    :visibility_type_set
   :caveats            :caveats_set
   :points_of_interest :points_of_interest_set
   :data_layer         :data_layer_set
   :data_source        :data_source_set
   :owner_email        :owner_email_set
   :owner_user_id      :owner_user_id_set})

(def table-columns
  "Every column of `metabase_table`. Spelled out rather than read from `:metabase.warehouse-schema.schema/table`,
  which lives in a module above this one; `metabase.warehouse-schema-overlay.core-test` fails if the two drift."
  #{:active :archived_at :caveats :collection_id :created_at :data_authority :data_layer :data_source
    :database_require_filter :db_id :deactivated_at :description :display_name :entity_type :estimated_row_count
    :field_order :id :initial_sync_status :is_defective_duplicate :is_published :is_upload :is_writable :name
    :owner_email :owner_user_id :points_of_interest :schema :show_in_getting_started :transform_id :transform_target
    :unique_table_helper :updated_at :view_count :visibility_type})

(def ^:private sync-owned-table-columns
  "The columns of `metabase_table` users cannot set."
  (sort (remove user-settable-table-columns table-columns)))

(mu/defn- table-user-settings-join
  "The `:left-join` entries joining `metabase_table_user_settings` as `settings-alias` to the Table table aliased
  `table-alias`; see [[table-user-settings-column]]."
  [table-alias    :- :keyword
   settings-alias :- :keyword]
  [[(t2/table-name :model/TableUserSettings) settings-alias]
   [:= (u/qualified-key settings-alias :table_id) (u/qualified-key table-alias :id)]])

(mu/defn- table-user-settings-column
  "Honey SQL expression for the user-settable Table column `column` as users see it: the value in
  `metabase_table_user_settings` (aliased `settings-alias`) when the user set it, else the Table's (aliased
  `table-alias`). A user's NULL counts as set for the [[table-user-settings-flags]] when their flag is true, and for
  `collection_id` whenever the user set `is_published`. Requires [[table-user-settings-join]]."
  [column         :- (into [:enum] user-settable-table-columns)
   table-alias    :- :keyword
   settings-alias :- :keyword]
  (let [table-column    (u/qualified-key table-alias column)
        settings-column (u/qualified-key settings-alias column)
        flag            (table-user-settings-flags column)]
    (cond
      flag
      [:case [:= (u/qualified-key settings-alias flag) true] settings-column :else table-column]

      ;; publishing is one choice over both columns, and is_published is NOT NULL on the Table, so it answers for
      ;; collection_id -- which a user may legitimately have published into the root collection, i.e. NULL
      (= column :collection_id)
      [:case [:not= (u/qualified-key settings-alias :is_published) nil] settings-column :else table-column]

      ;; a CASE on the boolean gives every app DB a value its JDBC driver reads back as a boolean or a number
      (= column :show_in_getting_started)
      [:case [:= [:coalesce settings-column table-column] true] true :else false]

      (= column :is_published)
      [:case [:= [:coalesce settings-column table-column] true] true :else false]

      :else
      [:coalesce settings-column table-column])))

(mu/defn table-query :- [:tuple :any :keyword]
  "The source a query over Tables reads from, for its `:from` or a join: a subquery over `metabase_table` left joined
  to `metabase_table_user_settings`, projecting every Table column with the user-settable ones replaced by the value
  users see.

    (t2/select :model/Table :db_id database-id {:from [(table-query)]})

  Takes the same options as [[field-query]]: `:alias` for a query that joins something else, and
  `{:user-settings? false}` for sync's own values, which is the plain table."
  ([]
   (table-query nil))

  ([{:keys [alias user-settings?]
     :or   {alias          (t2/table-name :model/Table)
            user-settings? true}} :- [:maybe [:map
                                              [:alias          {:optional true} :keyword]
                                              [:user-settings? {:optional true} :boolean]]]]
   [(if user-settings?
      ^:allow-subquery
      {:select    (into (mapv #(u/qualified-key :t %) sync-owned-table-columns)
                        (map (fn [column] [(table-user-settings-column column :t :u) column]))
                        (sort user-settable-table-columns))
       :from      [[(t2/table-name :model/Table) :t]]
       :left-join (table-user-settings-join :t :u)}
      (t2/table-name :model/Table))
    alias]))
