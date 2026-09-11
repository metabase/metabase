(ns metabase.warehouse-schema-overlay.core
  "How a query names the Fields and Tables it reads.

  A user's values for a Field live in `metabase_field_user_settings`, so selecting `metabase_field` on its own shows
  what sync wrote rather than what the user set. [[field-query]] is the subquery that merges the two, and
  [[table-query]] is the same shape for Tables -- a no-op until Tables carry user-set values of their own.

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

(mu/defn table-query :- [:tuple :any :keyword]
  "The source a query over Tables reads from, for its `:from` or a join. Today that is just `metabase_table`, so this
  is a no-op wrapper -- but reads go through it so that when a Table carries user-set values of its own, the way a
  Field carries `metabase_field_user_settings`, only this function has to change.

    (t2/select :model/Table :db_id database-id {:from [(table-query)]})

  Takes the same options as [[field-query]]: `:alias` for a query that joins something else, and `:user-settings?`,
  which is accepted and ignored so call sites can already say which values they mean."
  ([]
   (table-query nil))

  ([{:keys [alias]
     :or   {alias (t2/table-name :model/Table)}} :- [:maybe [:map
                                                             [:alias          {:optional true} :keyword]
                                                             [:user-settings? {:optional true} :boolean]]]]
   [(t2/table-name :model/Table) alias]))
