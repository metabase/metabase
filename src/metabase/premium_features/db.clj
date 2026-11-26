(ns metabase.premium-features.db
  "Application database queries for the premium features module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-personal-user-count
  "The number of active personal Users."
  []
  ;; Because this count is needed *during* token checks, it uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true, :type "personal"))

(mu/defn token-status-cache
  "The `:token_status_hash` and `:updated_at` cached for `token-hash`, or nil."
  [token-hash :- :string]
  (t2/select-one [:model/PremiumFeaturesCache :token_status_hash :updated_at] :token_hash token-hash))

(mu/defn upsert-token-status-cache!
  "Store `token-status-hash` as the cached status hash of `token-hash`, updated at `updated-at`, inserting the row or
  updating the stored one in one statement keyed by the primary key `token_hash`, and return the number of rows written."
  [token-hash        :- :string
   token-status-hash :- :string
   updated-at        :- ms/TemporalInstant]
  (t2/query-one (mdb/upsert-query (t2/table-name :model/PremiumFeaturesCache)
                                  [:token_hash]
                                  {:token_hash token-hash :token_status_hash token-status-hash :updated_at updated-at})))
