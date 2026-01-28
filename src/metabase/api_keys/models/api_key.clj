(ns metabase.api-keys.models.api-key
  "`:metabase.api-keys.core/group-id` and `:metabase.api-keys.core/unhashed-key` have special meanings when passed to
  various Toucan CRUD methods for `:model/ApiKey`... see below."
  (:require
   [clojure.core.memoize :as memoize]
   [java-time.api :as t]
   [malli.error :as me]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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
                    (t2/query {:select [[:pg.name :group-name]
                                        [:pg.id :group-id]
                                        [:api_key.id :api-key-id]]
                               :from   [[:permissions_group :pg]]
                               :join   [[:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]
                                        :api_key [:= :api_key.user_id :pgm.user_id]]
                               :where  [:in :api_key.id (map u/the-id api-keys)]}))
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
  {:scope mi/transform-keyword})

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

(mu/defn- add-prefix :- [:map
                         [:key_prefix {:optional true} ::api-keys.schema/prefix]]
  [{unhashed-key ::api-keys/unhashed-key, :as api-key} :- [:map
                                                           [::api-keys/unhashed-key {:optional true} ::api-keys.schema/key.unhashed-or-secret]]]
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

(mu/defn- hash-bcrypt :- ::api-keys.schema/key.hashed
  [k :- ::api-keys.schema/key.unhashed-or-secret]
  (-> k expose u.password/hash-bcrypt))

(mu/defn- add-key
  "Adds the `key` based on the `:metabase.api-keys/unhashed-qkey passed in."
  [{unhashed-key ::api-keys/unhashed-key, :as api-key} :- [:map
                                                           [::api-keys/unhashed-key {:optional true} ::api-keys.schema/key.unhashed-or-secret]]]
  (-> api-key
      (cond-> (contains? api-key ::api-keys/unhashed-key) (assoc :key (some-> unhashed-key hash-bcrypt)))
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
      (validate-with-schema ::api-keys.schema/api-key.insert)))

(t2/define-after-insert :model/ApiKey
  [api-key]
  (u/prog1 api-key
    (events/publish-event!
     :event/api-key-create
     {:object  (t2/hydrate api-key :group :updated_by)
      :user-id api/*current-user-id*})))

(t2/define-before-update :model/ApiKey
  [{user-id :user_id, :as api-key}]
  (t2/with-transaction [_conn]
    ;; need to hydrate user info BEFORE making changes so we record the correct stuff for audit logging
    (let [key-before (t2/hydrate (t2/instance :model/ApiKey (t2/original api-key)) :user :group :updated_by)]
      ;; update the user name associated with this API key if it was created just for this API key.
      (when-let [new-name (:name (t2/changes api-key))]
        (t2/update! :model/User :id user-id, :type :api-key, {:first_name new-name, :last_name ""}))
      ;; update user group as well.
      (when-let [new-group-id (::api-keys/group-id (t2/changes api-key))]
        (assert (= (t2/select-one-fn :type :model/User :id user-id) :api-key)
                "Cannot change the Permissions Group for the user associated with an API key that was not created alongside it")
        (user/set-permissions-groups! user-id [(perms/all-users-group) {:id new-group-id}]))
      (u/prog1 (-> api-key
                   add-prefix
                   add-key
                   ;; force a no-op update so the T2 code doesn't optimize this whole update out
                   (cond-> (::api-keys/group-id (t2/changes api-key)) (-> (dissoc ::api-keys/group-id)
                                                                          (assoc :updated_at (t/offset-date-time))))
                   (validate-with-schema ::api-keys.schema/api-key.update))
        (events/publish-event!
         :event/api-key-update
         {:object          (t2/hydrate (t2/instance :model/ApiKey (t2/current <>)) :user :group :updated_by)
          :previous-object key-before
          :user-id         api/*current-user-id*})))))

(t2/define-before-delete :model/ApiKey
  [{user-id :user_id, :as api-key}]
  (u/prog1 api-key
    (events/publish-event!
     :event/api-key-delete
     {:object  (-> api-key
                   (t2/hydrate :group))
      :user-id api/*current-user-id*})
    ;; if we created a user along with the key (type = :api-key), mark it inactive.
    (t2/update! :model/User user-id, :type :api-key, {:is_active false})))

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
     (= :api-key (t2/select-one-fn :type :model/User user-id)))
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
      (if-not (t2/exists? :model/ApiKey :key_prefix prefix)
        api-key
        (throw (ex-info (tru "could not generate key with unique prefix") {}))))))

(mu/defn create-api-key-with-new-user!
  "Create a new API key and a new user for that key at the same time."
  [{:keys [key-name group-id]}
   :- [:map {:closed true}
       [:key-name ::api-keys.schema/name]
       [:group-id {:optional true} pos-int?]]]
  (api/checkp (not (t2/exists? :model/ApiKey :name key-name))
              "name" "An API key with this name already exists.")
  (let [unhashed-key (key-with-unique-prefix)
        email        (format "api-key-user-%s@api-key.invalid" (random-uuid))]
    (t2/with-transaction [_conn]
      (let [user-id (t2/insert-returning-pk! :model/User
                                             {:email      email
                                              :first_name key-name
                                              :last_name  ""
                                              :type       :api-key
                                              :password   (str (random-uuid))})]
        (when group-id
          (user/set-permissions-groups! user-id [(perms/all-users-group) group-id]))
        (-> (t2/insert-returning-instance! :model/ApiKey
                                           {:user_id                user-id
                                            :name                   key-name
                                            ::api-keys/unhashed-key unhashed-key
                                            :updated_by_id          api/*current-user-id*
                                            :creator_id             api/*current-user-id*})
            (assoc :unmasked_key unhashed-key))))))

(mu/defn regenerate! :- [:map
                         [:unmasked-key ::api-keys.schema/key.secret]
                         [:masked-key   ::api-keys.schema/key.masked]
                         [:prefix       ::api-keys.schema/prefix]]
  "Generate a new API key for an existing key with `id`."
  [id :- ::api-keys.schema/id]
  (let [api-key-before (t2/select-one :model/ApiKey id)
        new-key        (key-with-unique-prefix)
        new-prefix     (prefix new-key)]
    (t2/with-transaction [_conn]
      (t2/update! :model/ApiKey :id id {:key           (hash-bcrypt new-key)
                                        :key_prefix    new-prefix
                                        :updated_by_id api/*current-user-id*})
      (events/publish-event! :event/api-key-regenerate
                             (let [key-before (-> api-key-before
                                                  (t2/hydrate :group))]
                               {:object          (-> key-before
                                                     (assoc :key_prefix new-prefix))
                                :previous-object key-before
                                :user-id         api/*current-user-id*})))
    {:unmasked-key new-key
     :masked-key   (mask new-key)
     :prefix       new-prefix}))
