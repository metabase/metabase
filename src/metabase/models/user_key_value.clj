(ns metabase.models.user-key-value
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.models.user-key-value.types :as types]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/UserKeyValue [_model] :user_key_value)

(doto :model/UserKeyValue
  (derive :metabase/model)
  (derive :hook/timestamped?))

(mu/defn put!
  "Upserts a KV-pair"
  [user-id :- :int
   kvp :- ::types/user-key-value]
  (let [{:keys [context key value]} (mc/encode ::types/user-key-value
                                               kvp
                                               (mtx/transformer
                                                (mtx/default-value-transformer)
                                                {:name :database}))]
    (t2/with-transaction [_]
      (if (t2/select-one :model/UserKeyValue :user_id user-id :context context :key key)
        (t2/update! :model/UserKeyValue :user_id user-id :context context :key key {:value value})
        (try
          (t2/insert! :model/UserKeyValue {:user_id user-id :context context :key key :value value})
          ;; in case we caught a duplicate key exception (a row was inserted between our read and write), try updating
          (catch Exception _
            (t2/update! :model/UserKeyValue :user_id user-id :context context :key key {:value value})))))
    value))

(mu/defn retrieve
  :- [:maybe :string]
  "Retrieves a KV-pair"
  [user-id :- :int
   context :- :string
   k :- :string]
  (t2/select-one-fn :value :model/UserKeyValue :user_id user-id :context context :key k))
