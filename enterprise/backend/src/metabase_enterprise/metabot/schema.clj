(ns metabase-enterprise.metabot.schema
  "Malli schemas for the metabot module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::metabot-group-limit
  "A MetabotGroupLimit as selected from the app DB: every column of `:metabot_group_limit`."
  [:map {:closed true}
   [:id        ms/PositiveInt]
   [:group_id  ms/PositiveInt]
   [:max_usage :int]])

(mr/def ::metabot-group-limit.update
  "What an update (or insert) of a MetabotGroupLimit accepts: every column of `:metabot_group_limit` except `id`, all optional."
  [:map {:closed true}
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:max_usage {:optional true} [:maybe :int]]])

(mr/def ::metabot-instance-limit
  "A MetabotInstanceLimit as selected from the app DB: every column of `:metabot_instance_limit`."
  [:map {:closed true}
   [:id        ms/PositiveInt]
   [:tenant_id [:maybe ms/PositiveInt]]
   [:max_usage [:maybe :int]]])

(mr/def ::metabot-instance-limit.update
  "What an update (or insert) of a MetabotInstanceLimit accepts: every column of `:metabot_instance_limit` except `id`, all optional."
  [:map {:closed true}
   [:tenant_id {:optional true} [:maybe ms/PositiveInt]]
   [:max_usage {:optional true} [:maybe :int]]])

(mr/def ::metabot-permissions
  "A MetabotPermissions as selected from the app DB: every column of `:metabot_permissions`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:group_id   ms/PositiveInt]
   [:perm_type  [:or :keyword :string]]
   [:perm_value [:or :string :map sequential?]]])

(mr/def ::metabot-permissions.update
  "What an update (or insert) of a MetabotPermissions accepts: every column of `:metabot_permissions` except `id`, all optional."
  [:map {:closed true}
   [:group_id   {:optional true} [:maybe ms/PositiveInt]]
   [:perm_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:perm_value {:optional true} [:maybe [:or :string :map sequential?]]]])
