(ns metabase-enterprise.impersonation.models
  "Model definition for Connection Impersonations, which are used to define specific database roles used by users in
  certain permission groups when running queries."
  (:require
   [medley.core :as m]
   [metabase-enterprise.impersonation.db :as impersonation.db]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Definition ---------------------------------------------------

(methodical/defmethod t2/table-name :model/ConnectionImpersonation [_model] :connection_impersonations)

(doto :model/ConnectionImpersonation
  (derive :metabase/model)
  ;; Only admins can work with Connection Impersonation configs
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/ConnectionImpersonation
  [impersonation]
  (let [changes (t2/changes impersonation)]
    (when (contains? changes :group_id)
      (throw (ex-info (tru "You cannot change the group of a connection impersonation.")
                      {:status-code 400})))
    (when (contains? changes :db_id)
      (throw (ex-info (tru "You cannot change the database of a connection impersonation.")
                      {:status-code 400})))
    impersonation))

;;; ----------------------------------------------- Permissions graph ------------------------------------------------

(defenterprise add-impersonations-to-permissions-graph
  "Augment a provided permissions graph with active connection impersonation policies."
  :feature :advanced-permissions
  [graph & {:keys [group-ids group-id db-id audit-db?]}]
  (m/deep-merge
   graph
   (let [impersonations (impersonation.db/impersonations-matching db-id
                                                                  group-id
                                                                  group-ids
                                                                  (when-not audit-db? audit/audit-db-id))]
     (reduce (fn [acc {:keys [db_id group_id]}]
               (assoc-in acc [group_id db_id :view-data] :impersonated))
             {}
             impersonations))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn delete-connection-impersonations! :- :nil
  "Delete the ConnectionImpersonations with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/ConnectionImpersonation ids {}))

(def ^:private impersonation-pair
  "The group and Database of an impersonation."
  (juxt :group_id :db_id))

(defn- impersonation-rounds
  "The `impersonations`, each with its index, in rounds: the nth round holds the nth impersonation of each group and
  Database, so that each round replaces the impersonations of the round before."
  [impersonations]
  (second (reduce (fn [[seen rounds] [i impersonation]]
                    (let [n (get seen (impersonation-pair impersonation) 0)]
                      [(assoc seen (impersonation-pair impersonation) (inc n))
                       (update rounds n (fnil conj []) [i impersonation])]))
                  [{} []]
                  (map-indexed vector impersonations))))

(defenterprise upsert-connection-impersonations-for-graph!
  "Create new Connection Impersonation records. Deletes any existing Connection Impersonation records for the same
  group and database before creating new ones."
  :feature :advanced-permissions
  [impersonations]
  (->> (impersonation-rounds impersonations)
       (into [] (mapcat (fn [round]
                          (delete-connection-impersonations!
                           (impersonation.db/impersonation-ids-for-groups-and-databases
                            (mapv (comp impersonation-pair second) round)))
                          (map vector (map first round) (impersonation.db/insert-impersonations! (mapv second round))))))
       (sort-by first)
       (mapv second)))

(defn- unneeded-impersonation-pair
  "The `[group-id database-id]` of the impersonations of the group with `group-id` on the Database with `database-id`
  that the view-data change `changes` leaves unneeded, or nil when they are still needed."
  [group-id database-id changes]
  (log/debugf "Deleting unneeded Connection Impersonations for Group %d for Database %d. Graph changes: %s"
              group-id database-id (pr-str changes))
  (when (not= :impersonated changes)
    (log/debugf "Group %d %s for Database %d, deleting all Connection Impersonations for this DB"
                group-id
                (case changes
                  :unrestricted "now has full data perms"
                  :blocked      "is now BLOCKED from all non-data-perms access"
                  "now has granular (sandboxed) data access")
                database-id)
    [group-id database-id]))

(defenterprise delete-connection-impersonations-for-permissions-change!
  "For use only inside `metabase.permissions.models.permissions`; don't call this elsewhere. Delete Connection Impersonations that
  are no longer needed after the permissions graph is updated, in one statement. `changes` are the parts of the graph
  that have changed, i.e. the `things-only-in-new` returned by `clojure.data/diff`."
  :feature :advanced-permissions
  [changes]
  (log/debug "Permissions updated, deleting unneeded Connection Impersonations...")
  (when-let [pairs (not-empty
                    (into []
                          (for [group-id    (set (keys changes))
                                :let        [group-changes (get changes group-id)]
                                :let        [_ (log/debugf "Deleting unneeded Connection Impersonation policies for Group %d. Graph changes: %s"
                                                           group-id (pr-str group-changes))]
                                database-id (set (keys group-changes))
                                :let        [data-perm-changes (get-in group-changes [database-id :view-data])]
                                :when       data-perm-changes
                                :let        [pair (unneeded-impersonation-pair group-id database-id data-perm-changes)]
                                :when       pair]
                            pair)))]
    (delete-connection-impersonations! (impersonation.db/impersonation-ids-for-groups-and-databases pairs)))
  (log/debug "Done deleting unneeded Connection Impersonations."))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ConnectionImpersonation [_model]
  {:skip? false})
