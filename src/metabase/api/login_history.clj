(ns metabase.api.login-history
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.models.login-history :as login-history]))

(api/defendpoint GET "/current"
  "Fetch recent logins for the current user."
  []
  (login-history/login-history api/*current-user-id*))

(api/define-routes)
