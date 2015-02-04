(ns metabase.models.org-perm-test
  (:require [clojure.tools.logging :as log]
            [metabase.test-util :as util]
            [metabase.db :refer :all]
            [metabase.config :refer [app-defaults]]
            [metabase.models.org-perm :refer [OrgPerm]]
            [metabase.models.org :refer [Org]]
            [metabase.models.user :refer [User]]
            [korma.core :refer :all]
            [midje.sweet :refer :all]
            [clj-time.core :as time]
            [clj-time.coerce :as tc]))


(defn insert-org []
  (let [result (insert Org (values {:name "testtest"
                                    :slug "test"
                                    :inherits false}))]
    (or (:generated_key result) ((keyword "scope_identity()") result) -1)))

(defn insert-user []
  (let [result (insert User (values {:email "testtest"
                                     :first_name "test"
                                     :last_name "test"
                                     :password "test"
                                     :date_joined (java.sql.Timestamp. (tc/to-long (time/now)))
                                     :is_active true
                                     :is_staff true
                                     :is_superuser false}))]
    (or (:generated_key result) ((keyword "scope_identity()") result) -1)))

(defn count-perms []
  (get-in (first (select OrgPerm (aggregate (count :*) :cnt))) [:cnt]))


(facts "about OrgPerm model"
  (with-state-changes [(before :facts (util/liquibase-up))
                       (after :facts (util/liquibase-down))]
    (fact "starts with 0 entries"
      (count-perms) => 0)
    (fact "can insert new entries"
      (let [org-id (insert-org)
            user-id (insert-user)
            result (insert OrgPerm (values {:admin false
                                            :organization_id org-id
                                            :user_id user-id}))]
        (nil? result) => false
        (> (or (:generated_key result) ((keyword "scope_identity()") result) -1) 0) => true)
      (count-perms) => 1)
    ))
