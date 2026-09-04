(ns metabase.login-history.db
  "Application database queries for the login history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn login-history-for-user
  "The timestamp, session id, device description, and IP address of the LoginHistory of the User with `user-id`,
  newest first."
  [user-id]
  (t2/select [:model/LoginHistory :timestamp :session_id :device_description :ip_address]
             :user_id user-id
             {:order-by [[:timestamp :desc]]}))

(defn insert-login-history!
  "Insert the LoginHistory `row`."
  [row]
  (t2/insert! :model/LoginHistory row))

(defn login-history-ids-for-user
  "Up to `limit` LoginHistory ids of the User with `user-id`."
  [user-id limit]
  (t2/select [:model/LoginHistory :id] :user_id user-id {:limit limit}))

(defn login-history-ids-for-user-device
  "Up to `limit` LoginHistory ids of the User with `user-id` on the device with `device-id`."
  [user-id device-id limit]
  (t2/select [:model/LoginHistory :id] :user_id user-id, :device_id device-id, {:limit limit}))

(defn first-device-login-count-since
  "The number of LoginHistory rows of the User with `user-id` in the last `window-hours` that are the first
  login on their device."
  [user-id window-hours]
  (t2/count :model/LoginHistory
            {:where [:and
                     [:= :user_id user-id]
                     [:> :timestamp (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- window-hours) :hour)]
                     [:not [:exists
                            ^:allow-subquery
                            {:select [1]
                             :from   [[:login_history :lh2]]
                             :where  [:and
                                      [:= :lh2.user_id   :login_history.user_id]
                                      [:= :lh2.device_id :login_history.device_id]
                                      [:< :lh2.id        :login_history.id]]}]]]}))
