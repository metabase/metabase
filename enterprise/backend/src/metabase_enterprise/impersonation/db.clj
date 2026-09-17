(ns metabase-enterprise.impersonation.db
  "Application database queries for the impersonation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which ConnectionImpersonations a query applies to. Keys mirror the columns of `:connection_impersonations`: a
  scalar matches that value and a set matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:db_id    {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:group_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::impersonation.schema/connection-impersonation.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::impersonation.schema/connection-impersonation.column
                                              [:tuple ::impersonation.schema/connection-impersonation.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/ConnectionImpersonation columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; The queries below follow [[::opts]]; queries that do not fit it live in the impersonation-only section at the
;;; bottom of this namespace.

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-connection-impersonations :- [:sequential ::impersonation.schema/connection-impersonation.partial]
  "The ConnectionImpersonations matching `opts`."
  ([]
   (select-connection-impersonations nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-connection-impersonation :- [:maybe ::impersonation.schema/connection-impersonation.partial]
  "The first ConnectionImpersonation matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (apply t2/select-one (->model columns) (->args opts)))

(mu/defn connection-impersonation-exists? :- :boolean
  "Whether a ConnectionImpersonation matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/ConnectionImpersonation (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-connection-impersonation! :- ::impersonation.schema/connection-impersonation
  "Insert the ConnectionImpersonation `row` and return the inserted instance."
  [row :- ::impersonation.schema/connection-impersonation.create]
  (t2/insert-returning-instance! :model/ConnectionImpersonation row))

(mu/defn delete-connection-impersonations! :- :int
  "Delete every ConnectionImpersonation matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/ConnectionImpersonation (->args opts)))

;;; ------------------------------- Queries used only by the impersonation module -------------------------------

(mu/defn select-impersonations-matching
  "The ConnectionImpersonations narrowed by the optional `database-id`, `group-id`, and `group-ids`, excluding the
  Database with `excluded-database-id` when given."
  [database-id           :- [:maybe ::lib.schema.id/database]
   group-id              :- [:maybe ms/PositiveInt]
   group-ids             :- [:maybe [:sequential ms/PositiveInt]]
   excluded-database-id  :- [:maybe ::lib.schema.id/database]]
  (t2/select :model/ConnectionImpersonation
             {:where [:and
                      (when database-id [:= :db_id database-id])
                      (when group-id [:= :group_id group-id])
                      (when group-ids [:in :group_id group-ids])
                      (when excluded-database-id [:not [:= :db_id excluded-database-id]])]}))

(mu/defn view-data-permission-values
  "The set of database-level view-data permission values `group-ids` hold on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   group-ids   :- [:set ms/PositiveInt]]
  (t2/select-fn-set :perm_value :model/DataPermissions
                    {:where [:and
                             [:= :db_id database-id]
                             [:= :table_id nil]
                             [:= :perm_type "perms/view-data"]
                             [:in :group_id group-ids]]}))

(mu/defn group-ids-for-user
  "The IDs of the PermissionsGroups the User with `user-id` belongs to, or nil when `user-id` is nil (e.g. no
  current user, such as an internal or unauthenticated context)."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))
