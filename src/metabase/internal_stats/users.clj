(ns metabase.internal-stats.users
  (:require
   [metabase.app-db.core :as db]
   [toucan2.core :as t2]))

(defn email-domain-count
  "Count all unique normalized domains found in active user emails"
  []
  (:count (t2/query-one {:select [[:%count.* :count]]
                         :from [[{:select-distinct (condp contains? (db/db-type)
                                                     #{:postgres}  [[[:split_part :email [:inline "@"] [:inline 2]]]]
                                                     #{:h2 :mysql} [[[:substring :email [:locate "@" :email]]]])
                                  :from [:core_user]
                                  :where [:and
                                          [:= :is_active true]
                                          [:= :type [:inline "personal"]]]} :distinct_emails]]})))

(defn external-users-count
  "Number of users with sso-source: JWT as a proxy for tenant users of embedded views"
  []
  ;; Because we need this count *during* token checks, this uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true :sso_source "jwt" :type "personal"))

(defn tenant-users-count
  "Number of active users that belong to a tenant."
  []
  ;; Because we need this count *during* token checks, this uses `t2/table-name` to avoid the `after-select` method on
  ;; users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true :tenant_id [:not= nil] :type "personal"))

(defn tenants-with-active-users-count
  "Number of tenants that have at least one active user."
  []
  (:count (t2/query-one {:select [[[:count [:distinct :tenant_id]] :count]]
                         :from   [(t2/table-name :model/User)]
                         :where  [:and
                                  [:= :is_active true]
                                  [:= :type [:inline "personal"]]
                                  [:not= :tenant_id nil]]})))
