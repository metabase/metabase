(ns metabase.models.user-test
  (:require [clojure.tools.logging :as log]
            [metabase.db :refer :all]
            [metabase.config :refer [app-defaults]]
            [metabase.models.user :refer [User]]
            [korma.core :refer :all]
            [midje.sweet :refer :all]
            [clj-time.core :as time]
            [clj-time.coerce :as tc]))


(defn count-users []
  (get-in (first (select User (aggregate (count :*) :cnt))) [:cnt]))


(facts "about User model"
  (with-state-changes [(before :facts (migrate :up))
                       (after :facts (migrate :down))]
    (fact "starts with 0 entries"
      (count-users) => 0)
    (fact "can insert new entries"
      (let [result (insert User (values {:email "user_test"
                                         :first_name "user_test"
                                         :last_name "user_test"
                                         :password "user_test"
                                         :date_joined (java.sql.Timestamp. (tc/to-long (time/now)))
                                         :is_active true
                                         :is_staff true
                                         :is_superuser false}))]
        (nil? result) => false
        (> (or (:generated_key result) ((keyword "scope_identity()") result) -1) 0) => true)
      (count-users) => 1)
    ))
