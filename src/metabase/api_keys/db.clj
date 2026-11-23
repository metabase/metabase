(ns metabase.api-keys.db
  "Application database queries for the API keys module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private admin-listed
  "The ApiKeys an admin lists and manages through the API keys endpoints: unscoped keys and `:workspace-manager` keys.
  SCIM keys are managed by the SCIM endpoints."
  [:or [:= :scope nil] [:= :scope "workspace-manager"]])

(mu/defn admin-listed-api-key-count
  "The number of ApiKeys without a scope or with the `:workspace-manager` scope."
  []
  (t2/count :model/ApiKey {:where admin-listed}))

(mu/defn admin-listed-api-keys
  "The ApiKeys without a scope or with the `:workspace-manager` scope, most recently used first (nulls last — a key
  never used sorts after every key that has been)."
  []
  (t2/select :model/ApiKey
             {:where    admin-listed
              :order-by [[:last_used_at (case (mdb/db-type)
                                          ;; NULLS LAST isn't valid MySQL syntax, but MySQL already sorts
                                          ;; NULLs last on DESC by default (it treats NULL as the lowest value).
                                          (:postgres :h2) :desc-nulls-last
                                          :mysql          :desc)]]}))

(mu/defn api-key
  "The ApiKey with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/ApiKey :id [:auto/param id]))

(mu/defn api-key-exists?
  "Whether an ApiKey with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/ApiKey :id id))

(mu/defn api-keys-by-ids
  "The ApiKeys with `ids`."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select :model/ApiKey :id [:in ids]))

(mu/defn api-key-ids-with-scope :- [:sequential ms/PositiveInt]
  "The ids of the ApiKeys with `scope`."
  [scope :- ::api-keys.schema/scope]
  (vec (t2/select-pks-vec :model/ApiKey :scope scope)))

(mu/defn delete-api-keys!
  "Delete the ApiKeys with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/ApiKey :id [:in ids]))

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

(mu/defn user-type
  "The `:type` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :type :model/User :id user-id))

(mu/defn user-types :- [:map-of ::lib.schema.id/user :keyword]
  "The map from id to `:type` of the Users with `user-ids`."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]]
  (into {} (map (juxt :id :type)) (t2/select [:model/User :id :type] :id [:in user-ids])))

(mu/defn api-key-prefix-exists?
  "Whether an ApiKey with `prefix` exists."
  [prefix :- :string]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(mu/defn api-key-name-exists?
  "Whether an ApiKey named `key-name` exists."
  [key-name :- :string]
  (t2/exists? :model/ApiKey :name key-name))

(mu/defn insert-api-key-usage-logs!
  "Insert the ApiKeyUsageLog `rows` as one batch."
  [rows :- [:sequential ::api-keys.schema/api-key-usage-log.create]]
  (t2/insert! :model/ApiKeyUsageLog rows))

(mu/defn api-key-usage-log-ids-occurred-before :- [:sequential ms/PositiveInt]
  "The ids of the ApiKeyUsageLogs whose `occurred_at` is before `cutoff`."
  [cutoff :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (vec (t2/select-pks-vec :model/ApiKeyUsageLog {:where [:< :occurred_at [:auto/param cutoff]]})))

(mu/defn delete-api-key-usage-logs!
  "Delete the ApiKeyUsageLogs with `ids`, returning the number deleted."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/delete! :model/ApiKeyUsageLog :id [:in ids]))

(mu/defn insert-api-keys! :- [:sequential ::api-keys.schema/api-key]
  "Insert the ApiKey `rows` in one statement and return the inserted instances in their order."
  [rows :- [:sequential ::api-keys.schema/api-key.create]]
  (mdb/insert-returning-instances! :model/ApiKey rows))

(mr/def ::api-key-columns.update
  [:map {:closed true}
   [:name          {:optional true} ::api-keys.schema/name]
   [:key           {:optional true} [:ref ::api-keys.schema/key.hashed]]
   [:key_prefix    {:optional true} [:ref ::api-keys.schema/prefix]]
   [:updated_by_id {:optional true} pos-int?]
   [:updated_at    {:optional true} [:ref ::api-keys.schema/timestamp]]])

(mu/defn update-api-keys!
  "Apply `changes` to the ApiKeys with `ids` in one statement."
  [ids     :- [:sequential {:min 1} ms/PositiveInt]
   changes :- ::api-key-columns.update]
  (t2/update! :model/ApiKey :id [:in [:auto/param (vec ids)]] changes))

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
  row — the caller should retry those on its next pass rather than wait for them here. A deleted key's
  id is dropped rather than retried: it never comes back from [[lock-available-key-ids]], but it is
  gone for good, not merely busy, so retrying it on every flush would never succeed.

  Locks the rows first with `SELECT ... FOR UPDATE SKIP LOCKED` (outside H2) so a key a concurrent
  writer is editing (e.g. an admin renaming or rotating it) is skipped rather than blocking this
  UPDATE — and, by extension, every unrelated key batched alongside it — until that writer's
  transaction commits.

  A plain UPDATE rather than [[update-api-key!]] on purpose: a write through the model
  publishes `:event/api-key-update`, which the audit log records, and a usage stamp must not do that.
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
      (select-keys id->timestamp
                   (when-let [busy (seq (remove (set available-ids) (keys id->timestamp)))]
                     (t2/select-pks-set :model/ApiKey :id [:in busy]))))))
