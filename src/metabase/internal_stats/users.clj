(ns metabase.internal-stats.users
  (:require
   [metabase.db :as db]
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
  "Number of users with sso-source: JWT as a proxy for external users of embedded views"
  []
  (t2/count :model/User :is_active true :sso_source :jwt :type :personal))
