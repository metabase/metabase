(ns ^:mb/app-db-migrations-test metabase-enterprise.database-routing.anonymous-access-backfill-test
  "Guest embeds that worked before the upgrade keep working after it. The upgrade grants anonymous access to exactly
  those router databases that already have published guest embeds; guest embed execution then gates on that grant, so
  the two have to agree. This runs the real migration and then asks the gate, rather than setting the column by hand.

  The migration's own cases -- which shapes are backfilled and which are left alone -- are covered by
  [[metabase.app-db.schema-migrations-test/db-router-anonymous-access-granted-backfill-test]]."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.common :as common]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.database-routing.core :as database-routing]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest guest-embeds-backfilled-by-the-upgrade-keep-working-test
  (testing "a router database the upgrade backfills still resolves to the router for guest embed execution"
    (impl/test-migrations ["v65.2026-10-06T11:00:00" "v65.2026-10-06T11:00:01"] [migrate!]
      (let [user-id (t2/insert-returning-pk! :core_user {:first_name  "Router"
                                                         :last_name   "Owner"
                                                         :email       "router-owner@metabase.com"
                                                         :password    "superstrong"
                                                         :entity_id   (u/generate-nano-id)
                                                         :date_joined :%now})
            db!     (fn [db-name]
                      (t2/insert-returning-pk! :metabase_database {:details    "{}"
                                                                   :created_at :%now
                                                                   :updated_at :%now
                                                                   :engine     "h2"
                                                                   :is_sample  false
                                                                   :name       db-name}))
            router! (fn [db-id]
                      (t2/insert-returning-pk! :db_router {:database_id    db-id
                                                           :user_attribute "db_name"}))
            card!   (fn [db-id enable-embedding]
                      (t2/insert-returning-pk! :report_card {:name                   "Card"
                                                             :entity_id              (u/generate-nano-id)
                                                             :type                   "question"
                                                             :display                "table"
                                                             :dataset_query          "{}"
                                                             :visualization_settings "{}"
                                                             :creator_id             user-id
                                                             :database_id            db-id
                                                             :enable_embedding       enable-embedding
                                                             :archived               false
                                                             :created_at             :%now
                                                             :updated_at             :%now}))
            ;; a router database with a published guest embed on it, i.e. one that works today
            embedded-db (db! "router-with-guest-embeds")
            _           (router! embedded-db)
            _           (card! embedded-db true)
            ;; a router database with no published guest embeds, which the upgrade leaves ungranted
            plain-db    (db! "router-without-guest-embeds")
            _           (router! plain-db)
            _           (card! plain-db false)]
        (migrate!)
        (mt/with-premium-features #{:database-routing}
          (database-routing/with-database-routing-off-if-granted
            (testing "the backfilled router answers, exactly as it did before the upgrade"
              (is (nil? (common/router-db-or-id->destination-db-id embedded-db))))
            (testing "a router with no published guest embeds refuses"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                    #"This database does not allow anonymous access."
                                    (common/router-db-or-id->destination-db-id plain-db))))))))))
