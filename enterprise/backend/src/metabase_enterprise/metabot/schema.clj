(ns metabase-enterprise.metabot.schema
  "Malli schemas for the metabot module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::metabot-group-limit
  "A MetabotGroupLimit as selected from the app DB: every column of `:metabot_group_limit`."
  [:merge
   ::metabot-group-limit.update
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::metabot-group-limit.update
  "What an update (or insert) of a MetabotGroupLimit accepts: every column of `:metabot_group_limit` except `id`, all optional."
  [:map {:closed true}
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:max_usage {:optional true} [:maybe :int]]])

(mr/def ::metabot-instance-limit
  "A MetabotInstanceLimit as selected from the app DB: every column of `:metabot_instance_limit`."
  [:merge
   ::metabot-instance-limit.update
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::metabot-instance-limit.update
  "What an update (or insert) of a MetabotInstanceLimit accepts: every column of `:metabot_instance_limit` except `id`, all optional."
  [:map {:closed true}
   [:tenant_id {:optional true} [:maybe ms/PositiveInt]]
   [:max_usage {:optional true} [:maybe :int]]])

(mr/def ::metabot-permissions
  "A MetabotPermissions as selected from the app DB: every column of `:metabot_permissions`."
  [:merge
   ::metabot-permissions.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::metabot-permissions.update
  "What an update (or insert) of a MetabotPermissions accepts: every column of `:metabot_permissions` except `id`, all optional."
  [:map {:closed true}
   [:group_id   {:optional true} [:maybe ms/PositiveInt]]
   [:perm_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:perm_value {:optional true} [:maybe [:or :keyword :string]]]])
