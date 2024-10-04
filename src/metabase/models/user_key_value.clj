(ns metabase.models.user-key-value
  (:require
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/UserKeyValue [_model] :user_key_value)

(doto :model/UserKeyValue
  (derive :metabase/model)
  (derive :hook/timestamped?))

(mu/defn insert!
  "Upserts a KV-pair"
  [user-id :- :int
   k :- :string
   v :- [:maybe :string]]
  (t2/with-transaction [_]
    (if (t2/select-one :model/UserKeyValue :user_id user-id :key k)
      (t2/update! :model/UserKeyValue :user_id user-id :key k {:value v})
      (t2/insert! :model/UserKeyValue {:user_id user-id :key k :value v})))
  v)

(mu/defn retrieve
  :- [:maybe :string]
  "Retrieves a KV-pair"
  [user-id :- :int
   k :- :string]
  (t2/select-one-fn :value :model/UserKeyValue :user_id user-id :key k))
