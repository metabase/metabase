(ns metabase.models.user-test
  (:require [clojure.tools.logging :as log]
            [metabase.test-utils :refer [setup-test-db]]
            [metabase.db :refer :all]
            [metabase.models.user :refer [User]]
            [korma.core :refer :all]
            [expectations :refer :all]
            [clj-time.core :as time]
            [clj-time.coerce :as tc]))


;(defn count-users []
;  (get-in (first (select User (aggregate (count :*) :cnt))) [:cnt]))
;
;
;; start with 0 entries
;(expect 0 (count-users))
;
;; insert a new value
;(expect (more->
;          false nil?
;          true (contains? :id))
;  (ins User
;    :email "user_test"
;    :first_name "user_test"
;    :last_name "user_test"
;    :password "user_test"
;    :date_joined (java.sql.Timestamp. (tc/to-long (time/now)))
;    :is_active true
;    :is_staff true
;    :is_superuser false))
;
;; now we should have 1 entry
;(expect 1 (count-users))