(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.sandbox.db :as sandbox.db]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.users.models.user :as user]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- groups-to-check
  "The groups of `user-group-ids` whose access can lift `sandbox`: those with neither a sandbox on its Table nor an
  impersonation on its Database."
  [{:as _sandbox :keys [table_id] {:keys [db_id]} :table} user-group-ids group-id->sandboxes group-id->impersonations]
  (let [sandboxed-groups    (into #{} (for [[group-id sandboxes] group-id->sandboxes
                                            :when (some #(= (:table_id %) table_id) sandboxes)]
                                        group-id))
        impersonated-groups (into #{} (for [[group-id impersonations] group-id->impersonations
                                            :when (some #(= (:db_id %) db_id) impersonations)]
                                        group-id))]
    (set/difference user-group-ids (set/union sandboxed-groups impersonated-groups))))

(defn- enforced-sandboxes
  "Those of `sandboxes` to enforce for a user in the groups `user-group-ids`: each whose groups to check give no
  `:unrestricted` view-data access to its Table, read for all of them at once."
  [sandboxes user-group-ids group-id->sandboxes group-id->impersonations]
  (let [sandbox->groups (into {} (map (juxt identity #(groups-to-check % user-group-ids group-id->sandboxes
                                                                       group-id->impersonations)))
                              sandboxes)
        pairs           (into [] (comp (mapcat (fn [[{:keys [table_id]} groups]] (map (fn [g] [g table_id]) groups)))
                                       (distinct))
                              sandbox->groups)
        pair->value     (perms/group-table-permissions pairs :perms/view-data
                                                       (into {} (map (juxt :table_id (comp :db_id :table))) sandboxes))
        unrestricted?   (fn [pair]
                          (perms/at-least-as-permissive? :perms/view-data (get pair->value pair) :unrestricted))]
    (filter (fn [{:keys [table_id] :as sandbox}]
              (not-any? #(unrestricted? [% table_id]) (sandbox->groups sandbox)))
            sandboxes)))

(defenterprise enforced-sandboxes-for-user
  "Given a user-id, returns the set of sandboxes that should be enforced for the provided user ID. This result is cached
  for the duration of a request in [[metabase.permissions.data-permissions/*sandboxes-for-user*]].

  WARNING: This should NOT be used directly for sandboxing enforcement. Use `*sandboxes-for-user*` or
  `enforced-sandboxes-for-tables` below, so that the cache is used."
  ;; This needs to be `:none` because we need to be able to decide whether sandboxing is *configured* for a user, even
  ;; if the feature isn't actually available to be enforced. (This way, we can block all requests that *would
  ;; otherwise be* sandboxed when sandboxing is turned off.)
  :feature :none
  [user-id]
  (when user-id
    (let [user-group-ids           (user/group-ids user-id)
          sandboxes-with-group-ids (t2/hydrate (sandbox.db/user-sandboxes-with-group-ids user-id) :table)

          impersonations-with-group-ids (when (seq user-group-ids)
                                          (sandbox.db/impersonations-for-groups user-group-ids))
          group-id->impersonations (->> impersonations-with-group-ids
                                        (group-by :group_id))
          group-id->sandboxes (->> sandboxes-with-group-ids
                                   (group-by :group_id)
                                   (m/map-vals (fn [sandboxes]
                                                 (->> sandboxes
                                                      (filter :table_id)
                                                      (into #{})))))]
      (enforced-sandboxes (reduce set/union #{} (vals group-id->sandboxes))
                          user-group-ids group-id->sandboxes group-id->impersonations))))

(defn enforced-sandboxes-for-tables
  "Given collection of table-ids, return the sandboxes that should be enforced for the current user on any of the tables. A
  sandbox is not enforced if the user is in a different permissions group that grants full access to the table."
  [table-ids]
  (when-not *is-superuser?*
    (let [enforced-sandboxes-for-user (perms/sandboxes-for-user)]
      (filter #((set table-ids) (:table_id %)) enforced-sandboxes-for-user))))

(defenterprise sandboxed-user-for-db?
  "Returns true if the currently logged in user has any enforced sandboxes for the provided database. Throws an
  exception if no current user is bound. Uses `:feature :none` so callers can recognize a sandboxed user even when
  the `:sandboxes` feature is temporarily unavailable (e.g. during a transient token-check failure) and fail closed
  instead of leaking data."
  :feature :none
  [database-id]
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (let [sandboxes (t2/hydrate (seq (perms/sandboxes-for-user)) :table)]
         (some #(= (get-in % [:table :db_id]) database-id)
               sandboxes))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))

(defenterprise sandboxed-user?
  "Returns true if the currently logged in user has any enforced sandboxes. Throws an exception if no current user is
  bound. Uses `:feature :none` so callers can recognize a sandboxed user even when the `:sandboxes` feature is
  temporarily unavailable (e.g. during a transient token-check failure) and fail closed instead of leaking data."
  :feature :none
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (seq (perms/sandboxes-for-user))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
