(ns metabase.api.login-history
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.models.login-history :as login-history :refer [LoginHistory]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn login-history
  "Return complete login history (sorted by most-recent -> least-recent) for `user-or-id`"
  [user-or-id]
  ;; TODO -- should this only return history in some window, e.g. last 3 months? I think for auditing purposes it's
  ;; nice to be able to see every log in that's every happened with an account. Maybe we should page this, or page the
  ;; API endpoint?
  (login-history/human-friendly-infos
   (t2/select [LoginHistory :timestamp :session_id :device_description :ip_address]
              :user_id (u/the-id user-or-id)
              {:order-by [[:timestamp :desc]]})))

(api/defendpoint GET "/current"
  "Fetch recent logins for the current user."
  []
  (login-history api/*current-user-id*))

(api/define-routes)
