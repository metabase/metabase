(ns metabase.models.session-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Session User]]
            [metabase.models.session :as session]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest first-session-for-user-test
  (tt/with-temp User [{user-id :id} {:first_name (tu/random-name)
                                     :last_name  (tu/random-name)
                                     :email      (str (tu/random-name) "@metabase.com")
                                     :password   "nada"}]
    (db/simple-insert-many! Session
      [{:id         "the-greatest-day-ever"
        :user_id    user-id
        :created_at #t "1980-10-19T05:05:05.000Z"}
       {:id         "even-more-greatness"
        :user_id    user-id
        :created_at #t "1980-10-19T05:08:05.000Z"}
       {:id         "the-world-of-bi-changes-forever"
        :user_id    user-id
        :created_at #t "2015-10-21"}
       {:id         "something-could-have-happened"
        :user_id    user-id
        :created_at #t "1999-12-31"}
       {:id         "now"
        :user_id    user-id
        :created_at :%now}])
    (is (= "the-greatest-day-ever"
           (session/first-session-for-user user-id)))))
