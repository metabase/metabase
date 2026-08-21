(ns metabase.test.initialize.test-users
  (:require
   [metabase.test.data.users :as test.users]))

(defn init!
  "Force creation of the test users if they don't already exist."
  []
  (doseq [username test.users/usernames]
    ;; fetch-user will force creation of users
    (test.users/fetch-user username)
    ;; Mint the session here too, where nothing has opened a transaction yet, so it is durable. Minted
    ;; lazily inside a `with-temp` it would be rolled back with the scope, and every later request would
    ;; 401 and mint another one -- each of which updates the user's `last_login`.
    (test.users/username->token username)))
