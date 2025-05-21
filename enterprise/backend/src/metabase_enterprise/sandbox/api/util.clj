(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.users.models.user :as user]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- enforce-sandbox?
  "Takes all the group-ids a user belongs to and a sandbox, and determines whether the sandbox should be enforced for the user.
  This is done by checking whether any *other* group provides `:unrestricted` access to the sandboxed table (without
  its own sandbox). If so, we don't enforce the sandbox."
  [{:as _sandbox :keys [table_id] {:keys [db_id]} :table} user-group-ids group-id->sandboxes group-id->impersonations]
  ;; If any *other* non-sandboxed groups the user is in provide unrestricted view-data access to the table, we don't
  ;; enforce the sandbox.
  (let [sandboxed-groups (into #{} (for [[group-id sandboxes] group-id->sandboxes
                                         :when (some #(= (:table_id %) table_id) sandboxes)]
                                     group-id))
        impersonated-groups (into #{} (for [[group-id impersonations] group-id->impersonations
                                            :when (some #(= (:db_id %) db_id) impersonations)]
                                        group-id))
        groups-to-exclude (set/union sandboxed-groups impersonated-groups)
        groups-to-check (set/difference user-group-ids groups-to-exclude)]
    (if (seq groups-to-check)
      (not (data-perms/groups-have-permission-for-table? groups-to-check
                                                         :perms/view-data
                                                         :unrestricted
                                                         db_id
                                                         table_id))
      true)))

(defenterprise enforced-sandboxes-for-user
  "Given a user-id, returns the set of sandboxes that should be enforced for the provided user ID. This result is cached
  for the duration of a request in [[metabase.permissions.models.data-permissions/*sandboxes-for-user*]].

  WARNING: This should NOT be used directly for sandboxing enforcement. Use `*sandboxes-for-user*` or
  `enforced-sandboxes-for-tables` below, so that the cache is used."
  :feature :sandboxes
  [user-id]
  (when user-id
    (let [user-group-ids           (user/group-ids user-id)
          sandboxes-with-group-ids (t2/hydrate
                                    (t2/select :model/GroupTableAccessPolicy
                                               {:select [[:pgm.group_id :group_id]
                                                         [:s.*]]
                                                :from [[:permissions_group_membership :pgm]]
                                                :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
                                                :where [:and
                                                        [:= :pgm.user_id user-id]]})
                                    :table)

          impersonations-with-group-ids (t2/select :model/ConnectionImpersonation
                                                   :group_id [:in user-group-ids])
          group-id->impersonations (->> impersonations-with-group-ids
                                        (group-by :group_id))
          group-id->sandboxes (->> sandboxes-with-group-ids
                                   (group-by :group_id)
                                   (m/map-vals (fn [sandboxes]
                                                 (->> sandboxes
                                                      (filter :table_id)
                                                      (into #{})))))]
      (filter #(enforce-sandbox? % user-group-ids group-id->sandboxes group-id->impersonations)
              (reduce set/union #{} (vals group-id->sandboxes))))))

(defn enforced-sandboxes-for-tables
  "Given collection of table-ids, return the sandboxes that should be enforced for the current user on any of the tables. A
  sandbox is not enforced if the user is in a different permissions group that grants full access to the table."
  [table-ids]
  (let [enforced-sandboxes-for-user @data-perms/*sandboxes-for-user*]
    (filter #((set table-ids) (:table_id %)) enforced-sandboxes-for-user)))

(defn sandboxed-user-for-db?
  "Returns true if the currently logged in user has any enforced sandboxes for the provided database. Throws an
  exception if no current user is bound."
  [database-id]
  (when-not *is-superuser?*
    (if *current-user-id*
      (let [sandboxes (t2/hydrate (seq @data-perms/*sandboxes-for-user*) :table)]
        (some #(= (get-in % [:table :db_id]) database-id)
              sandboxes))
     ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
     ;; returning `false` for users who should actually be sandboxes.
      (throw (ex-info (str (tru "No current user found"))
                      {:status-code 403})))))

(defenterprise sandboxed-user?
  "Returns true if the currently logged in user has any enforced sandboxes. Throws an exception if no current user is
  bound."
  :feature :sandboxes
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (seq @data-perms/*sandboxes-for-user*)
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
