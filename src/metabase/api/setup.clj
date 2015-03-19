(ns metabase.api.setup
  (:require [compojure.core :refer [defroutes POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [session :refer [Session]]
                             [user :refer [User set-user-password]])
            [metabase.setup :as setup]
            [metabase.util :as util]
            [metabase.util.password :as password]))


;; special endpoint for creating the first user during setup
;; this endpoint both creates the user AND logs them in and returns a session id
(defendpoint POST "/user" [:as {{:keys [token first_name last_name email password] :as body} :body}]
  ;; check our input
  (require-params token first_name last_name email password)
  (check-400 (and (util/is-email? email) (password/is-complex? password)))
  ;; the submitted token must match our setup token
  (check-403 (setup/token-match? token))
  ;; extra check.  don't continue if there is already a user in the db.
  (let [session-id (str (java.util.UUID/randomUUID))
        new-user (ins User
                   :email email
                   :first_name first_name
                   :last_name last_name
                   :password (str (java.util.UUID/randomUUID))
                   :is_superuser true)]
    ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
    (set-user-password (:id new-user) password)
    ;; clear the setup token now, it's no longer needed
    (setup/token-clear)
    ;; then we create a session right away because we want our new user logged in to continue the setup process
    (ins Session
      :id session-id
      :user_id (:id new-user))
    {:id session-id}))


(define-routes)
