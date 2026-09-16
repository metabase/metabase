(ns metabase.api-keys.db
  "Application database queries for the API keys module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn unscoped-api-key-count
  "The number of ApiKeys without a scope."
  []
  (t2/count :model/ApiKey :scope nil))

(mu/defn unscoped-api-keys
  "The ApiKeys without a scope."
  []
  (t2/select :model/ApiKey :scope nil))

(mu/defn api-key
  "The ApiKey with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/ApiKey id))

(def ^:private ApiKeyWithGroupId
  "An ApiKey instance possibly carrying the `::api-keys/group-id` the before-update hook consumes."
  (mut/merge ::api-keys.schema/api-key
             [:map
              [:metabase.api-keys.core/group-id {:optional true} [:maybe ms/PositiveInt]]]))

(mu/defn save-api-key!
  "Save the changes made to the ApiKey instance `api-key` and return it."
  [api-key :- ApiKeyWithGroupId]
  (t2/save! api-key))

(mu/defn api-key-exists?
  "Whether an ApiKey with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/ApiKey id))

(mu/defn delete-api-key!
  "Delete the ApiKey with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/ApiKey id))

(mu/defn api-key-groups
  "The group name, group id, and api key id of the PermissionsGroups of the ApiKeys with `api-key-ids`."
  [api-key-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select [[:pg.name :group-name]
                      [:pg.id :group-id]
                      [:api_key.id :api-key-id]]
             :from   [[:permissions_group :pg]]
             :join   [[:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]
                      :api_key [:= :api_key.user_id :pgm.user_id]]
             :where  [:in :api_key.id api-key-ids]}))

(mu/defn rename-api-key-user!
  "Set the first name (and clear the last name) of the api-key User with `user-id`."
  [user-id    :- ::lib.schema.id/user
   first-name :- :string]
  (t2/update! :model/User :id user-id, :type :api-key, {:first_name first-name, :last_name ""}))

(mu/defn user-type
  "The `:type` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :type :model/User :id user-id))

(mu/defn deactivate-api-key-user!
  "Deactivate the api-key User with `user-id` (nil for keys without a user, e.g. SCIM keys, which updates nothing)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/update! :model/User user-id, :type :api-key, {:is_active false}))

(mu/defn api-key-prefix-exists?
  "Whether an ApiKey with `prefix` exists."
  [prefix :- :string]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(mu/defn api-key-name-exists?
  "Whether an ApiKey named `key-name` exists."
  [key-name :- :string]
  (t2/exists? :model/ApiKey :name key-name))

(mu/defn insert-user!
  "Insert the User `row` and return its id."
  [row :- ::users.schema/user.update]
  (t2/insert-returning-pk! :model/User row))

(mu/defn insert-api-key!
  "Insert the ApiKey `row` and return the inserted instance."
  [row :- ::api-keys.schema/api-key.create]
  (t2/insert-returning-instance! :model/ApiKey row))

(mu/defn update-api-key!
  "Apply `changes` to the ApiKey with `id`."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::api-keys.schema/api-key.update [:key :key_prefix :updated_by_id])]
  (t2/update! :model/ApiKey :id id changes))

(defn lock-available-key-ids
  "The subset of `ids` not currently locked by another writer, locked for update (`SKIP LOCKED` outside
  H2, whose single-connection test usage neither needs nor supports it). Public so tests can simulate a
  busy row by redefining it, without real cross-connection lock contention."
  [ids]
  (map :id (t2/query (cond-> {:select [:id]
                              :from   [(t2/table-name :model/ApiKey)]
                              :where  [:in :id ids]}
                       (not= :h2 (mdb/db-type)) (assoc :for [:update :skip-locked])))))

(defn update-api-keys-last-used-at!
  "Move `last_used_at` of each ApiKey in `id->timestamp` forward to its timestamp, without touching
  `updated_at`. Returns the subset of `id->timestamp` that was skipped because another writer held the
  row — the caller should retry those on its next pass rather than wait for them here.

  Locks the rows first with `SELECT ... FOR UPDATE SKIP LOCKED` (outside H2) so a key a concurrent
  writer is editing (e.g. an admin renaming or rotating it) is skipped rather than blocking this
  UPDATE — and, by extension, every unrelated key batched alongside it — until that writer's
  transaction commits.

  A plain UPDATE rather than [[update-api-key!]] on purpose: the model's `before-update` hook hydrates
  the key and publishes an `:event/api-key-update` audit event, which a usage stamp must not do.
  Mirrors [[metabase.query-processor.db/update-cards-last-used-at!]]'s bulk `CASE`/`GREATEST` pattern
  for the same reason: many keys land in one batch, and this is one UPDATE for all of them rather than
  one per key."
  [id->timestamp]
  (t2/with-transaction [_conn]
    (let [available-ids (lock-available-key-ids (keys id->timestamp))]
      (when (seq available-ids)
        (t2/query {:update [(t2/table-name :model/ApiKey)]
                   :where  [:in :id available-ids]
                   :set    {:last_used_at (into [:case]
                                                (mapcat (fn [id]
                                                          [[:= :id id]
                                                           [:greatest [:coalesce :last_used_at (t/offset-date-time 0)]
                                                            (get id->timestamp id)]])
                                                        available-ids))
                            :updated_at :updated_at}}))
      (apply dissoc id->timestamp available-ids))))
