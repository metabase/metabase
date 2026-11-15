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
  "A PermissionsGroup ID as it arrives as a JSON object key in a `PUT /graph` request body: the request middleware
  keywordizes it, so it is turned back into the string it was and has to spell the integer [[dejsonify-groups]] parses
  -- a key that doesn't is rejected here rather than throwing down there."
  [:and
   [:string {:decode/api #(cond-> % (keyword? %) name)}]
   [:re {:error/message "group ID"} #"\d+"]])

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
            [:groups   RequestGroups]]
   request]
  (api/check-superuser)
  (let [raw-groups (get-in request [:body :groups])]
    (api/check-no-dropped-entries raw-groups (:groups body))
    (doseq [[group-id perm-type->perm] (:groups body)]
      (api/check-no-dropped-entries (get raw-groups (keyword group-id)) perm-type->perm)))
  (-> body
      dejsonify-graph
      (a-perms/update-graph! force?))
  (if skip-graph?
    {:revision (perms/latest-application-permissions-revision-id)}
    (a-perms/graph)))
