(ns metabase-enterprise.erd.db
  "Application database queries for the erd module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]))

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
  (let [{:keys [table-ids schema]} opts]
    (t2/select (into [:model/Table] columns)
               {:where (t2/fragment
                        [:and
                         [:= :db_id database-id]
                         [:= :active true]
                         (when (contains? opts :table-ids)
                           (t2/fragment [:in :id table-ids]))
                         (when (contains? opts :schema)
                           (if (= schema "")
                             (t2/fragment [:or [:= :schema nil] [:= :schema ""]])
                             (t2/fragment [:= :schema schema])))])})))

(mu/defn active-fields-for-tables
  "The active Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field {:where    [:and
                                      [:in :table_id table-ids]
                                      [:= :active true]]
                           :order-by [[:position :asc] [:%lower.name :asc]]}))

(mu/defn active-fields
  "The active Fields with `field-ids`."
  [field-ids :- [:or [:set ::lib.schema.id/field] [:sequential ::lib.schema.id/field]]]
  (t2/select :model/Field {:where [:and
                                   [:in :id field-ids]
                                   [:= :active true]]}))
