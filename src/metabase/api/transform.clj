(ns metabase.api.transform
  (:require
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.data-permissions :as data-perms]
   [metabase.transforms.core :as tf]
   [metabase.transforms.specs :as tf.specs]
   [metabase.util.malli.schema :as ms]))

(api/defendpoint GET "/:db-id/:schema/:transform-name"
  "Look up a database schema transform"
  [db-id schema transform-name]
  {db-id          ms/PositiveInt
   schema         ms/NonBlankString
   transform-name ms/NonBlankString}
  (api/check-403
   (= (data-perms/full-schema-permission-for-user api/*current-user-id*
                                                  :perms/data-access
                                                  db-id
                                                  schema)
      :unrestricted))
  (->> @tf.specs/transform-specs
       (m/find-first (comp #{transform-name} :name))
       (tf/apply-transform! db-id schema)))

(api/define-routes)
