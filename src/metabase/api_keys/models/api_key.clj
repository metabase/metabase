(ns metabase.api-keys.models.api-key
  "`:metabase.api-keys.core/group-id` and `:metabase.api-keys.core/unhashed-key` have special meanings when passed to
  various Toucan CRUD methods for `:model/ApiKey`... see below."
  (:require
   [clojure.core.memoize :as memoize]
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.util :as mut]
   [metabase.api-keys.audit :as api-keys.audit]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.password :as u.password]
   [metabase.util.random :as u.random]
   [metabase.util.secret :as u.secret]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ApiKey [_model] :api_key)

(methodical/defmethod t2.hydrate/batched-hydrate [:model/ApiKey :group]
  "Add to each ApiKey a single group. Assume that each ApiKey is a member of either zero or one groups other than the
  'All Users' group."
  [_model _k api-keys]
  (when (seq api-keys)
    (let [api-key-id->permissions-groups
          (group-by :api-key-id
                    (api-keys.db/api-key-groups (map u/the-id api-keys)))
          api-key-id->group
          (fn [api-key-id]
            (let [{name :group-name
                   id   :group-id} (->> (api-key-id->permissions-groups api-key-id)
                                        (sort-by #(= (:group-id %) (u/the-id (perms/all-users-group))))
                                        first)]
              {:name name :id id}))]
      (for [api-key api-keys]
        (assoc api-key :group (api-key-id->group (u/the-id api-key)))))))

(doto :model/ApiKey
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ApiKey
  {:scope mi/transform-keyword
   :key   (mi/transform-encrypted-text "api_key.key")})

(mu/defn- expose :- :string
  ^String [s :- [:or ::u.secret/secret :string]]
  (cond-> s
    (u.secret/secret? s) u.secret/expose))

(mu/defn prefix :- ::api-keys.schema/prefix
  "Given an API key, returns the standardized prefix for that API key."
  ^String [k :- [:or
                 ::api-keys.schema/key.unhashed-or-secret
                 ::api-keys.schema/prefix]]
  (subs (expose k) 0 api-keys.schema/prefix-length))

(def ^:private insert-row-schema
  "A row as the before-insert hook leaves it: every column of `::api-keys.schema/api-key`, those the database fills
  optional."
  (into [:map {:closed true}]
        (map (fn [[k properties schema]]
               (if properties
                 [k
                  (cond-> properties
                    (::api-keys.schema/insert.optional properties) (assoc :optional true))
                  schema]
                 [k schema])))
        (mc/children (mr/resolve-schema ::api-keys.schema/api-key))))

(def ^:private update-row-schema
  "A row as the before-update hook leaves it: every column of `::api-keys.schema/api-key`, all optional."
  (into [:map {:closed true}]
        (map (fn [[k properties schema]]
               [k (assoc properties :optional true) schema]))
        (mc/children (mr/resolve-schema ::api-keys.schema/api-key))))

(def ^:private ApiKeyPipelineRow
  "The shape `add-prefix`/`add-key` receive: a before-insert or before-update `:model/ApiKey` instance, every column
  optional at this stage, plus the two internal keys the CRUD hooks thread through."
  (mut/merge update-row-schema
             [:map {:closed true}
              [::api-keys/unhashed-key {:optional true} ::api-keys.schema/key.unhashed-or-secret]
              [::api-keys/group-id     {:optional true} pos-int?]]))

(mu/defn- add-prefix :- [:map
                         [:key_prefix {:optional true} ::api-keys.schema/prefix]]
  [{unhashed-key ::api-keys/unhashed-key, :as api-key} :- ApiKeyPipelineRow]
  (cond-> api-key
    (contains? api-key ::api-keys/unhashed-key) (assoc :key_prefix (some-> unhashed-key prefix))))

(mu/defn generate-key :- ::api-keys.schema/key.secret
  "Generates a new API key - a random base64 string prefixed with `mb_`"
  []
  (u.secret/secret
   (str "mb_" (u.random/secure-base64 api-keys.schema/generated-bytes-key-length))))

(mu/defn mask :- ::api-keys.schema/key.masked
  "Given an API key, returns a string of the same length with all but the prefix masked with `*`s"
  ^String [k :- [:or
                 ::api-keys.schema/key.unhashed-or-secret
                 ::api-keys.schema/prefix]]
  (let [sb (StringBuilder.)]
    (.append sb (prefix k))
    (dotimes [_ (- api-keys.schema/generated-string-key-length api-keys.schema/prefix-length)]
      (.append sb \*))
    (str sb)))

(mu/defn key-hash-salt :- :string
  "The salt hashed in front of a key with `scope`, and checked in front of it at authentication. A `:workspace-manager`
  key has one. A build from before that scope checks every key with no salt, so it never authenticates such a key and
  never treats it as an unscoped key of its user. Other keys have no salt."
  [scope :- [:maybe ::api-keys.schema/scope]]
  (if (= scope :workspace-manager)
    "workspace-manager:"
    ""))

(mu/defn- hash-bcrypt :- ::api-keys.schema/key.hashed
  [k     :- ::api-keys.schema/key.unhashed-or-secret
   scope :- [:maybe ::api-keys.schema/scope]]
  (u.password/hash-bcrypt (str (key-hash-salt scope) (expose k))))

(mu/defn- add-key
  "Adds the `key` based on the `:metabase.api-keys/unhashed-qkey passed in, salted for the key's `:scope`."
  [{unhashed-key ::api-keys/unhashed-key, :as api-key} :- ApiKeyPipelineRow]
  (-> api-key
      (cond-> (contains? api-key ::api-keys/unhashed-key)
        (assoc :key (some-> unhashed-key (hash-bcrypt (:scope api-key)))))
      (dissoc ::api-keys/unhashed-key)))

(defn- validate-with-schema [api-key schema]
  (when-let [error (mr/explain schema api-key)]
    (let [humanized (me/humanize error)]
      (throw (ex-info (format "Invalid API Key: %s" (pr-str humanized))
                      {:error    humanized
                       :original error}))))
  api-key)

(t2/define-before-insert :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key
      (validate-with-schema insert-row-schema)))

