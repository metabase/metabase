(ns metabase-enterprise.action-v2.db
  "Application database queries for the action-v2 module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase-enterprise.action-v2.schema :as action-v2.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.core :as warehouse-schema]
   [toucan2.core :as t2]))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table table-id))

(mu/defn active-table
  "The active Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id :active true))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids]))

(mu/defn pk-fields-for-table
  "The active primary key Fields of the Table with `table-id`, as users see them; honors the user's
  `semantic_type`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field
             {:select    (warehouse-schema/fields-with-user-settings-select :f :u)
              :from      [[(t2/table-name :model/Field) :f]]
              :left-join (warehouse-schema/field-user-settings-join :f :u)
              :where     [:and
                          [:= :f.table_id table-id]
                          [:= (warehouse-schema/field-user-settings-column :semantic_type :f :u) "type/PK"]
                          :f.active]}))

(mu/defn fields-by-name
  "The Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ::lib.schema.id/table
   field-names :- [:sequential :string]]
  (t2/select :model/Field :table_id table-id :name [:in field-names]))

(mu/defn active-fields-in-position-order
  "The active Fields of the Table with `table-id`, in position order."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :active true {:order-by [[:position]]}))

(mu/defn field-requirements-by-name
  "A map of name to the name, required flag, and base type of the Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn->fn :name identity [:model/Field :name :database_required :base_type] :table_id table-id))

(mu/defn category-list-field-ids-by-name
  "The `:id` and `:lower_name` rows of the category list Fields of the Table with `table-id` whose name matches one
  of `names`, case-insensitively; honors the user's `has_field_values`/`semantic_type`."
  [table-id :- ::lib.schema.id/table
   names    :- [:sequential :string]]
  (t2/query {:select    [:f.id [[:lower :f.name] :lower_name]]
             :from      [[(t2/table-name :model/Field) :f]]
             :left-join (warehouse-schema/field-user-settings-join :f :u)
             :where     [:and
                         [:= :f.table_id table-id]
                         [:in [:lower :f.name] (map u/lower-case-en names)]
                         [:in (warehouse-schema/field-user-settings-column :has_field_values :f :u) ["list" "auto-list"]]
                         [:= (warehouse-schema/field-user-settings-column :semantic_type :f :u) "type/Category"]]}))

(mu/defn field-values-of-fields
  "The value lists of the FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select-fn-vec :values :model/FieldValues :field_id [:in field-ids]))

(defn- scope-and-user-expr
  [scope user-id]
  [:and
   (when scope [:= :scope scope])
   (when user-id [:= :user_id user-id])])

(mu/defn next-undo-batch
  "The Undo rows of the newest not-undone (when `undo?`) or oldest undone batch of `user-id` in `scope`."
  [undo?   :- :boolean
   user-id :- ::lib.schema.id/user
   scope   :- :string]
  (t2/select :model/Undo
             :batch_num [:in
                         ^:allow-subquery
                         {:select [[[(if undo? :max :min) :batch_num]]]
                          :from   [(t2/table-name :model/Undo)]
                          :where  [:and
                                   [:= :user_id user-id]
                                   [:= :scope scope]
                                   (if undo?
                                     [:not :undone]
                                     :undone)]}]))

(mu/defn batch-to-prune-from
  "The `:batch_num` row of the newest Undo batch beyond the `batches-to-keep` most recent ones, narrowed by the
  optional `scope` and `user-id`, or nil."
  [batches-to-keep :- ms/PositiveInt
   scope           :- [:maybe :string]
   user-id         :- [:maybe ::lib.schema.id/user]]
  (t2/query {:select   [:batch_num]
             :from     [(t2/table-name :model/Undo)]
             :where    (scope-and-user-expr scope user-id)
             :group-by :batch_num
             :order-by [[:batch_num :desc]]
             :limit    1
             :offset   batches-to-keep}))

(mu/defn batch-to-prune-from-for-rows
  "The `:batch_num` row of the Undo row beyond the `rows-to-keep` most recent ones, or nil."
  [rows-to-keep :- ms/PositiveInt]
  (t2/query {:select   [:batch_num]
             :from     [(t2/table-name :model/Undo)]
             :order-by [[:id :desc]]
             :limit    1
             :offset   rows-to-keep}))

(mu/defn delete-undo-batches-up-to!
  "Delete the Undo rows of batches up to `batch-num`, narrowed by the optional `scope` and `user-id`."
  [batch-num :- ms/IntGreaterThanOrEqualToZero
   scope     :- [:maybe :string]
   user-id   :- [:maybe ::lib.schema.id/user]]
  (t2/delete! :model/Undo :batch_num [:<= batch-num] {:where (scope-and-user-expr scope user-id)}))

(mu/defn delete-undone-batches-from!
  "Delete the undone Undo rows in `scope` from batch `batch-num` onwards."
  [batch-num :- ms/PositiveInt
   scope     :- :string]
  (t2/delete! :model/Undo :batch_num [:>= batch-num] :scope scope :undone true))

(mu/defn insert-undos!
  "Insert the Undo `undos`."
  [undos :- [:sequential
             ::action-v2.schema/undo.update]]
  (t2/insert! :model/Undo undos))

(mu/defn mark-batch-undone!
  "Set the undone flag of the Undo batch `batch-num` to `undone?`."
  [batch-num :- ms/PositiveInt
   undone?   :- :boolean]
  (t2/update! :model/Undo {:batch_num batch-num} {:undone undone?}))

(mu/defn superseding-change-exists?
  "Whether a later (when `undo?`) or earlier Undo row for the rows `row-pks` of the Tables `table-ids` exists beyond
  batch `batch-num` with the opposite undone state."
  [undo?     :- :boolean
   table-ids :- [:set ::lib.schema.id/table]
   row-pks   :- [:set :some]
   batch-num :- ms/PositiveInt]
  (t2/exists? :model/Undo
              :table_id [:in table-ids]
              :row_pk [:in row-pks]
              :batch_num [(if undo? :> :<) batch-num]
              :undone (not undo?)))

(mu/defn lock-sequence-next-val
  "The next value of the raw sequence row named `sequence-name`, locked for update, or nil."
  [sequence-name :- :string]
  (t2/select-one-fn :next_val [:sequences :next_val] :name sequence-name {:for :update}))

(mu/defn set-sequence-next-val!
  "Set the next value of the raw sequence row named `sequence-name`."
  [sequence-name :- :string
   next-val      :- :int]
  (t2/update! :sequences {:name sequence-name} {:next_val next-val}))

(mu/defn insert-sequence!
  "Insert a raw sequence row named `sequence-name` whose next value is `next-val`."
  [sequence-name :- :string
   next-val      :- :int]
  (t2/insert! :sequences {:name sequence-name :next_val next-val}))
