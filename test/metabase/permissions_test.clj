(ns metabase.permissions-test
  "A test suite around permissions. Nice!"
  (:require [clojure.string :as s]
            [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [metric :refer [Metric]]
                             [permissions :refer [Permissions], :as perms]
                             [permissions-group :refer [PermissionsGroup], :as group]
                             [permissions-group-membership :refer [PermissionsGroupMembership]]
                             [pulse :refer [Pulse]]
                             [pulse-card :refer [PulseCard]]
                             [pulse-channel :refer [PulseChannel]]
                             [pulse-channel-recipient :refer [PulseChannelRecipient]]
                             [segment :refer [Segment]]
                             [table :refer [Table]])
            [metabase.query-processor.expand :as ql]
            [metabase.sync-database :as sync]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [clj-time.core :as t]))

;; 3 users:
;; crowberto, member of Admin, All Users
;; rasta, member of All Users
;; lucky, member of All Users, Ops


;;; ------------------------------------------------------------ Ops Group ------------------------------------------------------------

;; ops group is a group with only one member: lucky
(def ^:private ^:dynamic *ops-group*)

(defn- with-ops-group [f]
  (fn []
    (tu/with-temp* [PermissionsGroup [group {:name "Operations"}]]
      ;; add lucky to Ops group
      (db/insert! PermissionsGroupMembership
        :group_id (u/get-id group)
        :user_id  (test-users/user->id :lucky))
      ;; cool, g2g <3
      (binding [*ops-group* group]
        (f)))))


;;; ------------------------------------------------------------ DBs, Tables, & Fields ------------------------------------------------------------

(def ^:private db-details
  (delay (db/select-one [Database :details :engine] :id (data/id))))

(defn- test-db [db-name]
  (assoc (select-keys @db-details [:details :engine])
    :name db-name))

(defn- table [db table-name]
  (db/select-one Table
    :%lower.name (s/lower-case (name table-name))
    :db_id       (u/get-id db)))

(defn- field
  ([db table-name field-name]
   (field (table db table-name) field-name))
  ([table field-name]
   (db/select-one Field
     :%lower.name (s/lower-case (name field-name))
     :table_id    (u/get-id table))))

(defn- with-db [db-name f]
  (fn []
    (tu/with-temp Database [db (test-db db-name)]
      ;; syncing is slow as f**k so just manually insert the Tables
      (doseq [table-name ["venues" "users" "checkins"]]
        (db/insert! Table :db_id (u/get-id db), :active true, :name table-name))
      ;; do the same for Fields
      (doseq [field [{:table_id (u/get-id (table db :venues)), :name "price",      :base_type :type/Integer, :special_type :type/Category}
                     {:table_id (u/get-id (table db :users)),  :name "last_login", :base_type :type/DateTime}]]
        (db/insert! Field field))
      ;; ok !
      (f db))))

(def ^:private ^:dynamic *db1*)
(def ^:private ^:dynamic *db2*)

(defn- all-db-ids []
  #{(u/get-id *db1*)
    (u/get-id *db2*)})

(defn- with-db-1 [f]
  (with-db "DB One" (fn [db]
                      (binding [*db1* db]
                        (f)))))

(defn- with-db-2 [f]
  (with-db "DB Two" (fn [db]
                      ;; all-users has no access to DB 2
                      (perms/revoke-permissions! (group/all-users) (u/get-id db))
                      ;; ops group only has access venues table + *reading* SQL
                      (when *ops-group*
                        (perms/revoke-permissions! *ops-group* (u/get-id db))
                        (perms/grant-native-read-permissions! *ops-group* (u/get-id db))
                        (let [venues-table (table db :venues)]
                          (perms/grant-permissions! *ops-group* (u/get-id db) (:schema venues-table) (u/get-id venues-table))))
                      (binding [*db2* db]
                        (f)))))


;;; ------------------------------------------------------------ Cards ------------------------------------------------------------

(defn- count-card [db table-name card-name]
  (let [table (table db table-name)]
    {:name          card-name
     :database_id   (u/get-id db)
     :table_id      (u/get-id table)
     :dataset_query {:database (u/get-id db)
                     :type     "query"
                     :query    (ql/query
                                 (ql/source-table (u/get-id table))
                                 (ql/aggregation (ql/count)))}}))

