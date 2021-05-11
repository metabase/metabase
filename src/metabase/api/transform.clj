(ns metabase.api.transform
  (:require [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.transforms.core :as transform]
            [metabase.transforms.specs :as transform.specs]
            [metabase.util.i18n :refer [tru]]))

(api/defendpoint GET "/:db-id/:schema/:transform-name"
  "Look up a database schema transform"
  [db-id schema transform-name]
  (api/check-403 (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                                  (perms/object-path db-id schema)))
  (let [matching-spec (or (m/find-first (comp #{transform-name} :name)
                                        @transform.specs/transform-specs)
                          (throw (ex-info (tru "No transform with that name")
                                          {:status-code    404
                                           :transform-name transform-name
                                           :valid-names    (map :name @transform.specs/transform-specs)})))]
    (or (transform/apply-transform! db-id schema matching-spec)
        (throw (ex-info (tru "apply-transform! returned no result")
                        {:status-code 500
                         :transform   matching-spec})))))

(api/define-routes)