(t2/define-before-update :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key
      (validate-with-schema update-row-schema)))

(defn- add-masked-key [api-key]
  (if-let [prefix (:key_prefix api-key)]
    (assoc api-key :masked_key (mask prefix))
    api-key))

(t2/define-after-select :model/ApiKey
  [api-key]
  (-> api-key
      add-masked-key))

(def ^{:arglists '([user-id])} is-api-key-user?
  "Cached function to determine whether the user with this ID is an API key user"
  (memoize/ttl
   ^{::memoize/args-fn (fn [[user-id]]
                         [(mdb/unique-identifier) user-id])}
   (fn is-api-key-user?*
     [user-id]
     (= :api-key (api-keys.db/user-type user-id)))
   ;; cache the results for 60 minutes; TTL is here only to eventually clear out old entries/keep it from growing too
   ;; large
   :ttl/threshold (* 60 60 1000)))

(mu/defn key-with-unique-prefix :- ::api-keys.schema/key.secret
  "Generate an unique API key with a unique prefix."
  []
  (u/auto-retry 5
    (let [api-key (generate-key)
          prefix (prefix (u.secret/expose api-key))]
      ;; we could make this more efficient by generating 5 API keys up front and doing one select to remove any
      ;; duplicates. But a duplicate should be rare enough to just do multiple queries for now.
      (if-not (api-keys.db/api-key-prefix-exists? prefix)
        api-key
        (throw (ex-info (tru "could not generate key with unique prefix") {}))))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-api-keys! :- [:sequential ::api-keys.schema/api-key]
  "Insert the ApiKey `rows` in one transaction and return them in order, publishing their create event;
  `::api-keys/unhashed-key` is hashed into `:key` and gives `:key_prefix`."
  [rows :- [:sequential ::api-keys.schema/api-key.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [created (into [] (mapcat (comp api-keys.db/insert-api-keys! vec))
                          (partition-all mdb/create-partition-size rows))]
        (events/publish-event! :event/api-key-create (events/create-event created))
        created))))

(mr/def ::write-opts
  [:map {:closed true}
   [:context {:optional true} :metabase.events.schema/context]])

(defn- stored-api-keys
  "The map from id to the stored ApiKey of the rows of `updates`."
  [updates]
  (u/index-by :id (api-keys.db/api-keys-by-ids (mapv :id updates))))

(defn- check-key-group-moves
  "Throw unless every row of `updates` that sets `::api-keys/group-id` satisfies these rules:

  - the User of its key, stored in `stored`, was created alongside the key"
  [stored updates]
  (let [moving   (filterv ::api-keys/group-id updates)
        user-ids (into [] (comp (keep (comp :user_id stored :id)) (distinct)) moving)
        types    (if (seq user-ids) (api-keys.db/user-types user-ids) {})]
    (doseq [{id :id} moving]
      (assert (= (get types (:user_id (stored id))) :api-key)
              "Cannot change the Permissions Group for the user associated with an API key that was not created alongside it"))))

(defn- rename-key-users!
  "Give each User created for a key of `updates`, stored in `stored`, the key's new `:name` when the key is not named
  so already, in one write publishing its events with `opts`."
  [stored updates opts]
  (let [new-names (into {}
                        (keep (fn [{id :id new-name :name}]
                                (let [{user-id :user_id old-name :name} (stored id)]
                                  (when (and new-name user-id (not= new-name old-name))
                                    [user-id new-name]))))
                        updates)]
    (when (seq new-names)
      (user/update-users! (for [user-id (user/user-ids-of-type (vec (keys new-names)) :api-key)]
                            {:id user-id :first_name (new-names user-id) :last_name ""})
                          opts))))

(defn- move-key-users!
  "Make the User created for each key of `updates` that sets `::api-keys/group-id`, stored in `stored`, a member of
  exactly All Users and that group, one removal and one addition per distinct group."
  [stored updates]
  (when-let [moving (not-empty (filterv ::api-keys/group-id updates))]
    (let [all-users-id (u/the-id (perms/all-users-group))
          key-groups   (group-by :api-key-id (api-keys.db/api-key-groups (mapv :id moving)))]
      (doseq [[group-id rows] (group-by ::api-keys/group-id moving)
              :let [user-ids (into [] (keep (comp :user_id stored :id)) rows)
                    leaving  (into [] (comp (mapcat (comp key-groups :id))
                                            (map :group-id)
                                            (remove #{all-users-id group-id})
                                            (distinct))
                                   rows)]]
        (perms-group-membership/remove-users-from-groups! user-ids leaving)
        (perms-group-membership/add-users-to-groups! (for [user-id user-ids
                                                           new-id  [all-users-id group-id]]
                                                       {:user user-id :group new-id}))))))

(defn- key-column-rows
  "The rows of `updates` as the ApiKey columns they set: all but the group, with `updated_at` set to `now` when the
  group moves."
  [updates now]
  (mapv (fn [row]
          (cond-> (dissoc row ::api-keys/group-id)
            (::api-keys/group-id row) (assoc :updated_at now)))
        updates))

(defn- write-key-columns!
  "Write the column `rows` over the `stored` ApiKeys, a statement per row, and return each row with its stored ApiKey."
  [stored rows]
  (api-keys.db/update-api-keys! rows)
  (mapv (fn [row] [(stored (:id row)) row]) rows))

(defn- update-api-key-batch!
  "Apply the `batch` of updates whose ApiKeys exist, after checking them, and return each column row with its stored
  ApiKey."
  [batch now opts]
  (let [stored (stored-api-keys batch)
        rows   (filterv (comp stored :id) batch)]
    (check-key-group-moves stored rows)
    (rename-key-users! stored rows opts)
    (move-key-users! stored rows)
    (write-key-columns! stored (key-column-rows rows now))))

(mu/defn update-api-keys! :- :nil
  "Apply `updates`, each the id of an ApiKey and the changes to it, in one transaction, publishing their update event
  with `opts`; a new `:name` renames the User created for the key, and `::api-keys/group-id` moves that User to the
  group with that id (besides All Users)."
  ([updates :- [:sequential ::api-keys.schema/api-key.update]]
   (update-api-keys! updates nil))
  ([updates :- [:sequential ::api-keys.schema/api-key.update]
    opts    :- [:maybe ::write-opts]]
   (t2/with-transaction [_conn]
     (let [now     (t/offset-date-time)
           written (into [] (mapcat #(update-api-key-batch! % now opts))
                         (partition-all mdb/update-partition-size updates))]
       (when (seq written)
         (events/publish-event! :event/api-key-update
                                (events/update-event (into {} (map (fn [[stored _]] [(:id stored) stored])) written)
                                                     (mapv second written)
                                                     opts)))))
   nil))

(defn- deactivate-key-users!
  "Deactivate the api-key Users with `user-ids`, publishing the events of the writes with `opts`; keys without a user,
  such as SCIM keys, have none."
  [user-ids opts]
  (when-let [user-ids (not-empty (vec (distinct (remove nil? user-ids))))]
    (user/update-users! (for [id (user/user-ids-of-type user-ids :api-key)] {:id id :is_active false}) opts)))

(mu/defn delete-api-keys! :- :nil
  "Delete the ApiKeys with `ids` in one transaction, deactivating the Users created for them and publishing their delete
  event with `opts`."
  ([ids :- [:sequential ::api-keys.schema/id]]
   (delete-api-keys! ids nil))
  ([ids  :- [:sequential ::api-keys.schema/id]
    opts :- [:maybe ::write-opts]]
   (when (seq ids)
     (t2/with-transaction [_conn]
       (let [batches  (mapv vec (partition-all mdb/delete-partition-size ids))
             api-keys (into [] (mapcat api-keys.db/api-keys-by-ids) batches)]
         (when (seq api-keys)
           (deactivate-key-users! (map :user_id api-keys) opts)
           (events/publish-event! :event/api-key-delete (events/delete-event api-keys opts))
           (run! api-keys.db/delete-api-keys! batches)))))
   nil))

(mu/defn create-api-key-with-new-user!
  "Create a new API key and a new user for that key at the same time, with `scope` when given."
  [{:keys [key-name group-id scope]}
   :- [:map {:closed true}
       [:key-name ::api-keys.schema/name]
       [:group-id {:optional true} pos-int?]
       [:scope    {:optional true} ::api-keys.schema/scope]]]
  (api/checkp (not (api-keys.db/api-key-name-exists? key-name))
              "name" "An API key with this name already exists.")
  (let [unhashed-key (key-with-unique-prefix)
        email        (format "api-key-user-%s@api-key.invalid" (random-uuid))]
    (t2/with-transaction [_conn]
      (let [[{user-id :id}] (user/create-users! [{:email      email
                                                  :first_name key-name
                                                  :last_name  ""
                                                  :type       :api-key}])]
        (when group-id
          (user/set-permissions-groups! user-id [(perms/all-users-group) group-id]))
        (-> (create-api-keys!
             [(cond-> {:user_id                user-id
                       :name                   key-name
                       ::api-keys/unhashed-key unhashed-key
                       :updated_by_id          api/*current-user-id*
                       :creator_id             api/*current-user-id*}
                scope (assoc :scope scope))])
            first
            (assoc :unmasked_key unhashed-key))))))

(mu/defn regenerate! :- [:map
                         [:unmasked-key ::api-keys.schema/key.secret]
                         [:masked-key   ::api-keys.schema/key.masked]
                         [:prefix       ::api-keys.schema/prefix]]
  "Generate a new API key for an existing key with `id`."
  [id :- ::api-keys.schema/id]
  (let [api-key-before (api-keys.db/api-key id)
        new-key        (key-with-unique-prefix)
        new-prefix     (prefix new-key)]
    (update-api-keys! [{:id            id
                        :key           (hash-bcrypt new-key (:scope api-key-before))
                        :key_prefix    new-prefix
                        :updated_by_id api/*current-user-id*}])
    {:unmasked-key new-key
     :masked-key   (mask new-key)
     :prefix       new-prefix}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ApiKey [_model]
  {:skip? false})

(defmethod audit/spec :model/ApiKey [_model]
  {:track          [:name :key_prefix :user_id]
   :track-redacted [:creator_id :key :scope :updated_by_id]
   :skip           [:last_used_at]
   :hydrate        api-keys.audit/hydrate
   :details        api-keys.audit/details
   :topics         {:create :api-key-create
                    :update api-keys.audit/update-topic
                    :delete :api-key-delete}})