(defn- sql-count-card [db table-name card-name]
  (let [table (table db table-name)]
    {:name          card-name
     :database_id   (u/get-id db)
     :table_id      (u/get-id table)
     :dataset_query {:database (u/get-id db)
                     :type     "native"
                     :query    (format "SELECT count(*) FROM \"%s\";" (:name table))}}))


(def ^:private ^:dynamic *card:db1-count-of-venues*)
(def ^:private ^:dynamic *card:db1-count-of-users*)
(def ^:private ^:dynamic *card:db1-count-of-checkins*)
(def ^:private ^:dynamic *card:db1-sql-count-of-users*)
(def ^:private ^:dynamic *card:db2-count-of-venues*)
(def ^:private ^:dynamic *card:db2-count-of-users*)
(def ^:private ^:dynamic *card:db2-count-of-checkins*)
(def ^:private ^:dynamic *card:db2-sql-count-of-users*)

(defn- all-cards []
  #{*card:db1-count-of-venues*
    *card:db1-count-of-users*
    *card:db1-count-of-checkins*
    *card:db1-sql-count-of-users*
    *card:db2-count-of-venues*
    *card:db2-count-of-users*
    *card:db2-count-of-checkins*
    *card:db2-sql-count-of-users*})

(defn- all-card-ids []
  (set (map :id (all-cards))))

(defn- with-cards [f]
  (fn []
    (tu/with-temp* [Card [db1-count-of-venues    (count-card     *db1* :venues   "DB 1 Count of Venues")]
                    Card [db1-count-of-users     (count-card     *db1* :users    "DB 1 Count of Users")]
                    Card [db1-count-of-checkins  (count-card     *db1* :checkins "DB 1 Count of Checkins")]
                    Card [db1-sql-count-of-users (sql-count-card *db1* :venues   "DB 1 SQL Count of Users")]
                    Card [db2-count-of-venues    (count-card     *db2* :venues   "DB 2 Count of Venues")]
                    Card [db2-count-of-users     (count-card     *db2* :users    "DB 2 Count of Users")]
                    Card [db2-count-of-checkins  (count-card     *db2* :checkins "DB 2 Count of Checkins")]
                    Card [db2-sql-count-of-users (sql-count-card *db2* :venues   "DB 2 SQL Count of Users")]]
      (binding [*card:db1-count-of-venues*    db1-count-of-venues
                *card:db1-count-of-users*     db1-count-of-users
                *card:db1-count-of-checkins*  db1-count-of-checkins
                *card:db1-sql-count-of-users* db1-sql-count-of-users
                *card:db2-count-of-venues*    db2-count-of-venues
                *card:db2-count-of-users*     db2-count-of-users
                *card:db2-count-of-checkins*  db2-count-of-checkins
                *card:db2-sql-count-of-users* db2-sql-count-of-users]
        (f)))))


;;; ------------------------------------------------------------ Dashboards ------------------------------------------------------------

(def ^:private ^:dynamic *dash:db1-all*)
(def ^:private ^:dynamic *dash:db2-all*)
(def ^:private ^:dynamic *dash:db2-public*)

(defn- all-dashboards []
  #{*dash:db1-all*
    *dash:db2-all*
    *dash:db2-public*})

(defn- all-dashboard-ids []
  (set (map :id (all-dashboards))))

(defn- add-cards-to-dashboard! {:style/indent 1} [dashboard & cards]
  (doseq [card cards]
    (db/insert! DashboardCard
      :dashboard_id (u/get-id dashboard)
      :card_id      (u/get-id card))))

(defn- with-dashboards [f]
  (fn []
    (tu/with-temp* [Dashboard [db1-all    {:name "All DB 1"}]
                    Dashboard [db2-all    {:name "All DB 2"}]
                    Dashboard [db2-public {:name "Public DB 2"}]]
      (add-cards-to-dashboard! db1-all
        *card:db1-count-of-venues*
        *card:db1-count-of-users*
        *card:db1-count-of-checkins*
        *card:db1-sql-count-of-users*)
      (add-cards-to-dashboard! db2-all
        *card:db2-count-of-venues*
        *card:db2-count-of-users*
        *card:db2-count-of-checkins*
        *card:db2-sql-count-of-users*)
      (add-cards-to-dashboard! db2-public
        *card:db2-count-of-users*)
      (binding [*dash:db1-all*    db1-all
                *dash:db2-all*    db2-all
                *dash:db2-public* db2-public]
        (f)))))


;;; ------------------------------------------------------------ Pulses ------------------------------------------------------------

