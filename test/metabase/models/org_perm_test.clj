(ns metabase.models.org-perm-test
  (:require [clojure.tools.logging :as log]
            [metabase.test-utils :refer [setup-db]]
            [metabase.db :refer :all]
            [metabase.models.org-perm :refer [OrgPerm]]
            [metabase.models.org :refer [Org]]
            [metabase.models.user :refer [User]]
            [korma.core :refer :all]
            [expectations :refer :all]
            [clj-time.core :as time]
            [clj-time.coerce :as tc]))


(defn insert-org []
  (let [result (ins Org
                 :name "org_perm_test"
                 :slug "org_perm_test"
                 :inherits false)]
    (or (:id result) -1)))

(defn insert-user []
  (let [result (ins User
                 :email "org_perm_test"
                 :first_name "org_perm_test"
                 :last_name "org_perm_test"
                 :password "org_perm_test"
                 :date_joined (java.sql.Timestamp. (tc/to-long (time/now)))
                 :is_active true
                 :is_staff true
                 :is_superuser false)]
    (or (:id result) -1)))

(defn count-perms []
  (get-in (first (select OrgPerm (aggregate (count :*) :cnt))) [:cnt]))


; start with 0 entries
(expect 0 (count-perms))

; insert a new value
(expect (more->
          false nil?
          true (contains? :id))
  (let [org-id (insert-org)
        user-id (insert-user)]
    (ins OrgPerm
      :admin false
      :organization_id org-id
      :user_id user-id)))

; now we should have 1 entry
(expect 1 (count-perms))
