(ns metabase-enterprise.data-apps.user-access
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]))

(set! *warn-on-reflection* true)

(defn- table-details
  [table-ids]
  (if (seq table-ids)
    (data-apps.db/table-details table-ids)
    []))

(defn- sandboxed-user-table-pairs
  [user-ids table-ids]
  (if (and (seq user-ids) (seq table-ids))
    (into #{}
          (map (juxt :user_id :table_id))
          (data-apps.db/sandboxed-user-table-access user-ids table-ids))
    #{}))

(defn- unrestricted-user-table-pairs
  [user-ids table-ids]
  (if (and (seq user-ids) (seq table-ids))
    (into #{}
          (map (juxt :user_id :table_id))
          (data-apps.db/unrestricted-user-table-access user-ids table-ids))
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
    (->> (data-apps.db/active-group-members group-ids)
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