(def ^:private ^:dynamic *pulse:all*)
(def ^:private ^:dynamic *pulse:db1-all*)
(def ^:private ^:dynamic *pulse:db2-all*)
(def ^:private ^:dynamic *pulse:db2-public*)
(def ^:private ^:dynamic *pulse:db2-restricted*)

(defn- all-pulse-ids []
  #{(u/get-id *pulse:all*)
    (u/get-id *pulse:db1-all*)
    (u/get-id *pulse:db2-all*)
    (u/get-id *pulse:db2-public*)
    (u/get-id *pulse:db2-restricted*)})

(defn- add-cards-to-pulse! {:style/indent 1} [pulse & cards]
  (doseq [[i card] (map-indexed vector cards)]
    (db/insert! PulseCard
      :card_id  (u/get-id card)
      :position i
      :pulse_id (u/get-id pulse))))

(defn- add-recipients-to-pulse! {:style/indent 1} [pulse & usernames]
  (let [channel (db/insert! PulseChannel
                  :pulse_id      (u/get-id pulse)
                  :channel_type  "email"
                  :schedule_type "daily"
                  :details       {})]
    (doseq [username usernames]
      (db/insert! PulseChannelRecipient
        :pulse_channel_id (u/get-id channel)
        :user_id          (test-users/user->id username)))))

(defn- with-pulses [f]
  (fn []
    (tu/with-temp* [Pulse [all            {:name "All of Everything"}]
                    Pulse [db1-all        {:name "All DB 1"}]
                    Pulse [db2-all        {:name "All DB 2"}]
                    Pulse [db2-public     {:name "Public DB 2"}]
                    Pulse [db2-restricted {:name "Restricted DB 2"}]]
      ;; add cards
      (add-cards-to-pulse! all
        *card:db1-count-of-venues*
        *card:db1-count-of-users*
        *card:db1-count-of-checkins*
        *card:db1-sql-count-of-users*
        *card:db2-count-of-venues*
        *card:db2-count-of-users*
        *card:db2-count-of-checkins*
        *card:db2-sql-count-of-users*)
      (add-cards-to-pulse! db1-all
        *card:db1-count-of-venues*
        *card:db1-count-of-users*
        *card:db1-count-of-checkins*
        *card:db1-sql-count-of-users*)
      (add-cards-to-pulse! db2-all
        *card:db2-count-of-venues*
        *card:db2-count-of-users*
        *card:db2-count-of-checkins*
        *card:db2-sql-count-of-users*)
      (add-cards-to-pulse! db2-public
        *card:db2-count-of-venues*)
      (add-cards-to-pulse! db2-restricted
        *card:db2-count-of-users*
        *card:db2-count-of-checkins*)
      ;; add recipients
      (add-recipients-to-pulse! all
        :crowberto
        :rasta
        :lucky)
      ;; ok!
      (binding [*pulse:all*            all
                *pulse:db1-all*        db1-all
                *pulse:db2-all*        db2-all
                *pulse:db2-public*     db2-public
                *pulse:db2-restricted* db2-restricted]
        (f)))))


;;; ------------------------------------------------------------ Metrics ------------------------------------------------------------

(def ^:private ^:dynamic *metric:db1-venues-count*)
(def ^:private ^:dynamic *metric:db2-venues-count*)
(def ^:private ^:dynamic *metric:db2-users-count*)

(defn- all-metric-ids []
  #{(u/get-id *metric:db1-venues-count*)
    (u/get-id *metric:db2-venues-count*)
    (u/get-id *metric:db2-users-count*)})

(defn- count-metric [metric-name table]
  {:name        metric-name
   :description metric-name
   :table_id    (u/get-id table)
   :definition  (ql/query
                  (ql/source-table (u/get-id table))
                  (ql/aggregation (ql/count)))})

(defn- with-metrics [f]
  (fn []
    (tu/with-temp* [Metric [db1-venues-count (count-metric "DB 1 Count of Venues" (table *db1* :venues))]
                    Metric [db2-venues-count (count-metric "DB 2 Count of Venues" (table *db2* :venues))]
                    Metric [db2-users-count  (count-metric "DB 2 Count of Users"  (table *db2* :users))]]
      (binding [*metric:db1-venues-count* db1-venues-count
                *metric:db2-venues-count* db2-venues-count
                *metric:db2-users-count*  db2-users-count]
        (f)))))

;;; ------------------------------------------------------------ Segments ------------------------------------------------------------

