(ns metabase.api.setup
  (:require [compojure.core :refer [defroutes POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [session :refer [Session]]
                             [user :refer [User set-user-password]])
            [metabase.setup :as setup]
            [metabase.util :as util]))

(defannotation SetupToken
  "Check that param matches setup token or throw a 403."
  [symb value]
  (checkp-with setup/token-match? symb value "Token does not match the setup token."))


(defendpoint POST "/user"
  "Special endpoint for creating the first user during setup.
   This endpoint both creates the user AND logs them in and returns a session ID."
  [:as {{:keys [token first_name last_name email password] :as body} :body, :as request}]
  {first_name [Required NonEmptyString]
   last_name  [Required NonEmptyString]
   email      [Required Email]
   password   [Required ComplexPassword]
   token      [Required SetupToken]}
  ;; Call (metabase.core/site-url request) to set the Site URL setting if it's not already set
  (@(ns-resolve 'metabase.core 'site-url) request)
  ;; Now create the user
  (let [session-id (str (java.util.UUID/randomUUID))
        new-user   (ins User
                     :email        email
                     :first_name   first_name
                     :last_name    last_name
                     :password     (str (java.util.UUID/randomUUID))
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
