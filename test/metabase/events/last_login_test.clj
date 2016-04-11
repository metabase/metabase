(ns metabase.events.last-login-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.events.last-login :refer :all]
            (metabase.models [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first random-name]]
            [metabase.test-setup :refer :all]))


(defn- create-test-user []
  (let [rand-name (random-name)]
    (db/ins User
      :email      (str rand-name "@metabase.com")
      :first_name rand-name
      :last_name  rand-name
      :password   rand-name)))


;; `:user-login` event
(expect-let [{user-id :id last-login :last_login} (create-test-user)]
  {:orig-last-login nil
   :upd-last-login  false}
  (do
    (process-last-login-event {:topic :user-login
                               :item  {:user_id    user-id
                                       :session_id "doesntmatter"}})
    (let [user (db/sel :one User :id user-id)]
      {:orig-last-login last-login
       :upd-last-login  (nil? (:last_login user))})))
