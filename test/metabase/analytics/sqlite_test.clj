(ns metabase.analytics.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.db :as analytics.db]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as app-db]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.jdbc-protocols]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.settings.models.setting :as setting]
   [metabase.users.models.user]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (java.time Instant OffsetDateTime)))

(set! *warn-on-reflection* true)

(deftest sqlite-baseline-instance-creation-test
  (let [source (data-source/broken-out-details->DataSource :sqlite {:db ":memory:"})]
    (with-open [^Connection conn (.getConnection source)]
      (binding [connection/*application-db* (connection/application-db :sqlite source)
                t2.conn/*current-connectable* conn]
        (liquibase/with-liquibase [lb conn]
          (.update lb ""))
        (app-db/finish-db-setup!)
        (let [created (analytics.db/first-user-date-joined)]
          (is (= (OffsetDateTime/parse "2026-09-24T00:00:00Z") created))
          ;; Exercise the timestamp setting write/read path used by lazy instance-creation initialization,
          ;; without emitting the accompanying new-instance analytics event from this isolated test DB.
          (setting/set-value-of-type! :timestamp :instance-creation created)
          (is (= (.toInstant ^OffsetDateTime created)
                 (Instant/from (setting/get-value-of-type :timestamp :instance-creation))))
          (is (= created (OffsetDateTime/parse (analytics.settings/instance-creation))))
          (is (re-find #"T.*(?:Z|[+-]\d\d:\d\d)$"
                       (t2/select-one-fn :value :model/Setting :key "instance-creation"))))))))
