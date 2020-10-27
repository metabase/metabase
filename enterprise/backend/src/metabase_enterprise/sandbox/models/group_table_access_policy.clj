(ns metabase-enterprise.sandbox.models.group-table-access-policy
  "Model definition for Group Table Access Policy, aka GTAP. A GTAP is useed to control access to a certain Table for a
  certain PermissionsGroup. Whenever a member of that group attempts to query the Table in question, a Saved Question
  specified by the GTAP is instead used as the source of the query."
  (:require [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.normalize :as normalize]
            [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel GroupTableAccessPolicy :group_table_access_policy)

(defn- normalize-attribute-remapping-targets [attribute-remappings]
  (m/map-vals
   (fn [target]
     (if (map? target)
       (normalize/normalize-tokens (walk/keywordize-keys target) [:parameters :metabase.mbql.normalize/sequence])
       (normalize/normalize-tokens target :ignore-path)))
   attribute-remappings))

;; for GTAPs
(models/add-type! ::attribute-remappings
  :in  (comp i/json-in normalize-attribute-remapping-targets)
  :out (comp normalize-attribute-remapping-targets i/json-out-without-keywordization))

(u/strict-extend (class GroupTableAccessPolicy)
  models/IModel
  (merge
   models/IModelDefaults
   {:types (constantly {:attribute_remappings ::attribute-remappings})})

  ;; only admins can work with GTAPs
  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:can-read?  i/superuser?
    :can-write? i/superuser?}))
