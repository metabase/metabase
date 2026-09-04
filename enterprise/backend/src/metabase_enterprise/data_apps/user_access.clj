(ns metabase-enterprise.data-apps.user-access
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
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

(defn- sandboxed-user-table-pairs
  [user-ids table-ids]
  (if (and (seq user-ids) (seq table-ids))
    (into #{}
          (map (juxt :user_id :table_id))
          (t2/query {:select-distinct [[:pgm.user_id :user_id]
                                       [:s.table_id :table_id]]
                     :from [[:permissions_group_membership :pgm]]
                     :join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]
                            [:permissions_group :pg] [:= :pg.id :pgm.group_id]]
                     :where [:and
                             [:in :pgm.user_id user-ids]
                             [:in :s.table_id table-ids]
                             [:not :pg.is_data_app_group]]}))
    #{}))

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
                             [:= :dp.perm_type (u/qualified-name :perms/view-data)]
                             [:= :dp.perm_value "unrestricted"]]}))
    #{}))

(defn- user-warning
  [user tables unrestricted-pairs sandboxed-pairs]
  (when-not (:is_superuser user)
    (let [user-id     (:id user)
          has-access? (fn [{table-id :id}]
                        (or (unrestricted-pairs [user-id table-id])
                            (sandboxed-pairs [user-id table-id])))
          missing     (remove has-access? tables)]
      (when (seq missing)
        {:user_id        (:id user)
         :missing_tables (vec missing)}))))

(defn permission-warnings
  "Returns access warnings for the requested users who cannot access every table in `table-ids`.
  Superusers and users with unrestricted or sandboxed access to every table are omitted."
  [table-ids users]
  (if (seq table-ids)
    (let [tables             (table-details table-ids)
          user-ids           (map :id users)
          unrestricted-pairs (unrestricted-user-table-pairs user-ids table-ids)
          sandboxed-pairs    (sandboxed-user-table-pairs user-ids table-ids)]
      (into [] (keep #(user-warning % tables unrestricted-pairs sandboxed-pairs)) users))
    []))

(defn- active-group-members
  [group-ids]
  (if (seq group-ids)
    (->> (t2/query {:select [[:pgm.group_id :group_id]
                             [:u.id :id]
                             :u.is_superuser
                             :u.email]
                    :from [[:permissions_group_membership :pgm]]
                    :join [[:core_user :u] [:= :u.id :pgm.user_id]]
                    :where [:and
                            [:in :pgm.group_id group-ids]
                            [:= :u.is_active true]]})
         (remove #(str/ends-with? (:email %) "@api-key.invalid")))
    []))

(defn- group-has-permission-warning?
  [users table-ids unrestricted-pairs sandboxed-pairs]
  (let [tables (mapv (fn [table-id] {:id table-id}) table-ids)]
    (boolean (some #(user-warning % tables unrestricted-pairs sandboxed-pairs) users))))

(defn groups-with-permission-warnings
  "The permission group IDs for apps with an active member who cannot access every dependent table."
  [apps]
  (let [apps               (filter #(and (:permission_group_id %) (seq (:table_ids %))) apps)
        group-ids          (into #{} (map :permission_group_id) apps)
        memberships        (active-group-members group-ids)
        group->users       (group-by :group_id memberships)
        user-ids           (into #{} (map :id) memberships)
        table-ids          (into #{} (mapcat :table_ids) apps)
        unrestricted-pairs (unrestricted-user-table-pairs user-ids table-ids)
        sandboxed-pairs    (sandboxed-user-table-pairs user-ids table-ids)]
    (into #{}
          (keep (fn [{:keys [permission_group_id table_ids]}]
                  (when (group-has-permission-warning? (group->users permission_group_id)
                                                       table_ids
                                                       unrestricted-pairs
                                                       sandboxed-pairs)
                    permission_group_id)))
          apps)))
