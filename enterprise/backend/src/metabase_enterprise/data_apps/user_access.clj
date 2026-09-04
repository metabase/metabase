(ns metabase-enterprise.data-apps.user-access
  (:require
   [clojure.string :as str]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-details
  [table-ids]
  (if (seq table-ids)
    (t2/select :model/Table
               {:select [:t.id
                         [:t.display_name :name]
                         :t.schema
                         [:t.db_id :database_id]
                         [:d.name :database_name]]
                :from [[:metabase_table :t]]
                :join [[:metabase_database :d] [:= :d.id :t.db_id]]
                :where [:in :t.id table-ids]
                :order-by [[:d.name :asc] [:t.schema :asc] [:t.display_name :asc]]})
    []))

(defn- sandboxed-table-ids
  [user-id]
  (into #{} (map :table_id) (sandbox.api.util/enforced-sandboxes-for-user user-id)))

(defn- unrestricted-user-table-pairs
  [user-ids table-ids]
  (if (and (seq user-ids) (seq table-ids))
    (into #{}
          (map (juxt :user_id :table_id))
          (t2/query {:select-distinct [[:pgm.user_id :user_id]
                                       [:t.id :table_id]]
                     :from [[:permissions_group_membership :pgm]]
                     :join [[:data_permissions :dp] [:= :dp.group_id :pgm.group_id]
                            [:permissions_group :pg] [:= :pg.id :pgm.group_id]
                            [:metabase_table :t] [:and
                                                  [:= :t.db_id :dp.db_id]
                                                  [:or
                                                   [:= :dp.table_id nil]
                                                   [:= :dp.table_id :t.id]]]]
                     :where [:and
                             [:in :pgm.user_id user-ids]
                             [:in :t.id table-ids]
                             [:not :pg.is_data_app_group]
                             [:= :dp.perm_type "view-data"]
                             [:= :dp.perm_value "unrestricted"]]}))
    #{}))

(defn- user-warning
  [user tables unrestricted-pairs]
  (when-not (:is_superuser user)
    (let [user-id       (:id user)
          sandboxed-ids (sandboxed-table-ids user-id)
          has-access?   (fn [{table-id :id}]
                          (or (unrestricted-pairs [user-id table-id])
                              (sandboxed-ids table-id)))
          missing       (remove has-access? tables)]
      (when (seq missing)
        {:user_id        (:id user)
         :missing_tables (vec missing)}))))

(defn permission-warnings
  "Returns access warnings for the requested users who cannot access every table in `table-ids`.
  Superusers and users with unrestricted or sandboxed access to every table are omitted."
  [table-ids users]
  (if (seq table-ids)
    (let [tables             (table-details table-ids)
          unrestricted-pairs (unrestricted-user-table-pairs (map :id users) table-ids)]
      (into [] (keep #(user-warning % tables unrestricted-pairs)) users))
    []))

(defn group-has-permission-warnings?
  "Whether any member of `group-id` cannot access every table in `table-ids`."
  [table-ids group-id]
  (if (and (seq table-ids) group-id)
    (let [user-ids (t2/select-fn-set :user_id :model/PermissionsGroupMembership :group_id group-id)
          users    (if (seq user-ids)
                     (->> (t2/select [:model/User :id :is_superuser :email] :id [:in user-ids])
                          (remove #(str/ends-with? (:email %) "@api-key.invalid")))
                     [])]
      (boolean (seq (permission-warnings table-ids users))))
    false))
