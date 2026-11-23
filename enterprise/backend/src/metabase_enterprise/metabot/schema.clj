(ns metabase-enterprise.metabot.schema
  "Malli schemas for the metabot module."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::metabot-limit.max-usage
  "The `:max_usage` of a Metabot usage limit: a non-negative integer, or nil for no limit."
  [:maybe [:int {:min 0}]])

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
   [:max_usage {:optional true} ::metabot-limit.max-usage]])

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
   [:max_usage {:optional true} ::metabot-limit.max-usage]])

(mr/def ::metabot-permissions.perm-type
  "The `:perm_type` of a MetabotPermissions: one of the Metabot permission types."
  (into [:enum {:decode/normalize keyword}] (sort scope/perm-types)))

(mr/def ::metabot-permissions.perm-value
  "The `:perm_value` of a MetabotPermissions: a value some Metabot permission type takes."
  (into [:enum {:decode/normalize keyword}] (distinct (mapcat (comp :values val) scope/metabot-permissions))))

(defn check-perm-value-fits-type
  "Returns `row`, a MetabotPermissions or a part of one, or throws a 400 when it holds both `:perm_type` and `:perm_value`
  and the value is not one of the values of the type."
  [{:keys [perm_type perm_value] :as row}]
  (when (and (map? row)
             (contains? row :perm_type)
             (contains? row :perm_value)
             (not (some #{(some-> perm_value keyword)}
                        (get-in scope/metabot-permissions [(some-> perm_type keyword) :values]))))
    (throw (ex-info (tru "Invalid perm_value {0} for perm_type {1}." (some-> perm_value name) (some-> perm_type name))
                    {:status-code 400})))
  row)

(mr/def ::metabot-permissions
  "A MetabotPermissions as selected from the app DB: every column of `:metabot_permissions`."
  [:merge
   ::metabot-permissions.update
   [:map {:closed true}
    [:id ms/PositiveInt]]])

(mr/def ::metabot-permissions.update
  "What an update (or insert) of a MetabotPermissions accepts: every column of `:metabot_permissions` except `id`, all
  optional, whose `:perm_value` is one of the values of its `:perm_type`."
  [:map {:closed true, :decode/normalize {:leave check-perm-value-fits-type}}
   [:group_id   {:optional true} [:maybe ms/PositiveInt]]
   [:perm_type  {:optional true} ::metabot-permissions.perm-type]
   [:perm_value {:optional true} ::metabot-permissions.perm-value]])
