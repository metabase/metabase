(ns metabase-enterprise.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [metabase-enterprise.metabot.schema :as metabot.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as oss-metabot.schema]
   [metabase.permissions.core :as perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; The queries below follow their model's `::opts`; queries that do not fit it are grouped as this module's bespoke
;;; queries, immediately after each model's primitive family.

;;; --------------------------------------------- MetabotGroupLimit ---------------------------------------------

(mr/def ::metabot-group-limit-filters
  "Which MetabotGroupLimits a query applies to. Keys mirror the columns of `metabot_group_limit`."
  [:map {:closed true}
   [:id       {:optional true} ms/PositiveInt]
   [:group_id {:optional true} ms/PositiveInt]])

(mr/def ::metabot-group-limit-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::metabot-group-limit-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::metabot.schema/metabot-group-limit.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::metabot.schema/metabot-group-limit.column
                                              [:tuple ::metabot.schema/metabot-group-limit.column [:enum :asc :desc]]]]]]])

;;; ---- Reads ----

(mu/defn select-metabot-group-limits :- [:sequential ::metabot.schema/metabot-group-limit.partial]
  "The MetabotGroupLimits matching `opts`."
  ([]
   (select-metabot-group-limits nil))
  ([{:keys [columns] :as opts} :- [:maybe ::metabot-group-limit-opts]]
   (apply t2/select (u.query/model-with-columns :model/MetabotGroupLimit columns) (u.query/opts->args opts))))

(mu/defn select-one-metabot-group-limit :- [:maybe ::metabot.schema/metabot-group-limit.partial]
  "The first MetabotGroupLimit matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::metabot-group-limit-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/MetabotGroupLimit columns) (u.query/opts->args opts)))

;;; ---- Writes ----

(mu/defn insert-metabot-group-limit! :- ::metabot.schema/metabot-group-limit
  "Insert the MetabotGroupLimit `row` and return the inserted instance."
  [row :- ::metabot.schema/metabot-group-limit.create]
  (t2/insert-returning-instance! :model/MetabotGroupLimit row))

(mu/defn update-metabot-group-limits! :- :int
  "Apply `changes` to every MetabotGroupLimit matching `opts`, returning the number updated."
  [opts    :- [:maybe ::metabot-group-limit-opts]
   changes :- ::metabot.schema/metabot-group-limit.update]
  (apply t2/update! :model/MetabotGroupLimit (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-metabot-group-limits! :- :int
  "Delete every MetabotGroupLimit matching `opts`, returning the number deleted."
  [opts :- [:maybe ::metabot-group-limit-opts]]
  (apply t2/delete! :model/MetabotGroupLimit (u.query/opts->args opts)))

;;; ---- Queries used only by the metabot module: MetabotGroupLimit ----

(mu/defn select-max-usage-for-user
  "The `:max_usage` row holding the largest group limit of the User with `user-id`, or nil if any of their groups
  is unlimited."
  [user-id :- ::lib.schema.id/user]
  (t2/query-one {:select    [[[:case
                               [:= [[:count :*]] [[:count :gl.max_usage]]]
                               [[:max :gl.max_usage]]]
                              :max_usage]]
                 :from      [[:permissions_group_membership :pgm]]
                 :left-join [[:metabot_group_limit :gl] [:= :pgm.group_id :gl.group_id]]
                 :where     [:= :pgm.user_id user-id]}))

;;; -------------------------------------------- MetabotInstanceLimit --------------------------------------------

(mr/def ::metabot-instance-limit-filters
  "Which MetabotInstanceLimits a query applies to. Keys mirror the columns of `metabot_instance_limit`: `tenant_id`
  also takes a `tenant_id_set` key, matching the rows where that column is set (`true`) or null (`false`, the
  instance-wide limit)."
  [:map {:closed true}
   [:id            {:optional true} ms/PositiveInt]
   [:tenant_id     {:optional true} [:maybe ms/PositiveInt]]
   [:tenant_id_set {:optional true} :boolean]])

(mr/def ::metabot-instance-limit-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::metabot-instance-limit-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::metabot.schema/metabot-instance-limit.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::metabot.schema/metabot-instance-limit.column
                                              [:tuple ::metabot.schema/metabot-instance-limit.column [:enum :asc :desc]]]]]]])

