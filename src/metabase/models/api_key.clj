(ns metabase.models.api-key
  (:require [crypto.random :as crypto-random]
            [metabase.models.audit-log :as audit-log]
            [metabase.models.interface :as mi]
            [metabase.models.permissions-group :as perms-group]
            [metabase.util :as u]
            [metabase.util.password :as u.password]
            [metabase.util.secret :as u.secret]
            [methodical.core :as methodical]
            [toucan2.core :as t2]))

;; the prefix length, the length of `mb_1234`
(def ^:private prefix-length 7)

;; the total number of bytes of randomness we generate for API keys
(def ^:private bytes-key-length 32)

(methodical/defmethod t2/table-name :model/ApiKey [_model] :api_key)

(mi/define-batched-hydration-method add-group
  :group
  "Add to each ApiKey a single group. Assume that each ApiKey is a member of either zero or one groups other than
  the 'All Users' group."
  [api-keys]
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
                                      (sort-by #(= (:group-id %) (u/the-id (perms-group/all-users))))
                                      first)]
              {:name name :id id}))]
      (for [api-key api-keys]
        (assoc api-key :group (api-key-id->group (u/the-id api-key)))))))

(doto :model/ApiKey
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ApiKey
  {:scope mi/transform-keyword})

(defn prefix
  "Given an API key, returns the standardized prefix for that API key."
  [key]
  (apply str (take prefix-length key)))

(defn- add-prefix [{:keys [unhashed_key] :as api-key}]
  (cond-> api-key
    (contains? api-key :unhashed_key)
    (assoc :key_prefix (some-> unhashed_key u.secret/expose prefix))))

(defn generate-key
  "Generates a new API key - a random base64 string prefixed with `mb_`"
  []
  (u.secret/secret
   (str "mb_" (crypto-random/base64 bytes-key-length))))

(def ^:private string-key-length (count (u.secret/expose (generate-key))))

(defn mask
  "Given an API key, returns a string of the same length with all but the prefix masked with `*`s"
  [key]
  (->> (concat (prefix key) (repeat "*"))
       (take string-key-length)
       (apply str)))

(defn- add-key
  "Adds the `key` based on the `unhashed_key` passed in."
  [{:keys [unhashed_key] :as api-key}]
  (cond-> api-key
    (contains? api-key :unhashed_key)
    (assoc :key (some-> unhashed_key u.secret/expose u.password/hash-bcrypt))

    true (dissoc :unhashed_key)))

(t2/define-before-insert :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key))

(t2/define-before-update :model/ApiKey
  [api-key]
  (-> api-key
      add-prefix
      add-key))

(defn- add-masked-key [api-key]
  (if-let [prefix (:key_prefix api-key)]
    (assoc api-key :masked_key (mask prefix))
    api-key))

(t2/define-after-select :model/ApiKey
  [api-key]
  (-> api-key
      add-masked-key))

(defmethod audit-log/model-details :model/ApiKey
  [entity _event-type]
  (select-keys entity [:name :group :key_prefix :user_id]))
