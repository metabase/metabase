(ns metabase.models.org-perm-test
  (:require [clojure.tools.logging :as log]
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
  (println "getting called")
  (let [result (insert Org (values {:name "org_perm_test"
                                    :slug "org_perm_test"
                                    :inherits false}))]
    (or (:generated_key result) ((keyword "scope_identity()") result) -1)))

(defn insert-user []
  (let [result (insert User (values {:email "org_perm_test"
                                     :first_name "org_perm_test"
                                     :last_name "org_perm_test"
                                     :password "org_perm_test"
                                     :date_joined (java.sql.Timestamp. (tc/to-long (time/now)))
                                     :is_active true
                                     :is_staff true
                                     :is_superuser false}))]
    (or (:generated_key result) ((keyword "scope_identity()") result) -1)))

(defn count-perms []
  (get-in (first (select OrgPerm (aggregate (count :*) :cnt))) [:cnt]))


(facts "about OrgPerm model"
  (with-state-changes [(before :facts (migrate :up))
                       (after :facts (migrate :down))]
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
