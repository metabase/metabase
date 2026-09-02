(ns metabase.premium-features.queries
  "Application database queries for the premium features module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [toucan2.core :as t2]))

(defn active-personal-user-count
  "The number of active personal Users."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true, :type "personal"))

(defn token-status-cache
  "The `:token_status_hash` and `:updated_at` cached for `token-hash`, or nil."
  [token-hash]
  (t2/select-one [:model/PremiumFeaturesCache :token_status_hash :updated_at] :token_hash token-hash))

(defn update-token-status-cache!
  "Set the cached status hash for `token-hash`, returning the number of rows updated."
  [token-hash token-status-hash updated-at]
  (t2/update! :model/PremiumFeaturesCache :token_hash token-hash
              {:token_status_hash token-status-hash, :updated_at updated-at}))

(defn insert-token-status-cache!
  "Insert a cached status hash for `token-hash`."
  [token-hash token-status-hash updated-at]
  (t2/insert! :model/PremiumFeaturesCache {:token_hash        token-hash
                                           :token_status_hash token-status-hash
                                           :updated_at        updated-at}))

(defn delete-token-status-cache!
  "Delete every cached token status."
  []
  (t2/delete! :model/PremiumFeaturesCache))
