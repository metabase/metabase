(ns metabase-enterprise.metabot.schema
  "Malli schemas for the metabot module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::metabot-group-limit
  "A MetabotGroupLimit as selected from the app DB: every column of `:metabot_group_limit`."
  [:merge
   ::metabot-group-limit.columns
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::metabot-group-limit.columns
  "What an update (or insert) of a MetabotGroupLimit accepts: every column of `:metabot_group_limit` except `id`, all optional."
  [:map {:closed true}
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:max_usage {:optional true} [:maybe :int]]])

(mr/def ::metabot-group-limit.create
  "What an insert of a MetabotGroupLimit accepts."
  (mut/select-keys (mr/schema ::metabot-group-limit.columns) [:group_id :max_usage]))

(mr/def ::metabot-group-limit.update
  "What an update of a MetabotGroupLimit accepts: no immutable columns. `:group_id` is stamped once on insert and
  never rewritten."
  (mut/select-keys (mr/schema ::metabot-group-limit.columns) [:max_usage]))

(mr/def ::metabot-group-limit.partial
  "A MetabotGroupLimit row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-group-limit [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-group-limit.column
  "A column of `:metabot_group_limit`, for the `:columns` option of the queries in
  [[metabase-enterprise.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-group-limit.columns))))

(mr/def ::metabot-instance-limit
  "A MetabotInstanceLimit as selected from the app DB: every column of `:metabot_instance_limit`."
  [:merge
   ::metabot-instance-limit.columns
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::metabot-instance-limit.columns
  "What an update (or insert) of a MetabotInstanceLimit accepts: every column of `:metabot_instance_limit` except
  `id`, all optional."
  [:map {:closed true}
   [:tenant_id {:optional true} [:maybe ms/PositiveInt]]
   [:max_usage {:optional true} [:maybe :int]]])

(mr/def ::metabot-instance-limit.create
  "What an insert of a MetabotInstanceLimit accepts."
  (mut/select-keys (mr/schema ::metabot-instance-limit.columns) [:tenant_id :max_usage]))

(mr/def ::metabot-instance-limit.update
  "What an update of a MetabotInstanceLimit accepts: no immutable columns. `:tenant_id` is stamped once on insert and
  never rewritten."
  (mut/select-keys (mr/schema ::metabot-instance-limit.columns) [:max_usage]))

(mr/def ::metabot-instance-limit.partial
  "A MetabotInstanceLimit row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-instance-limit [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-instance-limit.column
  "A column of `:metabot_instance_limit`, for the `:columns` option of the queries in
  [[metabase-enterprise.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-instance-limit.columns))))

(mr/def ::metabot-permissions
  "A MetabotPermissions as selected from the app DB: every column of `:metabot_permissions`."
  [:merge
   ::metabot-permissions.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::metabot-permissions.columns
  "What an update (or insert) of a MetabotPermissions accepts: every column of `:metabot_permissions` except `id`,
  all optional."
  [:map {:closed true}
   [:group_id   {:optional true} [:maybe ms/PositiveInt]]
   [:perm_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:perm_value {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::metabot-permissions.create
  "What an insert of a MetabotPermissions accepts."
  (mut/select-keys (mr/schema ::metabot-permissions.columns) [:group_id :perm_type :perm_value]))

(mr/def ::metabot-permissions.update
  "What an update of a MetabotPermissions accepts: no immutable columns. `:group_id` and `:perm_type` are stamped
  once on insert and never rewritten."
  (mut/select-keys (mr/schema ::metabot-permissions.columns) [:perm_value]))

(mr/def ::metabot-permissions.partial
  "A MetabotPermissions row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::metabot-permissions [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::metabot-permissions.column
  "A column of `:metabot_permissions`, for the `:columns` option of the queries in
  [[metabase-enterprise.metabot.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::metabot-permissions.columns))))
