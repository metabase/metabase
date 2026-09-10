(ns metabase-enterprise.advanced-permissions.api.application
  "`/advanced-permissions/application` Routes.
  Implements the Permissions routes needed for application permission - a class of permissions that control access to
  features like access Setting pages, access monitoring tools ... etc"
  (:require
   [metabase-enterprise.advanced-permissions.models.permissions.application-permissions :as a-perms]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/graph"
  "Fetch a graph of Application Permissions."
  []
  (api/check-superuser)
  (a-perms/graph))

(defn- dejsonify-application-permissions
  [application-permissions]
  (into {} (for [[perm-type perm-value] application-permissions]
             [perm-type (keyword perm-value)])))

(defn- dejsonify-groups
  [groups]
  (into {} (for [[group-id application-permissions] groups]
             [(Integer/parseInt (name group-id))
              (dejsonify-application-permissions application-permissions)])))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"yes\"` to `:yes` and
  parsing object keys keyword."
  [graph]
  (update graph :groups dejsonify-groups))

(def ^:private RequestGroupId
  "A PermissionsGroup ID as it arrives in a `PUT /graph` request body. JSON object keys are keywordized by the request
  middleware, so a group ID shows up as `:1` rather than `1`. [[dejsonify-groups]] parses the name back into an
  integer, so a key that doesn't spell one has to be rejected here -- it would throw rather than 400 down there."
  [:and
   ms/KeywordOrString
   [:fn
    {:error/message "group ID"}
    (fn group-id-name? [k] (boolean (re-matches #"\d+" (name k))))]])

(def ^:private RequestGroups
  "The `:groups` half of an application permissions graph as it arrives in a `PUT /graph` request body: group ID ->
  permission type -> permission. [[dejsonify-graph]] turns the values into keywords right after this schema runs."
  [:map-of
   RequestGroupId
   [:map-of
    [:enum :setting :monitoring :subscription]
    (ms/enum-keywords-and-strings :yes :no)]])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/graph"
  "Do a batch update of Application Permissions by passing a modified graph."
  [_route-params
   {skip-graph? :skip-graph
    force? :force} :- [:map {:closed true}
                       [:skip-graph {:default false} [:maybe ms/BooleanValue]]
                       [:force      {:default false} [:maybe ms/BooleanValue]]]
   body :- [:map {:closed true}
            [:revision {:optional true} [:maybe ms/Int]]
            [:force    {:optional true} [:maybe :boolean]]
            [:groups   RequestGroups]]]
  (api/check-superuser)
  (-> body
      dejsonify-graph
      (a-perms/update-graph! force?))
  (if skip-graph?
    {:revision (perms/latest-application-permissions-revision-id)}
    (a-perms/graph)))