(def ^:private ^:dynamic *segment:db1-expensive-venues*)
(def ^:private ^:dynamic *segment:db2-expensive-venues*)
(def ^:private ^:dynamic *segment:db2-todays-users*)

(defn- all-segment-ids []
  #{(u/get-id *segment:db1-expensive-venues*)
    (u/get-id *segment:db2-expensive-venues*)
    (u/get-id *segment:db2-todays-users*)})

(defn- segment [segment-name table definition]
  {:name        segment-name
   :description segment-name
   :table_id    (u/get-id table)
   :definition  definition})

(defn- expensive-venues-segment [segment-name table]
  (segment segment-name table (ql/query
                                (ql/source-table (u/get-id table))
                                (ql/filter (ql/= (ql/field-id (u/get-id (field table :price)))
                                                 4)))))

(defn- todays-users-segment [segment-name table]
  (segment segment-name table (ql/query
                                (ql/source-table (u/get-id table))
                                (ql/filter (ql/= (ql/field-id (u/get-id (field table :last_login)))
                                                 (ql/relative-datetime :current))))))

(defn- with-segments [f]
  (fn []
    (tu/with-temp* [Segment [db1-expensive-venues (expensive-venues-segment "DB 1 Expensive Venues" (table *db1* :venues))]
                    Segment [db2-expensive-venues (expensive-venues-segment "DB 2 Expensive Venues" (table *db2* :venues))]
                    Segment [db2-todays-users     (todays-users-segment     "DB 2 Today's Users"    (table *db2* :users))]]
      (binding [*segment:db1-expensive-venues* db1-expensive-venues
                *segment:db2-expensive-venues* db2-expensive-venues
                *segment:db2-todays-users*     db2-todays-users]
        (f)))))

;;; ------------------------------------------------------------ with everything! ------------------------------------------------------------


(defn- -do-with-test-data [f]
  (((comp with-ops-group
          with-db-2
          with-db-1
          with-cards
          with-dashboards
          with-pulses
          with-metrics
          with-segments) f)))

(defmacro ^:private with-test-data {:style/indent 0} [& body]
  `(-do-with-test-data (fn []
                         ~@body)))

(defmacro ^:private expect-with-test-data {:style/indent 0} [expected actual]
  `(expect
     ~expected
     (with-test-data
       ~actual)))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                          QUERY BUILDER                                                                         |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------------ GET /api/database?include_tables=true (Visible DBs + Tables) ------------------------------------------------------------

(defn- GET-database [username]
  (vec (for [db    ((test-users/user->client username) :get 200 "database", :include_tables true)
             :when (contains? (all-db-ids) (u/get-id db))]
         [(:name db) (mapv :name (:tables db))])))

;; admin should be able to see everything
(expect-with-test-data
  [["DB One" ["checkins" "users" "venues"]]
   ["DB Two" ["checkins" "users" "venues"]]]
  (GET-database :crowberto))

;; basic user should only see DB 1
(expect-with-test-data
  [["DB One" ["checkins" "users" "venues"]]]
  (GET-database :rasta))

;; ops user should see DB 1 and venues in DB 2
(expect-with-test-data
  [["DB One" ["checkins" "users" "venues"]]
   ["DB Two" ["venues"]]]
  (GET-database :lucky))


;;; ------------------------------------------------------------ GET /api/table/:id/query_metadata ------------------------------------------------------------

(defn- GET-table-query-metadata [username db table-name]
  (not= ((test-users/user->client username) :get (format "table/%d/query_metadata" (u/get-id (table db table-name))))
        "You don't have permissions to do that."))

;; admin should be able to get metadata for all tables
(expect-with-test-data true (GET-table-query-metadata :crowberto *db1* :checkins))
(expect-with-test-data true (GET-table-query-metadata :crowberto *db1* :users))
(expect-with-test-data true (GET-table-query-metadata :crowberto *db1* :venues))
(expect-with-test-data true (GET-table-query-metadata :crowberto *db2* :checkins))
(expect-with-test-data true (GET-table-query-metadata :crowberto *db2* :users))
(expect-with-test-data true (GET-table-query-metadata :crowberto *db2* :venues))

