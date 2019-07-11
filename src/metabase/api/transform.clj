(ns metabase.api.transform
  (:require [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.transforms
             [core :as transform]
             [specs :as transform.specs]]))

(api/defendpoint GET "/:db-id/:schema/:transform-name"
  [db-id schema transform-name]
  (->> @transform.specs/transform-specs
       (m/find-first (comp #{transform-name} :name))
       (transform/apply-transform! db-id schema)))

(api/define-routes)
