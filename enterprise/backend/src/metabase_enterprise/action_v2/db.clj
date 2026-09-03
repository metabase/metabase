(ns metabase-enterprise.action-v2.db
  "Application database queries for the action-v2 module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Tables and Fields ------------------------------------------------

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table table-id))

(defn active-table
  "The active Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id :active true))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn fields
  "The Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field :id [:in field-ids]))

(defn pk-fields-for-table
  "The active primary key Fields of the Table with `table-id`."
  [table-id]
  (t2/select :model/Field :table_id table-id :semantic_type :type/PK :active true))

(defn fields-by-name
  "The Fields of the Table with `table-id` named one of `field-names`."
  [table-id field-names]
  (t2/select :model/Field :table_id table-id :name [:in field-names]))

(defn active-fields-in-position-order
  "The active Fields of the Table with `table-id`, in position order."
  [table-id]
  (t2/select :model/Field :table_id table-id :active true {:order-by [[:position]]}))

(defn field-requirements-by-name
  "A map of name to the name, required flag, and base type of the Fields of the Table with `table-id`."
  [table-id]
  (t2/select-fn->fn :name identity [:model/Field :name :database_required :base_type] :table_id table-id))

(defn category-list-field-ids-by-lower-name
  "The `:id` and `:lower_name` rows of the category list Fields of the Table with `table-id` whose lower-cased name is
  one of `lower-names`."
  [table-id lower-names]
  (t2/query {:select [:id [[:lower :name] :lower_name]]
             :from   [(t2/table-name :model/Field)]
             :where  [:and
                      [:= :table_id table-id]
                      [:in [:lower :name] lower-names]
                      [:in :has_field_values ["list" "auto-list"]]
                      [:= :semantic_type "type/Category"]]}))

(defn field-values-of-fields
  "The value lists of the FieldValues of the Fields with `field-ids`."
  [field-ids]
  (t2/select-fn-vec :values :model/FieldValues :field_id [:in field-ids]))

(defn hydrate-form-field-details
  "Hydrate dimensions, has-field-values, and values onto `fields`."
  [fields]
  (t2/hydrate fields :dimensions :has_field_values :values))

;;; ------------------------------------------------------ Undo ------------------------------------------------------

(defn- scope-and-user-where
  [scope user-id]
  [:and
   (when scope [:= :scope scope])
   (when user-id [:= :user_id user-id])])

(defn next-undo-batch
  "The Undo rows of the newest not-undone (when `undo?`) or oldest undone batch of `user-id` in `scope`."
  [undo? user-id scope]
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

(defn batch-to-prune-from
  "The `:batch_num` row of the newest Undo batch beyond the `batches-to-keep` most recent ones, narrowed by the
  optional `scope` and `user-id`, or nil."
  [batches-to-keep scope user-id]
  (t2/query {:select   [:batch_num]
             :from     [(t2/table-name :model/Undo)]
             :where    (scope-and-user-where scope user-id)
             :group-by :batch_num
             :order-by [[:batch_num :desc]]
             :limit    1
             :offset   batches-to-keep}))

(defn batch-to-prune-from-for-rows
  "The `:batch_num` row of the Undo row beyond the `rows-to-keep` most recent ones, or nil."
  [rows-to-keep]
  (t2/query {:select   [:batch_num]
             :from     [(t2/table-name :model/Undo)]
             :order-by [[:id :desc]]
             :limit    1
             :offset   rows-to-keep}))

(defn delete-undo-batches-up-to!
  "Delete the Undo rows of batches up to `batch-num`, narrowed by the optional `scope` and `user-id`."
  [batch-num scope user-id]
  (t2/delete! :model/Undo :batch_num [:<= batch-num] {:where (scope-and-user-where scope user-id)}))

(defn delete-undone-batches-from!
  "Delete the undone Undo rows in `scope` from batch `batch-num` onwards."
  [batch-num scope]
  (t2/delete! :model/Undo :batch_num [:>= batch-num] :scope scope :undone true))

(defn insert-undo-rows!
  "Insert the Undo `rows`."
  [rows]
  (t2/insert! :model/Undo rows))

(defn mark-batch-undone!
  "Set the undone flag of the Undo batch `batch-num` to `undone?`."
  [batch-num undone?]
  (t2/update! :model/Undo {:batch_num batch-num} {:undone undone?}))

(defn superseding-change-exists?
  "Whether a later (when `undo?`) or earlier Undo row for the rows `row-pks` of the Tables `table-ids` exists beyond
  batch `batch-num` with the opposite undone state."
  [undo? table-ids row-pks batch-num]
  (t2/exists? :model/Undo
              :table_id [:in table-ids]
              :row_pk [:in row-pks]
              :batch_num [(if undo? :> :<) batch-num]
              :undone (not undo?)))

(defn lock-sequence-next-val
  "The next value of the raw sequence row named `sequence-name`, locked for update, or nil."
  [sequence-name]
  (t2/select-one-fn :next_val [:sequences :next_val] :name sequence-name {:for :update}))

(defn set-sequence-next-val!
  "Set the next value of the raw sequence row named `sequence-name`."
  [sequence-name next-val]
  (t2/update! :sequences {:name sequence-name} {:next_val next-val}))

(defn insert-sequence!
  "Insert a raw sequence row named `sequence-name` whose next value is `next-val`."
  [sequence-name next-val]
  (t2/insert! :sequences {:name sequence-name :next_val next-val}))
