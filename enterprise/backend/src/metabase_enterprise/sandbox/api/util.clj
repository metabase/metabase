(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- enforce-sandbox?
  "Takes all the group-ids a user belongs to and a sandbox, and determines whether the sandbox should be enforced for the user.
  This is done by checking whether any *other* group provides `:unrestricted` access to the sandboxed table (without
  its own sandbox). If so, we don't enforce the sandbox."
  [group-id->sandboxes {:as _sandbox :keys [group_id table_id] {:keys [db_id]} :table}]
  (let [group-id->sandboxes (dissoc group-id->sandboxes group_id)]
    (not-any? (fn [[other-group-id other-group-sandboxes]]
                (and
                 ;; If the user is in another group with data access to the table, and no sandbox defined for it, then
                 ;; we assume this sandbox should not be enforced.
                 (data-perms/group-has-permission-for-table? other-group-id
                                                             :perms/view-data
                                                             :unrestricted
                                                             db_id
                                                             table_id)
                 (not-any? (fn [sandbox] (= (:table_id sandbox) table_id)) other-group-sandboxes)))
              group-id->sandboxes)))

(defn enforced-sandboxes-for
  "Given a user-id, return the sandboxes that should be enforced for the current user. A sandbox is not enforced if the
  user is in a different permissions group that grants full access to the table."
  [user-id]
  (let [sandboxes-with-group-ids (t2/hydrate
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
    (filter #(enforce-sandbox? group-id->sandboxes %) (reduce set/union #{} (vals group-id->sandboxes)))))

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