(def ^:private instance-limit-set-columns
  "Maps the `tenant_id_set` filter key to the column whose nullness it tests."
  {:tenant_id_set :tenant_id})

(defn- instance-limit->args
  [opts]
  (u.query/opts->args opts {:set-columns instance-limit-set-columns}))

(defn- instance-limit->kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns instance-limit-set-columns}))

;;; ---- Reads ----

(mu/defn select-metabot-instance-limits :- [:sequential ::metabot.schema/metabot-instance-limit.partial]
  "The MetabotInstanceLimits matching `opts`."
  ([]
   (select-metabot-instance-limits nil))
  ([{:keys [columns] :as opts} :- [:maybe ::metabot-instance-limit-opts]]
   (apply t2/select (u.query/model-with-columns :model/MetabotInstanceLimit columns) (instance-limit->args opts))))

(mu/defn select-one-metabot-instance-limit :- [:maybe ::metabot.schema/metabot-instance-limit.partial]
  "The first MetabotInstanceLimit matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::metabot-instance-limit-opts]]
  (apply t2/select-one (u.query/model-with-columns :model/MetabotInstanceLimit columns) (instance-limit->args opts)))

;;; ---- Writes ----

(mu/defn insert-metabot-instance-limit! :- ::metabot.schema/metabot-instance-limit
  "Insert the MetabotInstanceLimit `row` and return the inserted instance."
  [row :- ::metabot.schema/metabot-instance-limit.create]
  (t2/insert-returning-instance! :model/MetabotInstanceLimit row))

(mu/defn update-metabot-instance-limits! :- :int
  "Apply `changes` to every MetabotInstanceLimit matching `opts`, returning the number updated."
  [opts    :- [:maybe ::metabot-instance-limit-opts]
   changes :- ::metabot.schema/metabot-instance-limit.update]
  (apply t2/update! :model/MetabotInstanceLimit (conj (instance-limit->kv-args opts) changes)))

(mu/defn delete-metabot-instance-limits! :- :int
  "Delete every MetabotInstanceLimit matching `opts`, returning the number deleted."
  [opts :- [:maybe ::metabot-instance-limit-opts]]
  (apply t2/delete! :model/MetabotInstanceLimit (instance-limit->args opts)))

;;; ---------------------------------------------- MetabotPermissions ----------------------------------------------
;;; MetabotPermissions gates what Metabot may reach, so anything that decides which groups a query resolves for --
;;; [[visible-groups-expr]] and its callers -- stays bespoke and must not change.

(mr/def ::metabot-permissions-filters
  "Which MetabotPermissions a query applies to. Keys mirror the columns of `metabot_permissions`."
  [:map {:closed true}
   [:id         {:optional true} ms/PositiveInt]
   [:group_id   {:optional true} ms/PositiveInt]
   [:perm_type  {:optional true} [:or :keyword :string]]
   [:perm_value {:optional true} [:or :keyword :string]]])

(mr/def ::metabot-permissions-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::metabot-permissions-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::metabot.schema/metabot-permissions.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::metabot.schema/metabot-permissions.column
                                              [:tuple ::metabot.schema/metabot-permissions.column [:enum :asc :desc]]]]]]])

;;; ---- Reads ----

(mu/defn select-metabot-permissions :- [:sequential ::metabot.schema/metabot-permissions.partial]
  "The MetabotPermissions matching `opts`."
  ([]
   (select-metabot-permissions nil))
  ([{:keys [columns] :as opts} :- [:maybe ::metabot-permissions-opts]]
   (apply t2/select (u.query/model-with-columns :model/MetabotPermissions columns) (u.query/opts->args opts))))

(mu/defn metabot-permissions-exists? :- :boolean
  "Whether a MetabotPermissions matching `opts` exists."
  [opts :- [:maybe ::metabot-permissions-opts]]
  (apply t2/exists? :model/MetabotPermissions (u.query/opts->args opts)))

