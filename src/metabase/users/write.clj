(ns metabase.users.write
  "The write functions of Users, through which every writer updates and deletes them."
  (:require
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn validate-user-email!
  "Validate that the email is in a valid format."
  [email]
  (assert (u/email? email) (tru "Invalid email: {0}" (pr-str email))))

(defn validate-user-locale!
  "Validate that the locale is available in the system."
  [locale]
  (when locale
    (assert (i18n/available-locale? locale) (tru "Invalid locale: {0}" (pr-str locale)))))

(defn check-superuser-has-no-tenant
  "Throws a 400 when `user` is both a superuser and a tenant user."
  [{superuser? :is_superuser tenant-id :tenant_id}]
  (when (and superuser? tenant-id)
    (throw (ex-info (tru "Superusers cannot be tenant users") {:status-code 400}))))

(defn without-credential-fields
  "`user` without the legacy password and reset-token columns, which live in the user's AuthIdentities and are never
  written to `core_user`."
  [user]
  (dissoc user :password :password_salt :reset_token :reset_triggered))

(defn normalize-user-fields
  "`user` with its email lower-cased and its locale normalized for storage."
  [user]
  (cond-> user
    (:email user)  (update :email u/lower-case-en)
    (:locale user) (update :locale i18n/normalized-locale-string)))

(defn- changed
  "The columns of `changes` whose values differ from those of `user`."
  [user changes]
  (into {} (remove (fn [[k v]] (= v (get user k)))) changes))

(defn- in-admin-group?
  "Whether the User with `id` is a member of the Admin group."
  [id]
  (users.db/group-membership-exists? (:id (perms/admin-group)) id))

(defn- check-changes
  "Throws unless `changes`, the changed columns of `user`, are an update a User allows, with `admin?` answering whether
  `user` is in the Admin group."
  [user changes admin?]
  (when (= (:id user) config/internal-mb-user-id)
    (throw (ex-info (tru "Not able to modify the internal user") {:status-code 400})))
  (when (:is_superuser changes)
    (check-superuser-has-no-tenant (merge user changes)))
  (when (and (false? (:is_active changes)) (admin?))
    (perms/throw-if-last-admin! (:id user)))
  (when-let [email (:email changes)]
    (validate-user-email! email))
  (when-let [locale (:locale changes)]
    (validate-user-locale! locale)))

(defn- sync-admin-group!
  "Add the User with `id` to the Admin group or remove them from it when `superuser?`, the new `is_superuser`, differs
  from `admin?`, the membership; the User's update writes the flag itself."
  [id superuser? admin?]
  (cond
    (and superuser? (not (admin?)))
    (perms/add-user-to-group! id (u/the-id (perms/admin-group)) false {:skip-superuser-sync? true})

    (and (false? superuser?) (admin?))
    (perms/remove-user-from-group! id (u/the-id (perms/admin-group)) {:skip-superuser-sync? true})))

(defn- with-derived-columns
  "`changes` normalized for storage, with the deactivation time that follows `is_active` and the time of the update."
  [changes]
  (cond-> (normalize-user-fields changes)
    (true? (:is_active changes))          (assoc :deactivated_at nil)
    (false? (:is_active changes))         (assoc :deactivated_at :%now)
    (not (contains? changes :updated_at)) (assoc :updated_at (mi/now))))

(defn- prepare-user-update!
  "Check `changes` to `user`, keep its Admin-group membership in step with `is_superuser` unless `opts` say the caller
  does and remove the subscriptions of a deactivated User, returning the columns the UPDATE of `user` writes, or nil
  when `changes` change nothing."
  [user changes opts]
  (let [changes (changed user (without-credential-fields changes))]
    (when (seq changes)
      (let [id     (:id user)
            admin? (memoize #(in-admin-group? id))]
        (check-changes user changes admin?)
        (when-not (:skip-admin-group-sync? opts)
          (sync-admin-group! id (:is_superuser changes) admin?))
        (when (false? (:is_active changes))
          (binding [api/*current-user-id* nil]
            ((:delete! (mi/write-fns :model/PulseChannelRecipient))
             (users.db/pulse-channel-recipient-ids-for-user id)
             {})))
        (changed user (with-derived-columns changes))))))

(defn- write-user-updates!
  "Apply `changes` to `users`, loaded Users, as [[prepare-user-update!]] prepares each, in one statement for those the
  changes update alike, and publish their update events, returning the number of Users updated."
  [users changes opts]
  (events/with-batched-events
    (let [plans (into [] (keep (fn [user] (when-let [final (prepare-user-update! user changes opts)] [user final]))) users)]
      (doseq [[final group] (group-by second plans)]
        (users.db/update-users! (mapv (comp :id first) group) final)
        (doseq [[user _] group]
          (events/updated! :model/User (merge user final) user)))
      (count plans))))

(mu/defn update-user! :- :int
  "Apply `changes` to `user-or-id`, a User the caller already loaded or the id of one, keeping its Admin-group
  membership in step with `is_superuser` unless `opts` say the caller does, removing a deactivated User's subscriptions,
  and publish its update event, returning the number of Users updated; for every writer of a User."
  ([user-or-id :- [:or ::lib.schema.id/user :map]
    changes    :- ::users.schema/user.changes]
   (update-user! user-or-id changes {}))
  ([user-or-id :- [:or ::lib.schema.id/user :map]
    changes    :- ::users.schema/user.changes
    opts       :- ::users.schema/write-opts]
   (let [user (if (map? user-or-id) user-or-id (users.db/user-row user-or-id))]
     (if (and user (seq (changed user (without-credential-fields changes))))
       (write-user-updates! [user] changes opts)
       0))))

(mu/defn update-users! :- :int
  "Apply `changes` to the Users with `ids` as [[update-user!]] does, in one statement for those the changes update
  alike, returning the number updated; for the writers that deactivate and reactivate the Users of a tenant."
  [ids     :- [:maybe [:sequential ::lib.schema.id/user]]
   changes :- ::users.schema/user.changes
   opts    :- ::users.schema/write-opts]
  (if (empty? ids)
    0
    (write-user-updates! (users.db/user-rows ids) changes opts)))

(mu/defn delete-users! :- :int
  "Delete the Users with `ids` and publish their delete events, returning the number deleted."
  [ids   :- [:maybe [:sequential ::lib.schema.id/user]]
   _opts :- ::users.schema/write-opts]
  (let [users (when (seq ids) (users.db/user-rows ids))]
    (if (empty? users)
      0
      (events/with-batched-events
        (events/deleting! :model/User users #(users.db/delete-users! (mapv :id users)))))))

(defmethod mi/write-fns :model/User
  [_model]
  {:update! update-user!
   :delete! delete-users!})
