(ns metabase.llm.db
  "Application database queries for the LLM module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn visible-tables
  "The active, visible Tables among `table-ids` of the Database with `database-id` that `user-id` (or a
  superuser) can access for querying, requiring unrestricted view-data and query-builder-or-native create
  permissions."
  [table-ids   :- [:set ::lib.schema.id/table]
   database-id :- ::lib.schema.id/database
   user-id     :- [:maybe ::lib.schema.id/user]
   superuser?  :- :boolean]
  (let [{:keys [clause with]} (mi/visible-filter-clause
                               :model/Table :id
                               {:user-id user-id, :is-superuser? superuser?}
                               {:perms/view-data      :unrestricted
                                :perms/create-queries :query-builder-and-native})]
    (t2/select :model/Table
               :id [:in table-ids]
               :db_id database-id
               :active true
               :visibility_type nil
               (cond-> {:from  [(warehouse-schema-overlay/table-query)]
                        :where clause}
                 with (assoc :with with)))))
