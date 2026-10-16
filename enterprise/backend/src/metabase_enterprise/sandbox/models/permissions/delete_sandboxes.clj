(ns metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- should-delete-sandbox?
  "Given the changes map and a candidate sandbox, determine if this sandbox should be deleted.
   A sandbox should be deleted when the permission change for its group+table means it is no longer sandboxed."
  [changes {:keys [group_id db_id schema table_id]}]
  (let [view-data-changes (get-in changes [group_id db_id :view-data])]
    (cond
      (nil? view-data-changes)     false
      ;; DB-level change (keyword like :unrestricted) → delete all sandboxes for this group+db
      (keyword? view-data-changes) true
      :else
      ;; the API graph keys tables that have no schema under "", but `metabase_table.schema` is nil for them, so
      ;; look the schema up the way the graph spells it
      (let [schema-changes (or (get view-data-changes (or schema ""))
                               (get view-data-changes schema))]
        (cond
          (nil? schema-changes)     false
          ;; Schema-level change → delete all sandboxes for this group+db+schema
          (keyword? schema-changes) true
          :else
          ;; Table-level change → delete unless the new value is :sandboxed
          (let [table-change (get schema-changes table_id)]
            (and (some? table-change)
                 (not= table-change :sandboxed))))))))

(defn- candidate-sandboxes
  "The `:id`, `:group_id`, `:table_id`, `:db_id`, and `:schema` of the Sandboxes of the groups with `group-ids` on
  Tables of the Databases with `db-ids`."
  [group-ids db-ids]
  (app-db/query
   {:select    [[:sandboxes.id :id]
                [:sandboxes.group_id :group_id]
                [:sandboxes.table_id :table_id]
                [:table.db_id :db_id]
                [:table.schema :schema]]
    :from      [[:sandboxes]]
    :left-join [[:metabase_table :table]
                [:= :sandboxes.table_id :table.id]]
    :where     [:and
                [:in :sandboxes.group_id group-ids]
                [:in :table.db_id db-ids]]}))

(defn- sandboxed-view-data?
  "Does an API-graph `:view-data` value (a keyword, or a map of schema to keyword or map of table ID to keyword) sandbox
  anything?"
  [view-data]
  (if (map? view-data)
    (some sandboxed-view-data? (vals view-data))
    (= view-data :sandboxed)))

(defenterprise check-native-access-without-sandboxes!
  "Throw a 400 if a group in `native-group-db-ids`, a set of `[group-id db-id]` pairs being granted native query
  access, would also have a sandbox on that database once `changes` are applied: either one it newly sandboxes, or
  an existing one that [[delete-gtaps-if-needed-after-permissions-change!]] won't delete. Native queries bypass
  sandboxing."
  :feature :sandboxes
  [changes native-group-db-ids]
  (when (seq native-group-db-ids)
    (let [kept-sandboxes (into #{}
                               (comp (remove (partial should-delete-sandbox? changes))
                                     (map (juxt :group_id :db_id)))
                               (candidate-sandboxes
                                (into #{} (map first) native-group-db-ids)
                                (into #{} (map second) native-group-db-ids)))]
      (when (some (fn [[group-id db-id :as group-db-id]]
                    (or (contains? kept-sandboxes group-db-id)
                        (sandboxed-view-data? (get-in changes [group-id db-id :view-data]))))
                  native-group-db-ids)
        (throw (ex-info (tru "A group with row and column security on a database cannot also have native query access to it.")
                        {:status-code 400}))))))

(defenterprise delete-gtaps-if-needed-after-permissions-change!
  "For use only inside `metabase.permissions.models.permissions`; don't call this elsewhere. Delete GTAPs (sandboxes) that are no
  longer needed after the permissions graph is updated. `changes` are the parts of the graph that have changed, i.e.
  the `things-only-in-new` returned by `clojure.data/diff`."
  :feature :sandboxes
  [changes]
  (log/debug "Permissions updated, deleting unneeded GTAPs...")
  (try
    (let [all-group-ids (into #{} (for [[group-id group-changes] changes
                                        [_db-id db-changes] group-changes
                                        :when (contains? db-changes :view-data)]
                                    group-id))
          all-db-ids    (into #{} (for [[_group-id group-changes] changes
                                        [db-id db-changes] group-changes
                                        :when (contains? db-changes :view-data)]
                                    db-id))]
      (when (and (seq all-group-ids) (seq all-db-ids))
        (let [candidate-sandboxes (candidate-sandboxes all-group-ids all-db-ids)
              ids-to-delete (into #{}
                                  (comp (filter (partial should-delete-sandbox? changes))
                                        (map :id))
                                  candidate-sandboxes)]
          (when (seq ids-to-delete)
            (log/debugf "Deleting %d unneeded GTAPs: %s" (count ids-to-delete) (pr-str ids-to-delete))
            (t2/delete! :model/Sandbox :id [:in ids-to-delete])))))
    (catch Throwable e
      (throw (ex-info (tru "Error deleting Sandboxes: {0}" (ex-message e))
                      {:changes changes}
                      e))))
  (log/debug "Done deleting unneeded GTAPs."))
