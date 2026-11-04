(ns metabase.mcp.permissions
  "Per-group MCP tool access: each permissions group that enables MCP carries the admin's explicit `\"yes\"` or
  `\"no\"` per tool, a tool without an entry takes the default its author declared, and a user may use a tool when
  any of their groups allows it."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private access-values
  "The two things an admin can say about a tool."
  #{"yes" "no"})

(mr/def ::tool-access
  "One group's overrides: MCP tool name to `\"yes\"` or `\"no\"`. An absent name means the tool's `:default-access`."
  [:and
   (ms/string-keyed-map :string)
   ;; Checked over the whole map: the API decoder strips a `:map-of` entry whose value fails, and a dropped entry
   ;; would fall back to the tool's default instead of refusing the request.
   [:fn {:error/message "every tool must be \"yes\" or \"no\""} #(every? access-values (vals %))]])

(mr/def ::policy
  "A user's effective MCP policy: `:unrestricted`, or the [[::tool-access]] of every group of theirs that enables
  MCP and that the current permission mode shows. Empty means no access."
  [:or [:= :unrestricted] [:sequential ::tool-access]])

(mr/def ::tool
  "A registry entry, of which [[tool-allowed?]] reads the name, the author's default, and the former names."
  [:map {::mr/deliberately-open true}
   [:name           :string]
   [:default-access [:enum :allowed :denied]]
   [:renamed-from   {:optional true} [:sequential :string]]])

(def unrestricted-policy
  "The policy of a caller nothing narrows: superusers, internal callers with no current user, and every OSS user."
  :unrestricted)

(defenterprise effective-policy
  "The [[::policy]] of the User with `user-id`, folded over the groups the current permission mode shows. OSS
  allows everything."
  metabase-enterprise.mcp.permissions
  [_user-id]
  unrestricted-policy)

(mu/defn policy-for-current-user :- ::policy
  "The [[::policy]] of `api/*current-user-id*`. Superusers and internal callers (no current user) are unrestricted."
  []
  (if (or (nil? api/*current-user-id*) api/*is-superuser?*)
    unrestricted-policy
    (effective-policy api/*current-user-id*)))

(mu/defn enabled? :- :boolean
  "Whether `policy` lets its user connect to the MCP server at all."
  [policy :- ::policy]
  (boolean (or (= unrestricted-policy policy) (seq policy))))

(mu/defn- group-allows? :- :boolean
  "Whether one group's `tool-access` lets its members use `tool`: its entry under the tool's name, else under the
  first `:renamed-from` name it holds, else the tool's `:default-access`."
  [tool-access :- ::tool-access
   {tool-name :name :keys [default-access renamed-from]} :- ::tool]
  (if-let [access (some tool-access (cons tool-name renamed-from))]
    (= "yes" access)
    (= :allowed default-access)))

(mu/defn tool-allowed? :- :boolean
  "Whether `policy` lets its user see and call the registry entry `tool`: unrestricted, or some group allows it."
  [policy :- ::policy
   tool   :- ::tool]
  (boolean (or (= unrestricted-policy policy)
               (some #(group-allows? % tool) policy))))
