(ns metabase.models.session-test
  (:require [expectations :refer :all]
            [metabase.models
             [session :refer :all]
             [user :refer [User]]]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; first-session-for-user
(expect
  "the-greatest-day-ever"
  (tt/with-temp User [{user-id :id} {:first_name (tu/random-name)
                                     :last_name  (tu/random-name)
                                     :email      (str (tu/random-name) "@metabase.com")
                                     :password   "nada"}]
    (db/simple-insert-many! Session
      [{:id         "the-greatest-day-ever"
        :user_id    user-id
        :created_at (du/->Timestamp #inst "1980-10-19T05:05:05.000Z")}
       {:id         "even-more-greatness"
        :user_id    user-id
        :created_at (du/->Timestamp #inst "1980-10-19T05:08:05.000Z")}
       {:id         "the-world-of-bi-changes-forever"
        :user_id    user-id
        :created_at (du/->Timestamp #inst "2015-10-21")}
       {:id         "something-could-have-happened"
        :user_id    user-id
        :created_at (du/->Timestamp #inst "1999-12-31")}
       {:id         "now"
        :user_id    user-id
        :created_at (du/new-sql-timestamp)}])
    (first-session-for-user user-id)))
