(ns metabase-enterprise.erd.db
  "Application database queries for the erd module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.table :as schema.table]
   [toucan2.core :as t2]))

(def ^:private ActiveTablesOpts
  "The optional restrictions [[active-tables-in-database]] accepts."
  [:map {:closed true}
   [:table-ids {:optional true} [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]
   [:schema    {:optional true} [:maybe :string]]])

(mu/defn active-tables-in-database
  "The `columns` of the active Tables in the Database with `database-id`. `opts` may restrict the result: a
  `:table-ids` key restricts to those IDs (even when its value is empty), and a `:schema` key restricts to that
  schema (`\"\"` matches both nil and empty-string schemas)."
  [columns     :- [:sequential :keyword]
   database-id :- ::lib.schema.id/database
   opts        :- [:maybe ActiveTablesOpts]]
  (let [{:keys [table-ids schema]} opts
        select-tables (fn [ids]
                        (t2/select :model/Table
                                   {:select columns
                                    :where  (cond-> [:and [:= :db_id database-id] [:= :active true]]
                                              ids                      (conj [:in :id ids])
                                              (contains? opts :schema) (conj (if (= schema "")
                                                                               [:or [:= :schema nil] [:= :schema ""]]
                                                                               [:= :schema schema])))}))]
    (if (contains? opts :table-ids)
      (mdb/select-batched select-tables table-ids)
      (select-tables nil))))

(mu/defn active-fields-for-tables
  "The active Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select :model/Field {:where    [:and
                                                           [:in :table_id %]
                                                           [:= :active true]]
                                                :order-by schema.table/field-order-rule})
                      table-ids))

(mu/defn active-fields
  "The active Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (mdb/select-batched #(t2/select :model/Field {:where [:and
                                                        [:in :id %]
                                                        [:= :active true]]})
                      field-ids))
