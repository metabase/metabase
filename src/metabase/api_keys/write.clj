(ns metabase.api-keys.write
  "The write functions of ApiKeys, through which every writer updates and deletes them."
  (:require
   [malli.error :as me]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn validate-with-schema
  "Throws unless `api-key` fits `schema`, returning it; for inserts and updates."
  [api-key schema]
  (when-let [error (mr/explain schema api-key)]
    (let [humanized (me/humanize error)]
      (throw (ex-info (format "Invalid API Key: %s" (pr-str humanized))
                      {:error    humanized
                       :original error}))))
  api-key)

(defn- changed
  "The columns of `changes` whose values differ from those of `api-key`."
  [api-key changes]
  (into {} (remove (fn [[k v]] (= v (get api-key k)))) changes))

(defn- update-user!
  "Apply `changes` to `user`, a loaded User, through the User write function."
  [user changes]
  ((:update! (mi/write-fns :model/User)) user changes {}))

(defn- update-key-user!
  "Rename the User of `api-key` after a new `:name` and move it to a new group, as `changes` ask."
  [{user-id :user_id} changes]
  (when-let [new-name (:name changes)]
    (when-let [user (api-keys.db/api-key-user user-id)]
      (update-user! user {:first_name new-name :last_name ""})))
  (when-let [new-group-id (::api-keys/group-id changes)]
    (assert (= (api-keys.db/user-type user-id) :api-key)
            "Cannot change the Permissions Group for the user associated with an API key that was not created alongside it")
    (user/set-permissions-groups! user-id [(perms/all-users-group) {:id new-group-id}])))

(mu/defn update-api-key! :- :int
  "Apply `changes` to `api-key-or-id`, an ApiKey the caller already loaded or the id of one, renaming the User created
  for it and moving it to a new group as they ask, and publish its update event, returning the number of keys updated;
  for the REST API."
  [api-key-or-id :- [:or ms/PositiveInt :map]
   changes       :- ::api-keys.schema/api-key.changes
   _opts         :- ::api-keys.schema/write-opts]
  (let [api-key (if (map? api-key-or-id) api-key-or-id (api-keys.db/api-key api-key-or-id))
        changes (when api-key (changed api-key changes))]
    (if (empty? changes)
      0
      (events/with-batched-events
        (update-key-user! api-key changes)
        (let [columns (dissoc changes ::api-keys/group-id)
              _       (validate-with-schema (merge api-key columns) ::api-keys.schema/api-key.update)
              columns (assoc columns :updated_at (mi/now))]
          (u/prog1 (api-keys.db/update-api-key! (:id api-key) columns)
            (events/updated! :model/ApiKey (merge api-key changes columns) api-key)))))))

(defn- deactivate-key-users!
  "Deactivate the Users created for `api-keys`, the keys of the other kinds having none."
  [api-keys]
  (doseq [{user-id :user_id} api-keys
          :let  [user (some-> user-id api-keys.db/api-key-user)]
          :when user]
    (update-user! user {:is_active false})))

(mu/defn delete-api-keys! :- :int
  "Delete the ApiKeys with `ids`, deactivating the Users created for them, and publish their delete events, returning
  the number deleted; for the REST API and SCIM."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::api-keys.schema/write-opts]
  (let [api-keys (when (seq ids) (api-keys.db/api-keys ids))]
    (if (empty? api-keys)
      0
      (events/with-batched-events
        (events/deleting! :model/ApiKey api-keys
                          (fn []
                            (deactivate-key-users! api-keys)
                            (api-keys.db/delete-api-keys! (mapv :id api-keys))))))))

(mu/defn delete-api-key! :- :int
  "Delete the ApiKey with `id`, deactivating the User created for it, and publish its delete event."
  [id   :- ms/PositiveInt
   opts :- ::api-keys.schema/write-opts]
  (delete-api-keys! [id] opts))

(defmethod mi/write-fns :model/ApiKey
  [_model]
  {:update! update-api-key!
   :delete! delete-api-keys!})
