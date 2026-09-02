(ns metabase.internal-stats.users
  (:require
   [metabase.app-db.core :as db]
   [metabase.internal-stats.db :as internal-stats.db]))

(defn email-domain-count
  "Count all unique normalized domains found in active user emails"
  []
  (:count (internal-stats.db/active-personal-user-email-domain-count
           (condp contains? (db/db-type)
             #{:postgres}  [:split_part :email "@" [:inline 2]]
             #{:h2 :mysql} [:substring :email [:locate "@" :email]]))))

(defn external-users-count
  "Number of users with sso-source: JWT as a proxy for tenant users of embedded views"
  []
  (internal-stats.db/active-jwt-user-count))

(defn tenant-users-count
  "Number of active users that belong to a tenant."
  []
  (internal-stats.db/active-tenant-user-count))

(defn tenants-with-active-users-count
  "Number of tenants that have at least one active user."
  []
  (:count (internal-stats.db/tenants-with-active-users-count)))
