(ns metabase.api.transform
  (:require
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.permissions :as perms]
   [metabase.transforms.core :as tf]
   [metabase.transforms.specs :as tf.specs]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:db-id/:schema/:transform-name"
  "Look up a database schema transform"
  [db-id schema transform-name]
  (api/check-403 (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                   (perms/data-perms-path db-id schema)))
  (->> @tf.specs/transform-specs
       (m/find-first (comp #{transform-name} :name))
       (tf/apply-transform! db-id schema)))

(api/define-routes)
