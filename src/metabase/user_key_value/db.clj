(ns metabase.user-key-value.db
  "Application database queries for the user key-value module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn upsert-user-key-value!
  "Store `value` and `expires-at` as the UserKeyValue of the User with `user-id` for `k` in `namespace`, inserting it
  or updating the stored one, in one statement: `ON CONFLICT` on Postgres, `ON DUPLICATE KEY UPDATE` on MySQL and
  MariaDB, `MERGE` on H2, keyed by the unique (user, namespace, key). A new row takes the column defaults for its
  timestamps; an updated one gets `updated_at` set to now, as the model's timestamp hook does."
  [user-id    :- ::lib.schema.id/user
   namespace  :- :string
   k          :- :string
   value      :- [:maybe :string]
   expires-at :- [:maybe ms/TemporalInstant]]
  (t2/query-one
   (case (mdb/db-type)
     :postgres
     ["INSERT INTO user_key_value (user_id, namespace, \"key\", value, expires_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, namespace, \"key\")
       DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()"
      (long user-id) namespace k value expires-at]

     :mysql
     ["INSERT INTO user_key_value (user_id, namespace, `key`, value, expires_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), expires_at = VALUES(expires_at), updated_at = NOW(6)"
      (long user-id) namespace k value expires-at]

     :h2
     ["MERGE INTO user_key_value AS t
       USING (VALUES (CAST(? AS INTEGER), CAST(? AS VARCHAR(254)), CAST(? AS VARCHAR(254)),
                      CAST(? AS CHARACTER LARGE OBJECT), CAST(? AS TIMESTAMP WITH TIME ZONE)))
             AS s (user_id, namespace, k, v, expires_at)
       ON t.user_id = s.user_id AND t.namespace = s.namespace AND t.\"KEY\" = s.k
       WHEN MATCHED THEN UPDATE SET \"VALUE\" = s.v, expires_at = s.expires_at, updated_at = now()
       WHEN NOT MATCHED THEN INSERT (user_id, namespace, \"KEY\", \"VALUE\", expires_at)
                             VALUES (s.user_id, s.namespace, s.k, s.v, s.expires_at)"
      (long user-id) namespace k value expires-at])))

(mu/defn delete-user-key-value!
  "Delete the UserKeyValue of the User with `user-id` for `k` in `namespace`, returning the number deleted."
  [user-id   :- ::lib.schema.id/user
   namespace :- :string
   k         :- :string]
  (t2/delete! :model/UserKeyValue
              :namespace [:auto/param namespace]
              :user_id   (long user-id)
              :key       [:auto/param k]))

(mu/defn unexpired-user-key-value
  "The unexpired UserKeyValue of the User with `user-id` for `k` in `namespace`, or nil."
  [user-id   :- ::lib.schema.id/user
   namespace :- :string
   k         :- :string]
  (t2/select-one :model/UserKeyValue
                 {:where [:and
                          [:= :user_id (long user-id)]
                          [:= :namespace [:auto/param namespace]]
                          [:= :key [:auto/param k]]
                          [:or
                           [:>= :expires_at :%now]
                           [:= :expires_at nil]]]}))

(mu/defn unexpired-user-key-values
  "The unexpired UserKeyValues of the User with `user-id` in `namespace`."
  [user-id   :- ::lib.schema.id/user
   namespace :- :string]
  (t2/select :model/UserKeyValue
             {:where [:and
                      [:= :user_id (long user-id)]
                      [:= :namespace [:auto/param namespace]]
                      [:or
                       [:>= :expires_at :%now]
                       [:= :expires_at nil]]]}))
