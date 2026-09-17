(ns metabase.login-history.db
  "Application database queries for the login history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the login-history-only section at the
  bottom of this namespace."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.login-history.schema :as login-history.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which LoginHistories a query applies to. Keys mirror the columns of `login_history`: a scalar matches that
  value."
  [:map {:closed true}
   [:user_id   {:optional true} ::lib.schema.id/user]
   [:device_id {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select, the order to return them in, and a row limit."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::login-history.schema/login-history.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::login-history.schema/login-history.column
                                              [:tuple ::login-history.schema/login-history.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/LoginHistory columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-login-histories :- [:sequential ::login-history.schema/login-history.partial]
  "The LoginHistories matching `opts`."
  ([]
   (select-login-histories nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-login-history-pks :- [:set ms/PositiveInt]
  "The ids of the LoginHistories matching `opts`."
  ([]
   (select-login-history-pks nil))
  ([opts :- [:maybe ::opts]]
   (or (apply t2/select-pks-set :model/LoginHistory (->args opts)) #{})))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-login-history! :- ::login-history.schema/login-history
  "Insert the LoginHistory `row` and return the inserted instance."
  [row :- (mut/select-keys ::login-history.schema/login-history.update [:user_id :session_id :device_id :device_description :ip_address])]
  (t2/insert-returning-instance! :model/LoginHistory row))

;;; ------------------------------- Queries used only by the login-history module -------------------------------

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
