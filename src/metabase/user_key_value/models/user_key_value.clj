(ns metabase.user-key-value.models.user-key-value
  "This namespace allows the frontend to store and retrieve arbitrary key-value pairs for individual users in the
  database.

  Each KVP is stored in a single 'namespace', which has a schema. You can write a schema in
  `resources/user_key_value_types/*.edn`. (If the schema will only be used in tests, you can use
  `test_resources/user_key_value_types/*.edn`.) The content should be a Malli schema. For example, a file
  `resources/user_key_value_types/foo.edn` with the content

  ```
  [:map [:value [:maybe :string]]]
  ```

  would define a new namespace, `foo`, where keys and values are both arbitrary strings.

  If you want, you can get more creative - for example, if you have a defined set of allowed keys, you could say:

  ```
  [:map
   [:key [:enum \"allowed-key-1\" \"allowed-key-2\"]]
   [:value [:maybe :string]]]
  ```

  Or you could go even further, and define a `:multi` spec that has a spec for keys in the case of particular values:

  ```
  [:multi {:dispatch :key}
   [\"string-key\" [:map [:value [:maybe :string]]]]
   [\"number-key\" [:map [:value [:maybe :int]]]]]
  ```

  Note that: `value` must always be `:maybe` - a null value means to delete the KVP.
  "
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.user-key-value.db :as user-key-value.db]
   [metabase.user-key-value.models.user-key-value.types :as types]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/UserKeyValue [_model] :user_key_value)

(doto :model/UserKeyValue
  (derive :metabase/model)
  (derive :hook/timestamped?))

(mu/defn put!
  "Upserts a KV-pair"
  [user-id :- :int
   kvp :- ::types/user-key-value]
  (let [{:keys [namespace key value expires-at]}
        (mc/encode ::types/user-key-value
                   kvp
                   (mtx/transformer
                    (mtx/default-value-transformer)
                    {:name :database}))]
    (t2/with-transaction [_]
      (if (user-key-value.db/user-key-value user-id namespace key)
        (user-key-value.db/update-user-key-value! user-id namespace key value expires-at)
        (try
          (user-key-value.db/insert-user-key-value! user-id namespace key value expires-at)
          ;; in case we caught a duplicate key exception (a row was inserted between our read and write), try updating
          (catch Exception _
            (user-key-value.db/update-user-key-value! user-id namespace key value expires-at)))))
    value))

(mu/defn delete!
  "Deletes a KV-pair"
  [user-id :- :int
   namespace :- :string
   k :- :string]
  (user-key-value.db/delete-user-key-value! user-id namespace k))

(mu/defn retrieve
  "Retrieves a KV-pair"
  [user-id :- :int
   namespace :- :string
   k :- :string]
  (when-let [ukv
             (user-key-value.db/unexpired-user-key-value user-id namespace k)]
    (:value (mc/decode ::types/user-key-value
                       ukv
                       (mtx/transformer
                        (mtx/default-value-transformer)
                        {:name :database})))))

(mu/defn retrieve-all
  "Retrieves all KV-pairs in a namespace"
  [user-id :- :int
   namespace :- :string]
  (when-let [kvs (seq (user-key-value.db/unexpired-user-key-values user-id namespace))]
    (let [parsed-kvs (mc/decode [:sequential ::types/user-key-value]
                                kvs
                                (mtx/transformer
                                 (mtx/default-value-transformer)
                                 {:name :database}))]
      (into {} (map (juxt :key :value) parsed-kvs)))))
