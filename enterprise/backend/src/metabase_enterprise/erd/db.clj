(ns metabase-enterprise.erd.db
  "Application database queries for the erd module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.warehouse-schema.models.table :as schema.table]
   [toucan2.core :as t2]))

(defn active-tables-in-database
  "The `columns` of the active Tables in the Database with `database-id`. `opts` may restrict the result: a
  `:table-ids` key restricts to those IDs (even when its value is empty), and a `:schema` key restricts to that
  schema (`\"\"` matches both nil and empty-string schemas)."
  [columns database-id {:keys [table-ids schema] :as opts}]
  (t2/select :model/Table
             {:select columns
              :where  (cond-> [:and [:= :db_id database-id] [:= :active true]]
                        (contains? opts :table-ids) (conj [:in :id table-ids])
                        (contains? opts :schema)     (conj (if (= schema "")
                                                             [:or [:= :schema nil] [:= :schema ""]]
                                                             [:= :schema schema])))}))

(defn active-fields-for-tables
  "The active Fields of the Tables with `table-ids`, in field order."
  [table-ids]
  (t2/select :model/Field {:where    [:and
                                      [:in :table_id table-ids]
                                      [:= :active true]]
                           :order-by schema.table/field-order-rule}))

(defn active-fields
  "The active Fields with `field-ids`."
  [field-ids]
  (t2/select :model/Field {:where [:and
                                   [:in :id field-ids]
                                   [:= :active true]]}))
