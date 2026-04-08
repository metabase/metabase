(ns metabase-enterprise.metabot.api.usage
  "`/api/ee/ai-controls/usage` routes"
  (:require
   [metabase-enterprise.metabot.models.metabot-group-limit :as group-limit]
   [metabase-enterprise.metabot.models.metabot-instance-limit :as instance-limit]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(defn- without-id [row]
  (some-> row (dissoc :id)))

(api.macros/defendpoint :get "/instance"
  :- [:map [:max_usage [:maybe nat-int?]]]
  "Get the instance-wide metabot usage limit. Returns `max_usage: null` if no limit is set (unlimited)."
  []
  (api/check-superuser)
  (or (some-> (instance-limit/instance-limit nil) (dissoc :id :tenant_id))
      {:max_usage nil}))

(api.macros/defendpoint :put "/instance"
  :- [:map [:max_usage [:maybe nat-int?]]]
  "Set or update the instance-wide metabot usage limit. Pass `max_usage: null` to remove the limit (unlimited)."
  [_route-params
   _query-params
   body :- [:map [:max_usage [:maybe nat-int?]]]]
  (api/check-superuser)
  (or (some-> (instance-limit/set-instance-limit! nil (:max_usage body)) (dissoc :id :tenant_id))
      {:max_usage nil}))

(api.macros/defendpoint :get "/tenant"
  :- [:sequential [:map [:tenant_id pos-int?] [:max_usage nat-int?]]]
  "Get all tenant-level metabot usage limits."
  []
  (api/check-superuser)
  (mapv without-id (instance-limit/all-tenant-limits)))

(api.macros/defendpoint :get "/tenant/:tenant-id"
  :- [:map [:tenant_id pos-int?] [:max_usage [:maybe nat-int?]]]
  "Get the metabot usage limit for a specific tenant. Returns `max_usage: null` if no limit is set."
  [{:keys [tenant-id]} :- [:map [:tenant-id pos-int?]]]
  (api/check-superuser)
  (or (without-id (instance-limit/instance-limit tenant-id))
      {:tenant_id tenant-id :max_usage nil}))

(api.macros/defendpoint :put "/tenant/:tenant-id"
  :- [:map [:tenant_id pos-int?] [:max_usage [:maybe nat-int?]]]
  "Set or update the metabot usage limit for a specific tenant. Pass `max_usage: null` to remove the limit."
  [{:keys [tenant-id]} :- [:map [:tenant-id pos-int?]]
   _query-params
   body :- [:map [:max_usage [:maybe nat-int?]]]]
  (api/check-superuser)
  (or (without-id (instance-limit/set-instance-limit! tenant-id (:max_usage body)))
      {:tenant_id tenant-id :max_usage nil}))

(api.macros/defendpoint :get "/group"
  :- [:sequential [:map [:group_id pos-int?] [:max_usage nat-int?]]]
  "Get all group-level metabot usage limits."
  []
  (api/check-superuser)
  (mapv without-id (group-limit/all-group-limits)))

(api.macros/defendpoint :get "/group/:group-id"
  :- [:map [:group_id pos-int?] [:max_usage [:maybe nat-int?]]]
  "Get the metabot usage limit for a specific group. Returns `max_usage: null` if no limit is set."
  [{:keys [group-id]} :- [:map [:group-id pos-int?]]]
  (api/check-superuser)
  (or (without-id (group-limit/group-limit group-id))
      {:group_id group-id :max_usage nil}))

(api.macros/defendpoint :put "/group/:group-id"
  :- [:map [:group_id pos-int?] [:max_usage [:maybe nat-int?]]]
  "Set or update the metabot usage limit for a specific group. Pass `max_usage: null` to remove the limit."
  [{:keys [group-id]} :- [:map [:group-id pos-int?]]
   _query-params
   body :- [:map [:max_usage [:maybe nat-int?]]]]
  (api/check-superuser)
  (or (without-id (group-limit/set-group-limit! group-id (:max_usage body)))
      {:group_id group-id :max_usage nil}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-controls/usage` routes."
  (api.macros/ns-handler *ns* +auth))
