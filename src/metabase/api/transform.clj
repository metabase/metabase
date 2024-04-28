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
   (and (= (data-perms/full-db-permission-for-user api/*current-user-id*
                                                   :perms/view-data
                                                   db-id)
           :unrestricted)
        (contains? #{:query-builder-and-native :query-builder}
                   (data-perms/full-schema-permission-for-user api/*current-user-id*
                                                               :perms/create-queries
                                                               db-id
                                                               schema))))
  (->> @tf.specs/transform-specs
       (m/find-first (comp #{transform-name} :name))
       (tf/apply-transform! db-id schema)))

(api/define-routes)
