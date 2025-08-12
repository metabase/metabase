(ns metabase.api-keys.models.api-key
  (:require
   [clojure.core.memoize :as memoize]
   [crypto.random :as crypto-random]
   [malli.error :as me]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.password :as u.password]
   [metabase.util.secret :as u.secret]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ApiKey [_model] :api_key)

(methodical/defmethod toucan2.tools.hydrate/batched-hydrate [:model/ApiKey :group]
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
                         [:key_prefix ::api-keys.schema/prefix]]
  [{:keys [unhashed_key] :as api-key} :- [:map
                                          [:unhashed_key {:optional true} ::api-keys.schema/key.unhashed]]]
  (cond-> api-key
    (contains? api-key :unhashed_key)
    (assoc :key_prefix (some-> unhashed_key u.secret/expose prefix))))

(mu/defn generate-key :- ::api-keys.schema/key.secret
  "Generates a new API key - a random base64 string prefixed with `mb_`"
  []
  (u.secret/secret
   (str "mb_" (crypto-random/base64 api-keys.schema/bytes-key-length))))

(mu/defn mask :- ::api-keys.schema/key.unhashed
  "Given an API key, returns a string of the same length with all but the prefix masked with `*`s"
  ^String [k :- [:or
                 ::api-keys.schema/key.unhashed-or-secret
                 ::api-keys.schema/prefix]]
  (let [sb (StringBuilder.)]
    (.append sb (prefix k))
    (dotimes [_ (- api-keys.schema/string-key-length api-keys.schema/prefix-length)]
      (.append sb \*))
    (str sb)))

(mu/defn- hash-bcrypt :- ::api-keys.schema/key.hashed
  [k :- ::api-keys.schema/key.unhashed-or-secret]
  (-> k u.secret/expose u.password/hash-bcrypt))

(mu/defn- add-key
  "Adds the `key` based on the `unhashed_key` passed in."
  [{unhashed-key :unhashed_key, :as api-key} :- [:map
                                                 [:unhashed-key {:optional true} ::api-keys.schema/key.unhashed]]]
  (-> api-key
      (cond-> (contains? api-key :unhashed_key) (assoc :key (some-> unhashed-key hash-bcrypt)))
      (dissoc :unhashed_key)))

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

(t2/define-before-update :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key
      (validate-with-schema ::api-keys.schema/api-key.update)))

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

(mu/defn create-single-collection-api-key! :- ::api-keys.schema/key.secret
  "Create a new API key to give `user-id` permissions to read/write a single collection with `collection-id`. Make sure
  the user has perms to do this before creating the token!"
  [user-id       :- pos-int?
   collection-id :- pos-int?]
  (let [api-key  (generate-key)
        prefix   (prefix api-key)
        key-name (format "Single Collection API Key for User %d and Collection %d starting with %s"
                         user-id collection-id prefix)]
    (t2/insert! :model/ApiKey {:user_id              user-id
                               :creator_id           user-id
                               :updated_by_id        user-id
                               :name                 key-name
                               :key                  (hash-bcrypt api-key)
                               :key_prefix           prefix
                               :scope                :api-key.scope/single-collection
                               :single_collection_id collection-id})
    api-key))
