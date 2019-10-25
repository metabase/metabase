(ns metabase.test.initialize.test-users
  (:require [metabase.test.data.users :as test-users]))

(defn init!
  "Force creation of the test users if they don't already exist."
  []
  (doseq [username test-users/usernames]
    ;; fetch-user will force creation of users
    (test-users/fetch-user username)))
