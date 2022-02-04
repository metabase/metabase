(ns metabase.test.initialize.test-users-personal-collections
  (:require [metabase.models.collection :as collection]
            [metabase.test.data.users :as test-users]))

(defn init!
  "Force the creation of the Personal Collections for our various test users. They are eventually going to get
  automatically created anyway as soon as those Users' permissions get calculated in `user/permissions-set`; better to
  do it now so the test results will be consistent."
  []
  (doseq [username test-users/usernames]
    (collection/user->personal-collection (test-users/user->id username))))
