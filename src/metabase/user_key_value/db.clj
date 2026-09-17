(ns metabase.user-key-value.db
  "Application database queries for the user key-value module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the user-key-value-only section at the
  bottom of this namespace."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.user-key-value.schema :as user-key-value.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which UserKeyValues a query applies to. Keys mirror the columns of `user_key_value`: a scalar matches that
  value."
  [:map {:closed true}
   [:user_id   {:optional true} ::lib.schema.id/user]
   [:namespace {:optional true} :string]
   [:key       {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::user-key-value.schema/user-key-value.column]]
    [:order-by {:optional true} [:sequential ::user-key-value.schema/user-key-value.column]]]])

(defn- filter-clause
  [[column value]]
  (if (set? value)
    [:in column value]
    [:= column value]))

(defn- where-clause
  [filters]
  (into [:and] (map filter-clause) filters))

(defn- ->honeysql
  [opts]
  {:where (where-clause (dissoc opts :columns :order-by))})

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-user-key-value :- [:maybe ::user-key-value.schema/user-key-value]
  "The first UserKeyValue matching `opts`, or nil."
  [opts :- [:maybe ::opts]]
  (t2/select-one :model/UserKeyValue (->honeysql opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-user-key-value! :- ::user-key-value.schema/user-key-value
  "Insert the UserKeyValue `row` and return the inserted instance."
  [row :- ::user-key-value.schema/user-key-value.update]
  (t2/insert-returning-instance! :model/UserKeyValue row))

(mu/defn update-user-key-values! :- :int
  "Apply `changes` to every UserKeyValue matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::user-key-value.schema/user-key-value.update]
  (t2/update! :model/UserKeyValue (->honeysql opts) changes))

(mu/defn delete-user-key-values! :- :int
  "Delete every UserKeyValue matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (t2/delete! :model/UserKeyValue (->honeysql opts)))

;;; ------------------------------- Queries used only by the user-key-value module -------------------------------

(mu/defn unexpired-user-key-value :- [:maybe ::user-key-value.schema/user-key-value]
  "The unexpired UserKeyValue of the User with `user-id` for `k` in `namespace`, or nil."
  [user-id   :- ::lib.schema.id/user
   namespace :- :string
   k         :- :string]
  (t2/select-one :model/UserKeyValue
                 {:where [:and
                          [:= :user_id user-id]
                          [:= :namespace namespace]
                          [:= :key k]
                          [:or
                           [:>= :expires_at :%now]
                           [:= :expires_at nil]]]}))

(mu/defn unexpired-user-key-values :- [:sequential ::user-key-value.schema/user-key-value]
  "The unexpired UserKeyValues of the User with `user-id` in `namespace`."
  [user-id   :- ::lib.schema.id/user
   namespace :- :string]
  (t2/select :model/UserKeyValue
             {:where [:and
                      [:= :user_id user-id]
                      [:= :namespace namespace]
                      [:or
                       [:>= :expires_at :%now]
                       [:= :expires_at nil]]]}))
