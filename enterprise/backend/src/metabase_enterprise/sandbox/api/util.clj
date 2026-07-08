(ns metabase-enterprise.sandbox.api.util
  "Enterprise specific API utility functions"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id* *is-superuser?*]]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
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
      (not (perms/groups-have-permission-for-table? groups-to-check
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
  ;; This needs to be `:none` because we need to be able to decide whether sandboxing is *configured* for a user, even
  ;; if the feature isn't actually available to be enforced. (This way, we can block all requests that *would
  ;; otherwise be* sandboxed when sandboxing is turned off.)
  :feature :none
  [user-id]
  (when user-id
    (let [user-group-ids           (user/group-ids user-id)
          sandboxes-with-group-ids (t2/hydrate
                                    (t2/select :model/Sandbox
                                               {:select [[:pgm.group_id :group_id]
                                                         [:s.*]]
                                                :from [[:permissions_group_membership :pgm]]
                                                :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
                                                :where [:and
                                                        [:= :pgm.user_id user-id]]})
                                    :table)

          impersonations-with-group-ids (when (seq user-group-ids)
                                          (t2/select :model/ConnectionImpersonation
                                                     :group_id [:in user-group-ids]))
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
  (when-not *is-superuser?*
    (let [enforced-sandboxes-for-user (perms/sandboxes-for-user)]
      (filter #((set table-ids) (:table_id %)) enforced-sandboxes-for-user))))

(defn sandboxed-user-for-db?
  "Returns true if the currently logged in user has any enforced sandboxes for the provided database. Throws an
  exception if no current user is bound."
  [database-id]
  (when-not *is-superuser?*
    (if *current-user-id*
      (let [sandboxes (t2/hydrate (seq (perms/sandboxes-for-user)) :table)]
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
       (seq (perms/sandboxes-for-user))
       ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
       ;; returning `false` for users who should actually be sandboxes.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))

(defenterprise any-enforced-sandbox?
  "Like `sandboxed-user?`, but gated `:feature :none` so it fails CLOSED on a lost/expired token: the router would
  otherwise fall back to the OSS body (`false`) and, at a *restriction decision point*, downgrade a sandboxed user
  to unrestricted. `enforced-sandboxes-for-user` is `:none` for the same reason, so the per-request sandbox cache
  this reads is populated regardless of token state.

  Use this (not `sandboxed-user?`) where a `false` result relaxes a restriction — e.g. read_resource's Dashboard
  MBR redaction gate. Throws if no current user is bound."
  :feature :none
  []
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (seq (perms/sandboxes-for-user))
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))

(defenterprise card-query-touches-sandboxed-table?
  "True when the current user has an enforced sandbox that could redact `card`'s query. Superusers are never sandboxed.

  Reads the per-request sandbox cache, so it only filters inside a request context. Throws a 403 if no current user is
  bound (and the user isn't a superuser) — matching `sandboxed-user-for-db?` / `sandboxed-user?`, so a missing binding
  fails CLOSED rather than silently exposing the query.

  Expects a persisted `card` whose `:dataset_query` is already normalized to pMBQL (as loaded from the app DB via
  Toucan's `:out` transform). `lib/all-source-table-ids` has a pMBQL input schema and will throw under Malli
  instrumentation if handed a raw legacy `{:type :query ...}` map — don't call this with a hand-built legacy query.

  Three detection modes:
  - Fully enumerable MBQL: `lib/all-source-table-ids` yields the structural source tables and the query has no
    `:source-card` / `:metric` / template-tag card refs — check for an enforced sandbox on any of those tables.
  - Card/metric/native refs: `lib/all-source-table-ids` can't see through a `:source-card` (or `:metric`, or a
    native template-tag card), so its table set is incomplete. Rather than resolve those cards recursively we
    over-approximate: gate on any enforced sandbox in the card's database. Native queries land here too (no source
    tables at all).
  - No database: fail CLOSED (treat as sandboxed) rather than expose the query.

  Gated with `:feature :none` (not `:sandboxes`) because this is a restriction *decision point*: when the token is
  lost or expired the router falls back to the OSS body (which returns `false`), and a `false` here would silently
  emit an unredacted card MBR to a sandboxed user. `enforced-sandboxes-for-user` is `:none` for the same reason, so
  the per-request sandbox cache is populated regardless of token state."
  :feature :none
  [card]
  (boolean
   (when-not *is-superuser?*
     (if *current-user-id*
       (let [query      (some-> card :dataset_query not-empty)
             table-ids  (some-> query lib/all-source-table-ids not-empty)
             card-refs? (boolean (some-> query lib/all-source-card-ids seq))]
         (cond
           ;; A directly-referenced source table is sandboxed.
           (seq (enforced-sandboxes-for-tables table-ids)) true
           ;; Fully enumerable: only real source tables, none sandboxed.
           (and table-ids (not card-refs?))                false
           ;; Card/metric/native refs we can't enumerate: gate on any sandbox in the card's db.
           :else                                           (if-let [db-id (:database_id card)]
                                                             (boolean (sandboxed-user-for-db? db-id))
                                                             true)))
       ;; No *current-user-id* bound: can't check sandboxes, so throw rather than return false for a user who may be sandboxed.
       (throw (ex-info (str (tru "No current user found"))
                       {:status-code 403}))))))
