(ns metabase-enterprise.action-v2.db
  "Application database queries for the action-v2 module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table table-id))

(mu/defn active-table :- [:maybe (ms/InstanceOf :model/Table)]
  "The active Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id :active true))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn fields :- [:sequential (ms/InstanceOf :model/Field)]
  "The Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Field :id [:in field-ids]))

(mu/defn pk-fields-for-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The active primary key Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Field :table_id table-id :semantic_type :type/PK :active true))

(mu/defn fields-by-name :- [:sequential (ms/InstanceOf :model/Field)]
  "The Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ms/PositiveInt
   field-names :- [:seqable :string]]
  (t2/select :model/Field :table_id table-id :name [:in field-names]))

(mu/defn active-fields-in-position-order :- [:sequential (ms/InstanceOf :model/Field)]
  "The active Fields of the Table with `table-id`, in position order."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Field :table_id table-id :active true {:order-by [[:position]]}))

(mu/defn field-requirements-by-name :- [:map-of :string (ms/InstanceOf :model/Field)]
  "A map of name to the name, required flag, and base type of the Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-fn->fn :name identity [:model/Field :name :database_required :base_type] :table_id table-id))

(mu/defn category-list-field-ids-by-name :- [:sequential [:map {:closed true} [:id ms/PositiveInt] [:lower_name :string]]]
  "The `:id` and `:lower_name` rows of the category list Fields of the Table with `table-id` whose name matches one
  of `names`, case-insensitively."
  [table-id :- ms/PositiveInt
   names    :- [:seqable :string]]
  (t2/query {:select [:id [[:lower :name] :lower_name]]
             :from   [(t2/table-name :model/Field)]
             :where  [:and
                      [:= :table_id table-id]
                      [:in [:lower :name] (map u/lower-case-en names)]
                      [:in :has_field_values ["list" "auto-list"]]
                      [:= :semantic_type "type/Category"]]}))

(mu/defn field-values-of-fields :- [:maybe [:sequential :any]]
  "The value lists of the FieldValues of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-vec :values :model/FieldValues :field_id [:in field-ids]))

(defn- scope-and-user-expr
  [scope user-id]
  [:and
   (when scope [:= :scope scope])
   (when user-id [:= :user_id user-id])])

(mu/defn next-undo-batch :- [:sequential (ms/InstanceOf :model/Undo)]
  "The Undo rows of the newest not-undone (when `undo?`) or oldest undone batch of `user-id` in `scope`."
  [undo?   :- :boolean
   user-id :- ms/PositiveInt
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

(mu/defn batch-to-prune-from :- [:sequential [:map {:closed true} [:batch_num :int]]]
  "The `:batch_num` row of the newest Undo batch beyond the `batches-to-keep` most recent ones, narrowed by the
  optional `scope` and `user-id`, or nil."
  [batches-to-keep :- ms/PositiveInt
   scope           :- [:maybe :string]
   user-id         :- [:maybe ms/PositiveInt]]
  (t2/query {:select   [:batch_num]
             :from     [(t2/table-name :model/Undo)]
             :where    (scope-and-user-expr scope user-id)
             :group-by :batch_num
             :order-by [[:batch_num :desc]]
             :limit    1
             :offset   batches-to-keep}))

(mu/defn batch-to-prune-from-for-rows :- [:sequential [:map {:closed true} [:batch_num :int]]]
  "The `:batch_num` row of the Undo row beyond the `rows-to-keep` most recent ones, or nil."
  [rows-to-keep :- ms/PositiveInt]
  (t2/query {:select   [:batch_num]
             :from     [(t2/table-name :model/Undo)]
             :order-by [[:id :desc]]
             :limit    1
             :offset   rows-to-keep}))

(mu/defn delete-undo-batches-up-to! :- :int
  "Delete the Undo rows of batches up to `batch-num`, narrowed by the optional `scope` and `user-id`."
  [batch-num :- ms/IntGreaterThanOrEqualToZero
   scope     :- [:maybe :string]
   user-id   :- [:maybe ms/PositiveInt]]
  (t2/delete! :model/Undo :batch_num [:<= batch-num] {:where (scope-and-user-expr scope user-id)}))

(mu/defn delete-undone-batches-from! :- :int
  "Delete the undone Undo rows in `scope` from batch `batch-num` onwards."
  [batch-num :- ms/PositiveInt
   scope     :- :string]
  (t2/delete! :model/Undo :batch_num [:>= batch-num] :scope scope :undone true))

(mu/defn insert-undos! :- :int
  "Insert the Undo `undos`."
  [undos :- [:seqable
             [:map {:closed true}
              [:batch_num  {:optional true} :any]
              [:table_id   {:optional true} :any]
              [:row_pk     {:optional true} :any]
              [:user_id    {:optional true} :any]
              [:scope      {:optional true} :any]
              [:undoable   {:optional true} :any]
              [:raw_before {:optional true} :any]
              [:raw_after  {:optional true} :any]
              [:undone     {:optional true} :any]]]]
  (t2/insert! :model/Undo undos))

(mu/defn mark-batch-undone! :- :int
  "Set the undone flag of the Undo batch `batch-num` to `undone?`."
  [batch-num :- ms/PositiveInt
   undone?   :- :boolean]
  (t2/update! :model/Undo {:batch_num batch-num} {:undone undone?}))

(mu/defn superseding-change-exists? :- :boolean
  "Whether a later (when `undo?`) or earlier Undo row for the rows `row-pks` of the Tables `table-ids` exists beyond
  batch `batch-num` with the opposite undone state."
  [undo?     :- :boolean
   table-ids :- [:seqable ms/PositiveInt]
   row-pks   :- [:seqable :any]
   batch-num :- ms/PositiveInt]
  (t2/exists? :model/Undo
              :table_id [:in table-ids]
              :row_pk [:in row-pks]
              :batch_num [(if undo? :> :<) batch-num]
              :undone (not undo?)))

(mu/defn lock-sequence-next-val :- [:maybe :int]
  "The next value of the raw sequence row named `sequence-name`, locked for update, or nil."
  [sequence-name :- :string]
  (t2/select-one-fn :next_val [:sequences :next_val] :name sequence-name {:for :update}))

(mu/defn set-sequence-next-val! :- :int
  "Set the next value of the raw sequence row named `sequence-name`."
  [sequence-name :- :string
   next-val      :- :int]
  (t2/update! :sequences {:name sequence-name} {:next_val next-val}))

(mu/defn insert-sequence! :- :int
  "Insert a raw sequence row named `sequence-name` whose next value is `next-val`."
  [sequence-name :- :string
   next-val      :- :int]
  (t2/insert! :sequences {:name sequence-name :next_val next-val}))
