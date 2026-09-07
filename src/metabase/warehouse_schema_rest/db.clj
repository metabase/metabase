(ns metabase.warehouse-schema-rest.db
  "Application database queries for the warehouse schema REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn field-and-target-database-ids
  "The `:source_db_id` and `:target_db_id` of the Fields with `source-field-id` and `target-field-id`."
  [source-field-id target-field-id]
  (t2/query {:select [[:source_t.db_id :source_db_id]
                      [:target_t.db_id :target_db_id]]
             :from   [[(t2/table-name :model/Field) :sf]]
             :join   [[(t2/table-name :model/Table) :source_t] [:= :sf.table_id :source_t.id]
                      [(t2/table-name :model/Field) :tf] [:= :tf.id target-field-id]
                      [(t2/table-name :model/Table) :target_t] [:= :tf.table_id :target_t.id]]
             :where  [:= :sf.id source-field-id]}))

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn update-field!
  "Apply `changes` to the Field with `field-id`."
  [field-id changes]
  (t2/update! :model/Field field-id changes))

(defn set-nested-fields-active!
  "Set the active flag of the Fields of the Table with `table-id` whose NFC path matches the SQL LIKE
  `nfc-path-pattern`, returning the number updated."
  [table-id nfc-path-pattern active?]
  (t2/update! :model/Field :table_id table-id :nfc_path [:like nfc-path-pattern] {:active active?}))

(defn dimension-for-field
  "The Dimension of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Dimension :field_id field-id))

(defn insert-dimension!
  "Insert the Dimension `row`."
  [row]
  (t2/insert! :model/Dimension row))

(defn update-dimension!
  "Apply `changes` to the Dimension with `id`."
  [id changes]
  (t2/update! :model/Dimension id changes))

(defn rename-dimension-for-field!
  "Set the name of the Dimension of the Field with `field-id`."
  [field-id dimension-name]
  (t2/update! :model/Dimension :field_id field-id {:name dimension-name}))

(defn delete-dimension!
  "Delete the Dimension with `id`."
  [id]
  (t2/delete! :model/Dimension :id id))

(defn delete-dimensions-for-field!
  "Delete the Dimensions of the Field with `field-id`."
  [field-id]
  (t2/delete! :model/Dimension :field_id field-id))

(defn matching-tables
  "The Tables (active, or with `transform_target` when `include-transform-targets?`) matching `term` (a glob pattern
  using `*` as a wildcard, matched against `:name` and `:display_name`), optionally narrowed to `visibility-type`,
  `data-layer`, `data-source`, `owner-user-id`, and/or `owner-email`; restricted to ownerless Tables when
  `orphan-only?`, published Tables when `published-only?`, and (when `check-unused?`) Tables with no dependents,
  ordered by name."
  [{:keys [term visibility-type data-layer data-source owner-user-id owner-email orphan-only? published-only?
           check-unused? include-transform-targets?]}]
  (let [db-type    (app-db/db-type)
        glob       (fn [escaped]
                     (-> escaped
                         (str/replace "*" "%")
                         (cond-> (not (str/ends-with? term "*")) (str "%"))))
        ci-pattern (fn [pattern]
                     (case db-type
                       (:h2 :postgres) pattern
                       [::h2x/collate pattern "utf8mb4_unicode_ci"]))
        like       (fn [field wrap]
                     [(case db-type (:h2 :postgres) :ilike :like)
                      field
                      (h2x/like-pattern term (comp ci-pattern wrap glob))])
        where      (cond-> [:and (if include-transform-targets?
                                   [:or [:= :active true] [:= :transform_target true]]
                                   [:= :active true])]
                     (not (str/blank? term)) (conj [:or
                                                    (like :name identity)
                                                    (like :display_name identity)
                                                    ;; match word starts after spaces e.g. 'ite' would match 'Order Item'
                                                    (like :display_name #(str "% " %))])
                     visibility-type         (conj [:= :visibility_type visibility-type])
                     data-layer              (conj [:= :data_layer      (name data-layer)])
                     data-source             (conj [:= :data_source     (name data-source)])
                     owner-user-id           (conj [:= :owner_user_id   owner-user-id])
                     owner-email             (conj [:= :owner_email     owner-email])
                     orphan-only?            (conj [:and [:= :owner_email nil] [:= :owner_user_id nil]])
                     published-only?         (conj [:= :is_published true])
                     check-unused?
                     (conj [:not-exists ^:allow-subquery {:select [:*]
                                                          :from   [[:dependency :d]]
                                                          :where  [:and
                                                                   [:= :d.to_entity_id :metabase_table.id]
                                                                   [:= :d.to_entity_type "table"]]}]))]
    (t2/select :model/Table {:where where, :order-by [[:name :asc]]})))

(defn tables-by-ids
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id changes]
  (t2/update! :model/Table table-id changes))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database database-id))

(defn non-destination-database
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn active-unretired-field-ids-for-table
  "The ids of the active, unretired Fields of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-pks-set :model/Field, :table_id table-id, :visibility_type [:not= "retired"], :active true))

(defn field-ids-for-table
  "The ids of the Fields of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-pks-set :model/Field :table_id table-id))

(defn active-fields-targeting
  "The active Fields whose FK target is one of `field-ids`."
  [field-ids]
  (t2/select :model/Field, :fk_target_field_id [:in field-ids], :active true))

(defn delete-field-values-for-fields!
  "Delete the FieldValues of the Fields with `field-ids`."
  [field-ids]
  (t2/delete! (t2/table-name :model/FieldValues) :field_id [:in field-ids]))
