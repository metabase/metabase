(ns metabase.test.initialize.test-users
  (:require
   [metabase.test.data.users :as test.users]))

(defn init!
  "Force creation of the test users if they don't already exist."
  []
  (doseq [username test.users/usernames]
    ;; fetch-user will force creation of users
    (test.users/fetch-user username)
    ;; Create the session here, before a transaction opens, so it remains durable. A session created lazily
    ;; inside `with-temp` would be rolled back, causing each later request to receive a 401 and create another
    ;; session, with each attempt also updating the User's `last_login`.
    (test.users/username->token username)))
