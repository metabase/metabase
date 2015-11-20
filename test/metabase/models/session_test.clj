(ns metabase.models.session-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.models.session :refer :all]
            [metabase.test.data.users :refer :all]))

;; first-session-for-user
(expect
  "the-greatest-day-ever"
  (do
    (k/insert Session
              (k/values [{:id         "the-greatest-day-ever"
                          :user_id    (user->id :rasta)
                          :created_at (metabase.util/->Timestamp "1980-10-19")}
                         {:id         "the-world-of-bi-changes-forever"
                          :user_id    (user->id :rasta)
                          :created_at (metabase.util/->Timestamp "2015-10-21")}
                         {:id         "something-could-have-happened"
                          :user_id    (user->id :rasta)
                          :created_at (metabase.util/->Timestamp "1999-12-31")}
                         {:id         "now"
                          :user_id    (user->id :rasta)
                          :created_at (metabase.util/new-sql-timestamp)}]))
    (first-session-for-user (user->id :rasta))))
