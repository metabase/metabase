(ns metabase.api.transform
  (:require [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.transforms
             [core :as transform]
             [specs :as transform.specs]]))

(api/defendpoint GET "/:db-id/:schema/:transform-name"
  "Look up a database schema transform"
  [db-id schema transform-name]
  (api/check-403 (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                   (perms/object-path db-id schema)))
  (->> @transform.specs/transform-specs
       (m/find-first (comp #{transform-name} :name))
       (transform/apply-transform! db-id schema)))

(api/define-routes)
