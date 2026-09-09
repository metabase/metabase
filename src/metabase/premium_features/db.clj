(ns metabase.premium-features.db
  "Application database queries for the premium features module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
   [metabase.premium-features.schema :as premium-features.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-personal-user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of active personal Users."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true, :type "personal"))

(def ^:private TokenStatusCache
  "Rows returned by [[token-status-cache]]."
  (mut/select-keys ::premium-features.schema/premium-features-cache [:token_status_hash :updated_at]))

(mu/defn token-status-cache :- [:maybe TokenStatusCache]
  "The `:token_status_hash` and `:updated_at` cached for `token-hash`, or nil."
  [token-hash :- :string]
  (t2/select-one [:model/PremiumFeaturesCache :token_status_hash :updated_at] :token_hash token-hash))

(mu/defn update-token-status-cache! :- :int
  "Set the cached status hash for `token-hash`, returning the number of rows updated."
  [token-hash        :- :string
   token-status-hash :- :string
   updated-at        :- ms/TemporalInstant]
  (t2/update! :model/PremiumFeaturesCache :token_hash token-hash
              {:token_status_hash token-status-hash, :updated_at updated-at}))

(mu/defn insert-token-status-cache! :- :int
  "Insert a cached status hash for `token-hash`."
  [token-hash        :- :string
   token-status-hash :- :string
   updated-at        :- ms/TemporalInstant]
  (t2/insert! :model/PremiumFeaturesCache {:token_hash        token-hash
                                           :token_status_hash token-status-hash
                                           :updated_at        updated-at}))

(mu/defn delete-token-status-cache! :- :int
  "Delete every cached token status."
  []
  (t2/delete! :model/PremiumFeaturesCache))
