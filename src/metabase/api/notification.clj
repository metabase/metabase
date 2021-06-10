(ns metabase.api.notification
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.notification :as notification]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.hydrate :as hydrate]))

(api/defendpoint GET "/"
  "All notifications for the current user"
  []
  (hydrate/hydrate (notification/for-user api/*current-user-id*) [:notifier :moderated_item]))

(api/define-routes)
