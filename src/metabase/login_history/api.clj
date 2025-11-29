(ns metabase.login-history.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.login-history.models.login-history :as login-history]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn login-history
  "Return complete login history (sorted by most-recent -> least-recent) for `user-or-id`"
  [user-or-id]
  ;; TODO -- should this only return history in some window, e.g. last 3 months? I think for auditing purposes it's
  ;; nice to be able to see every log in that's every happened with an account. Maybe we should page this, or page the
  ;; API endpoint?
  (login-history/human-friendly-infos
   (t2/select [:model/LoginHistory :timestamp :session_id :device_description :ip_address]
              :user_id (u/the-id user-or-id)
              {:order-by [[:timestamp :desc]]})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/current"
  "Fetch recent logins for the current user."
  []
  (login-history api/*current-user-id*))
