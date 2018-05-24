(ns metabase.events.last-login-test
  (:require [expectations :refer :all]
            [metabase.events.last-login :refer [process-last-login-event]]
            [metabase.models.user :refer [User]]
            [toucan.util.test :as tt]))

;; `:user-login` event
(expect
  {:orig-last-login nil
   :upd-last-login  false}
  (tt/with-temp User [{user-id :id, last-login :last_login}]
    (process-last-login-event {:topic :user-login
                               :item  {:user_id    user-id
                                       :session_id "doesntmatter"}})
    (let [user (User :id user-id)]
      {:orig-last-login last-login
       :upd-last-login  (nil? (:last_login user))})))