;; normal user should only be able to get metadata for DB 1's tables
(expect-with-test-data true  (GET-table-query-metadata :rasta *db1* :checkins))
(expect-with-test-data true  (GET-table-query-metadata :rasta *db1* :users))
(expect-with-test-data true  (GET-table-query-metadata :rasta *db1* :venues))
(expect-with-test-data false (GET-table-query-metadata :rasta *db2* :checkins))
(expect-with-test-data false (GET-table-query-metadata :rasta *db2* :users))
(expect-with-test-data false (GET-table-query-metadata :rasta *db2* :venues))

;; ops user should be able to get metadata for DB 1 or for venues in DB 2
(expect-with-test-data true  (GET-table-query-metadata :lucky *db1* :checkins))
(expect-with-test-data true  (GET-table-query-metadata :lucky *db1* :users))
(expect-with-test-data true  (GET-table-query-metadata :lucky *db1* :venues))
(expect-with-test-data false (GET-table-query-metadata :lucky *db2* :checkins))
(expect-with-test-data false (GET-table-query-metadata :lucky *db2* :users))
(expect-with-test-data true  (GET-table-query-metadata :lucky *db2* :venues))


;;; ------------------------------------------------------------ POST /api/dataset (SQL query) ------------------------------------------------------------

(defn- sql-query [username db]
  (let [results ((test-users/user->client username) :post "dataset"
                 {:database (u/get-id db)
                  :type     :native
                  :native   {:query "SELECT COUNT(*) FROM VENUES;"}})]
    (if (string? results)
      results
      (or (:error results)
          (get-in results [:data :rows])))))

;; everyone should be able to ask SQL questions against DB 1
(expect-with-test-data [[100]] (sql-query :crowberto *db1*))
(expect-with-test-data [[100]] (sql-query :rasta *db1*))
(expect-with-test-data [[100]] (sql-query :lucky *db1*))

;; Only Admin should be able to ask SQL questions against DB 2. Error message is slightly different for Rasta & Lucky because Rasta has no permissions whatsoever for DB 2 while Lucky has partial perms
(expect-with-test-data [[100]] (sql-query :crowberto *db2*))
(expect-with-test-data "You don't have permissions to do that." (sql-query :rasta *db2*))
(expect-with-test-data "You do not have permissions to run new native queries against database 'DB Two'." (sql-query :lucky *db2*))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                         SAVED QUESTIONS                                                                        |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------------ GET /api/card (Visible Cards) ------------------------------------------------------------

(defn- GET-card [username]
  (vec (for [card  ((test-users/user->client username) :get 200 "card")
             :when (contains? (all-card-ids) (u/get-id card))]
         (:name card))))

;; Admin should be able to see all 8 questions
(expect-with-test-data
  ["DB 1 Count of Checkins"
   "DB 1 Count of Users"
   "DB 1 Count of Venues"
   "DB 1 SQL Count of Users"
   "DB 2 Count of Checkins"
   "DB 2 Count of Users"
   "DB 2 Count of Venues"
   "DB 2 SQL Count of Users"]
  (GET-card :crowberto))

;; All Users should only be able to see questions in DB 1
(expect-with-test-data
  ["DB 1 Count of Checkins"
   "DB 1 Count of Users"
   "DB 1 Count of Venues"
   "DB 1 SQL Count of Users"]
  (GET-card :rasta))

;; Ops should be able to see questions in DB 1, and DB 2 venues & SQL questions
(expect-with-test-data
  ["DB 1 Count of Checkins"
   "DB 1 Count of Users"
   "DB 1 Count of Venues"
   "DB 1 SQL Count of Users"
   "DB 2 Count of Venues"
   "DB 2 SQL Count of Users"]
  (GET-card :lucky))


;;; ------------------------------------------------------------ GET /api/card/:id ------------------------------------------------------------

;; just return true/false based on whether they were allowed to see the card
(defn- GET-card-id [username card]
  (not= ((test-users/user->client username) :get (str "card/" (u/get-id card)))
        "You don't have permissions to do that."))

;; admin can fetch all 8 cards
(expect-with-test-data true  (GET-card-id :crowberto *card:db1-count-of-venues*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db1-count-of-users*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db1-count-of-checkins*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db1-sql-count-of-users*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db2-count-of-venues*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db2-count-of-users*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db2-count-of-checkins*))
(expect-with-test-data true  (GET-card-id :crowberto *card:db2-sql-count-of-users*))

