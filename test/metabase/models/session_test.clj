(ns metabase.models.session-test
  (:require [expectations :refer :all]
            metabase.db
            (metabase.models [session :refer :all]
                             [user :refer [User]])
            [metabase.test.util :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]))

(resolve-private-vars metabase.db simple-insert-many!)
;; first-session-for-user
(expect
  "the-greatest-day-ever"
  (with-temp User [{user-id :id} {:first_name (random-name)
                                  :last_name  (random-name)
                                  :email      (str (random-name) "@metabase.com")
                                  :password   "nada"}]
    (simple-insert-many! Session
      [{:id         "the-greatest-day-ever"
        :user_id    user-id
        :created_at (u/->Timestamp "1980-10-19T05:05:05.000Z")}
       {:id         "even-more-greatness"
        :user_id    user-id
        :created_at (u/->Timestamp "1980-10-19T05:08:05.000Z")}
       {:id         "the-world-of-bi-changes-forever"
        :user_id    user-id
        :created_at (u/->Timestamp "2015-10-21")}
       {:id         "something-could-have-happened"
        :user_id    user-id
        :created_at (u/->Timestamp "1999-12-31")}
       {:id         "now"
        :user_id    user-id
        :created_at (u/new-sql-timestamp)}])
    (first-session-for-user user-id)))
