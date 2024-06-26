(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.user :as user]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- enforce-sandbox?
  "Takes all the group-ids a user belongs to and a sandbox, and determines whether the sandbox should be enforced for the user.
  This is done by checking whether any *other* group provides `:unrestricted` access to the sandboxed table (without
  its own sandbox). If so, we don't enforce the sandbox."
  [user-group-ids group-id->sandboxes {:as _sandbox :keys [table_id] {:keys [db_id]} :table}]
  ;; If any *other* non-sandboxed groups the user is in provide unrestricted view-data access to the table, we don't
  ;; enforce the sandbox.
  (let [groups-to-exclude
        ;; Don't check permissions of other groups which also define sandboxes on the relevant table. The fact that
        ;; there is a conflict between sandboxes will cause a QP error later on when trying to run queries, so this
        ;; isn't a valid sandboxing state anyway.
        (reduce-kv (fn [excluded-group-ids group-id sandboxes]
                     (if (some #(= (:table_id %) table_id) sandboxes)
                       (conj excluded-group-ids group-id)
                       excluded-group-ids))
                   #{}
                   group-id->sandboxes)]
    (not (data-perms/groups-have-permission-for-table? (set/difference user-group-ids groups-to-exclude)
                                                       :perms/view-data
                                                       :unrestricted
                                                       db_id
                                                       table_id))))

(defn enforced-sandboxes-for
  "Given a user-id, return the sandboxes that should be enforced for the current user. A sandbox is not enforced if the
  user is in a different permissions group that grants full access to the table."
  [user-id]
  (let [user-group-ids           (user/group-ids user-id)
        sandboxes-with-group-ids (t2/hydrate
                                  (t2/select :model/GroupTableAccessPolicy
                                             {:select [[:pgm.group_id :group_id]
                                                       [:s.*]]
                                              :from [[:permissions_group_membership :pgm]]
                                              :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
                                              :where [:= :pgm.user_id user-id]})
                                  :table)
        group-id->sandboxes (->> sandboxes-with-group-ids
                                 (group-by :group_id)
                                 (m/map-vals (fn [sandboxes]
                                               (->> sandboxes
                                                    (filter :table_id)
                                                    (into #{})))))]
    (filter #(enforce-sandbox? user-group-ids group-id->sandboxes %)
            (reduce set/union #{} (vals group-id->sandboxes)))))

(defenterprise sandboxed-user?
  "Returns true if the currently logged in user has segmented permissions. Throws an exception if no current user
  is bound."
  :feature :sandboxes
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (seq (enforced-sandboxes-for *current-user-id*))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