;; regular user can only fetch Cards for DB 1
(expect-with-test-data true  (GET-card-id :rasta *card:db1-count-of-venues*))
(expect-with-test-data true  (GET-card-id :rasta *card:db1-count-of-users*))
(expect-with-test-data true  (GET-card-id :rasta *card:db1-count-of-checkins*))
(expect-with-test-data true  (GET-card-id :rasta *card:db1-sql-count-of-users*))
(expect-with-test-data false (GET-card-id :rasta *card:db2-count-of-venues*))
(expect-with-test-data false (GET-card-id :rasta *card:db2-count-of-users*))
(expect-with-test-data false (GET-card-id :rasta *card:db2-count-of-checkins*))
(expect-with-test-data false (GET-card-id :rasta *card:db2-sql-count-of-users*))

;; ops user can fetch DB 1 cards of DB 2 Venues cards
(expect-with-test-data true  (GET-card-id :lucky *card:db1-count-of-venues*))
(expect-with-test-data true  (GET-card-id :lucky *card:db1-count-of-users*))
(expect-with-test-data true  (GET-card-id :lucky *card:db1-count-of-checkins*))
(expect-with-test-data true  (GET-card-id :lucky *card:db1-sql-count-of-users*))
(expect-with-test-data true  (GET-card-id :lucky *card:db2-count-of-venues*))
(expect-with-test-data false (GET-card-id :lucky *card:db2-count-of-users*))
(expect-with-test-data false (GET-card-id :lucky *card:db2-count-of-checkins*))
(expect-with-test-data true  (GET-card-id :lucky *card:db2-sql-count-of-users*))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                           DASHBOARDS                                                                           |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------------ GET /api/dashboard (Visible Dashboards) ------------------------------------------------------------

(defn- GET-dashboard [username]
  (vec (for [dashboard ((test-users/user->client username) :get 200 "dashboard")
             :when     (contains? (all-dashboard-ids) (u/get-id dashboard))]
         (:name dashboard))))

;; Admin should be able to see all dashboards
(expect-with-test-data
  ["All DB 1"
   "All DB 2"
   "Public DB 2"]
  (GET-dashboard :crowberto))

;; All Users should only be able to see All DB 1.
;; Shouldn't see either one of the DB 2 dashboards because they have no access to DB 2
(expect-with-test-data
  ["All DB 1"]
  (GET-dashboard :rasta))

;; Ops should be able to see All DB 1 & All DB 2
;; Shouldn't see DB 2 Private because they have no access to the db2-count-of-users card, its only card
(expect-with-test-data
  ["All DB 1"
   "All DB 2"]
  (GET-dashboard :lucky))


;;; ------------------------------------------------------------ GET /api/dashboard/:id  ------------------------------------------------------------

(defn- GET-dashboard-id [username dashboard]
  (not= ((test-users/user->client username) :get (str "dashboard/" (u/get-id dashboard)))
        "You don't have permissions to do that."))

(expect-with-test-data true  (GET-dashboard-id :crowberto *dash:db1-all*))
(expect-with-test-data true  (GET-dashboard-id :crowberto *dash:db2-all*))
(expect-with-test-data true  (GET-dashboard-id :crowberto *dash:db2-public*))

(expect-with-test-data true  (GET-dashboard-id :rasta *dash:db1-all*))
(expect-with-test-data false (GET-dashboard-id :rasta *dash:db2-all*))
(expect-with-test-data false (GET-dashboard-id :rasta *dash:db2-public*))

(expect-with-test-data true  (GET-dashboard-id :lucky *dash:db1-all*))
(expect-with-test-data true  (GET-dashboard-id :lucky *dash:db2-all*))
(expect-with-test-data false (GET-dashboard-id :lucky *dash:db2-public*))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                             PULSES                                                                             |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------------ GET /api/pulse ------------------------------------------------------------

(defn- GET-pulse [username]
  (vec (for [pulse ((test-users/user->client username) :get 200 "pulse")
             :when (contains? (all-pulse-ids) (u/get-id pulse))]
         (:name pulse))))

;; admin
(expect-with-test-data
  ["All DB 1"
   "All DB 2"
   "All of Everything"
   "Public DB 2"
   "Restricted DB 2"]
  (GET-pulse :crowberto))

;; normal user
(expect-with-test-data
  ["All DB 1"
   "All of Everything"]
  (GET-pulse :rasta))

;; ops user
(expect-with-test-data
  ["All DB 1"
   "All of Everything"
   "Public DB 2"]
  (GET-pulse :lucky))


;;; ------------------------------------------------------------ GET /api/pulse/:id ------------------------------------------------------------

