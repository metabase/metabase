(ns metabase.api.transform
  (:require
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.permissions :as perms]
   [metabase.transforms.core :as tf]
   [metabase.transforms.specs :as tf.specs]
   [metabase.util.malli.schema :as ms]))

(api/defendpoint GET "/:db-id/:schema/:transform-name"
  "Look up a database schema transform"
  [db-id schema transform-name]
  {db-id          ms/PositiveInt
   schema         ms/NonBlankString
   transform-name ms/NonBlankString}
  (api/check-403 (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                   (perms/data-perms-path db-id schema)))
  (->> @tf.specs/transform-specs
       (m/find-first (comp #{transform-name} :name))
       (tf/apply-transform! db-id schema)))

(api/define-routes)