;;; ---- Writes ----

(mu/defn insert-metabot-permission! :- ::metabot.schema/metabot-permissions
  "Insert the MetabotPermissions `row` and return the inserted instance."
  [row :- ::metabot.schema/metabot-permissions.create]
  (t2/insert-returning-instance! :model/MetabotPermissions row))

(mu/defn update-metabot-permissions! :- :int
  "Apply `changes` to every MetabotPermissions matching `opts`, returning the number updated."
  [opts    :- [:maybe ::metabot-permissions-opts]
   changes :- ::metabot.schema/metabot-permissions.update]
  (apply t2/update! :model/MetabotPermissions (conj (u.query/opts->kv-args opts) changes)))

;;; ---- Queries used only by the metabot module: MetabotPermissions ----

(defn- default-group-ids
  "The IDs of the groups visible only in simple mode: All Users and, on tenant instances, All tenant users."
  []
  [(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))])

(defn- visible-groups-expr
  "Matches the groups the admin UI shows in the mode selected by `advanced?`: Administrators, All Users, and All
  tenant users in simple mode, every other group in group-level mode."
  [advanced?]
  (if advanced?
    [:not-in :group_id (default-group-ids)]
    [:in :group_id (conj (default-group-ids) (u/the-id (perms/admin-group)))]))

(mu/defn select-groups
  "Every PermissionsGroup, in ID order."
  []
  (permissions.db/select-permissions-groups {:order-by [:id]}))

(mu/defn select-visible-metabot-permissions-for-user
  "The MetabotPermissions rows of the groups of the User with `user-id` that the mode selected by `advanced?` shows."
  [user-id   :- ::lib.schema.id/user
   advanced? :- :boolean]
  (t2/select :model/MetabotPermissions
             {:where [:and
                      [:in :group_id
                       ^:allow-subquery
                       {:select [:group_id]
                        :from   [(t2/table-name :model/PermissionsGroupMembership)]
                        :where  [:= :user_id user-id]}]
                      (visible-groups-expr advanced?)]}))

(mu/defn delete-hidden-metabot-permissions! :- :int
  "Delete the MetabotPermissions rows of the groups the mode selected by `advanced?` hides."
  [advanced? :- :boolean]
  (t2/delete! :model/MetabotPermissions {:where [:not (visible-groups-expr advanced?)]}))

;;; -------------------------------------------------- AiUsageLog --------------------------------------------------
;;; AiUsageLog is owned by the metabot (OSS) module; these delegate to its db.clj.

(mu/defn insert-usage-log!
  "Insert the AiUsageLog `row`."
  [row :- ::oss-metabot.schema/ai-usage-log.create]
  (metabot.db/insert-ai-usage-log! row))

(defn- usage-window-expr
  [period-start user-id tenant-id]
  [:and
   [:>= :created_at period-start]
   (when user-id [:= :user_id user-id])
   (when tenant-id [:= :tenant_id tenant-id])])

(mu/defn usage-token-sum
  "The `:sum` row of tokens logged since `period-start`, narrowed by the optional `user-id` and `tenant-id`."
  [period-start :- ms/TemporalInstant
   user-id      :- [:maybe ::lib.schema.id/user]
   tenant-id    :- [:maybe ms/PositiveInt]]
  (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                 :from   [:ai_usage_log]
                 :where  (usage-window-expr period-start user-id tenant-id)}))

(mu/defn usage-message-count
  "The `:cnt` row of messages logged since `period-start`, narrowed by the optional `user-id` and `tenant-id`."
  [period-start :- ms/TemporalInstant
   user-id      :- [:maybe ::lib.schema.id/user]
   tenant-id    :- [:maybe ms/PositiveInt]]
  (t2/query-one {:select [[[:count :*] :cnt]]
                 :from   [:ai_usage_log]
                 :where  (usage-window-expr period-start user-id tenant-id)}))

(mu/defn delete-usage-logs-created-before!
  "Delete the AiUsageLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (metabot.db/delete-ai-usage-logs-created-before! cutoff))