(defn- GET-pulse-id [username pulse]
  (not= ((test-users/user->client username) :get (str "pulse/" (u/get-id pulse)))
        "You don't have permissions to do that."))

;; admin
(expect-with-test-data true (GET-pulse-id :crowberto *pulse:all*))
(expect-with-test-data true (GET-pulse-id :crowberto *pulse:db1-all*))
(expect-with-test-data true (GET-pulse-id :crowberto *pulse:db2-all*))
(expect-with-test-data true (GET-pulse-id :crowberto *pulse:db2-public*))
(expect-with-test-data true (GET-pulse-id :crowberto *pulse:db2-restricted*))

;; normal user
(expect-with-test-data true  (GET-pulse-id :rasta *pulse:all*))
(expect-with-test-data true  (GET-pulse-id :rasta *pulse:db1-all*))
(expect-with-test-data false (GET-pulse-id :rasta *pulse:db2-all*))
(expect-with-test-data false (GET-pulse-id :rasta *pulse:db2-public*))
(expect-with-test-data false (GET-pulse-id :rasta *pulse:db2-restricted*))

;; ops user
(expect-with-test-data true  (GET-pulse-id :lucky *pulse:all*))
(expect-with-test-data true  (GET-pulse-id :lucky *pulse:db1-all*))
(expect-with-test-data false (GET-pulse-id :lucky *pulse:db2-all*))
(expect-with-test-data true  (GET-pulse-id :lucky *pulse:db2-public*))
(expect-with-test-data false (GET-pulse-id :lucky *pulse:db2-restricted*))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                         DATA REFERENCE                                                                         |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------------ GET /api/metric (Visible Metrics) ------------------------------------------------------------

(defn- GET-metric [username]
  (vec (for [metric ((test-users/user->client username) :get 200 "metric")
             :when  (contains? (all-metric-ids) (u/get-id metric))]
         (:name metric))))

;; admin should see all 3
(expect-with-test-data
  ["DB 1 Count of Venues"
   "DB 2 Count of Venues"
   "DB 2 Count of Users"]
  (GET-metric :crowberto))

;; regular should only see metric for DB 1
(expect-with-test-data
  ["DB 1 Count of Venues"]
  (GET-metric :rasta))

;; ops shouldn't see DB 2 count of users because they don't have access
(expect-with-test-data
  ["DB 1 Count of Venues"
   "DB 2 Count of Venues"]
  (GET-metric :lucky))


;;; ------------------------------------------------------------ GET /api/segment (Visible Segments) ------------------------------------------------------------

(defn- GET-segment [username]
  (vec (for [segment ((test-users/user->client username) :get 200 "segment")
             :when   (contains? (all-segment-ids) (u/get-id segment))]
         (:name segment))))

;; admin should see all 3
(expect-with-test-data
  ["DB 1 Expensive Venues"
   "DB 2 Expensive Venues"
   "DB 2 Today's Users"]
  (GET-segment :crowberto))

;; regular user should only see segment for DB 1
(expect-with-test-data
  ["DB 1 Expensive Venues"]
  (GET-segment :rasta))

;; ops users should see segment for DB 1 and DB 2 venues, but not DB 2 users
(expect-with-test-data
  ["DB 1 Expensive Venues"
   "DB 2 Expensive Venues"]
  (GET-segment :lucky))


;;; ------------------------------------------------------------ GET /api/database/:id/metadata (Visible Tables) ------------------------------------------------------------

(defn- GET-database-id-metadata [username db]
  (let [db ((test-users/user->client username) :get (format "database/%d/metadata" (u/get-id db)))]
    (if (string? db)
      db
      (mapv :name (:tables db)))))

;; admin should be able to see everything
(expect-with-test-data ["checkins" "users" "venues"] (GET-database-id-metadata :crowberto *db1*))
(expect-with-test-data ["checkins" "users" "venues"] (GET-database-id-metadata :crowberto *db2*))

;; regular user should only be able to see DB 1
(expect-with-test-data ["checkins" "users" "venues"]            (GET-database-id-metadata :rasta *db1*))
(expect-with-test-data "You don't have permissions to do that." (GET-database-id-metadata :rasta *db2*))

;; ops user should be able to see DB 1 + venues in DB 2
(expect-with-test-data ["checkins" "users" "venues"] (GET-database-id-metadata :lucky *db1*))
(expect-with-test-data ["venues"]                    (GET-database-id-metadata :lucky *db2*))
