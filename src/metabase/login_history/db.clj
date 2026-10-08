(ns metabase.login-history.db
  "Application database queries for the login history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.login-history.schema :as login-history.schema]
   [metabase.session.core :as session]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn login-history-for-user
  "The timestamp, device description, IP address, and `active` flag of the LoginHistory of the User with `user-id`,
  newest first. `active` is whether the session the login created is still live — would still authenticate a
  request — by the `session` module's own definition, so a login whose session was revoked, logged out, or expired
  reads inactive."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/LoginHistory
             {:select    [:lh.timestamp :lh.device_description :lh.ip_address
                          ;; 1/0, normalised to a boolean by the model's after-select
                          [(session/live-expr (session/liveness-params)) :active]]
              :from      [[:login_history :lh]]
              :left-join (into [[:core_session :session] [:= :session.id :lh.session_id]]
                               session/session-left-joins)
              :where     [:= :lh.user_id user-id]
              :order-by  [[:lh.timestamp :desc]]}))

(mu/defn insert-login-history!
  "Insert the LoginHistory `row`, returning the number of rows inserted."
  [row :- (mut/select-keys ::login-history.schema/login-history.update [:user_id :session_id :device_id :device_description :ip_address])]
  (t2/insert! :model/LoginHistory row))

(mu/defn login-history-ids-for-user
  "Up to `limit` LoginHistory ids of the User with `user-id`."
  [user-id :- ::lib.schema.id/user
   limit   :- ms/PositiveInt]
  (t2/select [:model/LoginHistory :id] :user_id user-id {:limit limit}))

(mu/defn login-history-ids-for-user-device
  "Up to `limit` LoginHistory ids of the User with `user-id` on the device with `device-id`."
  [user-id   :- ::lib.schema.id/user
   device-id :- :string
   limit     :- ms/PositiveInt]
  (t2/select [:model/LoginHistory :id] :user_id user-id, :device_id device-id, {:limit limit}))

(mu/defn first-device-login-count-since
  "The number of LoginHistory rows of the User with `user-id` in the last `window-hours` that are the first
  login on their device."
  [user-id      :- ::lib.schema.id/user
   window-hours :- ms/PositiveInt]
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
