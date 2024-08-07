(ns metabase.db.custom-migrations-test
  "Tests to make sure the custom migrations work as expected."
  (:require
   [cheshire.core :as json]
   [clojure.math :as math]
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.api.database-test :as api.database-test]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.custom-migrations :as custom-migrations]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.driver :as driver]
   [metabase.models.database :as database]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.pulse-channel-test :as pulse-channel-test]
   [metabase.models.setting :as setting]
   [metabase.task :as task]
   [metabase.task.send-pulses :as task.send-pulses]
   [metabase.task.sync-databases-test :as task.sync-databases-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(jobs/defjob AbandonmentEmail [_] :default)

(defn- table-default [table]
  (letfn [(with-timestamped [props]
            (merge props {:created_at :%now :updated_at :%now}))]
   (case table
     :core_user         {:first_name  (mt/random-name)
                         :last_name   (mt/random-name)
                         :email       (mt/random-email)
                         :password    "superstrong"
                         :date_joined :%now}
     :metabase_database (with-timestamped
                          {:name       (mt/random-name)
                           :engine     "h2"
                           :details    "{}"})

     :report_card       (with-timestamped
                         {:name                   (mt/random-name)
                          :dataset_query          "{}"
                          :display                "table"
                          :visualization_settings "{}"})
     :revision          {:timestamp :%now}
     :pulse             (with-timestamped
                         {:name       (mt/random-name)
                          :parameters "{}"})
     :pulse_channel     (with-timestamped
                          {:channel_type  "slack"
                           :details       (json/generate-string {:channel "general"})
                           :schedule_type "daily"
                           :schedule_hour 15})
     {})))

(defn- new-instance-with-default
  ([table]
   (new-instance-with-default table {}))
  ([table properties]
   (t2/insert-returning-instance! table (merge (table-default table) properties))))

(deftest delete-abandonment-email-task-test
  (testing "Migration v46.00-086: Delete the abandonment email task"
    (impl/test-migrations ["v46.00-086"] [migrate!]
      (try (do (task/start-scheduler!)
               (let [abandonment-emails-job-key     "metabase.task.abandonment-emails.job"
                     abandonment-emails-trigger-key "metabase.task.abandonment-emails.trigger"
                     ;; this corresponds to the job and trigger removed in metabase#27348
                     job     (jobs/build
                              (jobs/of-type AbandonmentEmail)
                              (jobs/with-identity (jobs/key abandonment-emails-job-key)))
                     trigger (triggers/build
                              (triggers/with-identity (triggers/key abandonment-emails-trigger-key))
                              (triggers/start-now)
                              (triggers/with-schedule
                                (cron/cron-schedule "0 0 12 * * ? *")))]
                 (task/schedule-task! job trigger)
                 (testing "before the migration, the job and trigger exist"
                   (is (some? (qs/get-job (@#'task/scheduler) (jobs/key abandonment-emails-job-key))))
                   (is (some? (qs/get-trigger (@#'task/scheduler) (triggers/key abandonment-emails-trigger-key)))))
                 ;; stop the scheduler because the scheduler won't be started when migrations start
                 (task/stop-scheduler!)
                 (migrate!)
                 ;; check the job and trigger are deleted
                 (task/start-scheduler!)
                 (testing "after the migration, the job and trigger are deleted"
                   (is (nil? (qs/get-job (@#'task/scheduler) (jobs/key abandonment-emails-job-key))))
                   (is (nil? (qs/get-trigger (@#'task/scheduler) (triggers/key abandonment-emails-trigger-key)))))))
           (finally (task/stop-scheduler!))))))

(deftest migrate-legacy-column-settings-field-refs-test
  (testing "Migrations v47.00-016: update visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-016"] [migrate!]
      (let [visualization-settings
            {"column_settings" (-> {["name" "column_name"]                              {"column_title" "ID6"},
                                    ["ref" ["field-literal" "column_name" "type/Text"]] {"column_title" "ID5"},
                                    ["ref" ["field-id" 39]]                             {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                            {"column_title" "ID2"},
                                    ["ref" ["fk->" ["field-id" 39] ["field-id" 40]]]    {"column_title" "ID3"},
                                    ["ref" ["fk->" 41 42]]                              {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["name" "column_name"]                                    {"column_title" "ID6"},
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "ID5"},
                                    ["ref" ["field" 39 nil]]                                  {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                                  {"column_title" "ID2"},
                                    ["ref" ["field" 40 {"source-field" 39}]]                  {"column_title" "ID3"},
                                    ["ref" ["field" 42 {"source-field" 41}]]                  {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id     (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                  {:name                   "My Saved Question"
                                                   :created_at             :%now
                                                   :updated_at             :%now
                                                   :creator_id             user-id
                                                   :display                "table"
                                                   :dataset_query          "{}"
                                                   :visualization_settings (json/generate-string visualization-settings)
                                                   :database_id            database-id
                                                   :collection_id          nil})]
        (migrate!)
        (testing "legacy column_settings are updated"
          (is (= expected
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     json/parse-string))))
        (testing "legacy column_settings are updated to the current format"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)
                     walk/stringify-keys)
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     json/parse-string))))
        (testing "visualization_settings are equivalent before and after migration"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings))
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     json/parse-string
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)))))))))

(deftest migrate-legacy-result-metadata-field-refs-test
  (testing "Migrations v47.00-027: update report_card.result_metadata legacy field refs"
    (impl/test-migrations ["v47.00-027"] [migrate!]
      (let [result_metadata [{"field_ref" ["field-literal" "column_name" "type/Text"]}
                             {"field_ref" ["field-id" 39]}
                             {"field_ref" ["field" 40 nil]}
                             {"field_ref" ["fk->" ["field-id" 39] ["field-id" 40]]}
                             {"field_ref" ["fk->" 41 42]}
                             {"field_ref" ["aggregation" 0]}
                             {"field_ref" ["expression" "expr"]}]
            expected        [{"field_ref" ["field" "column_name" {"base-type" "type/Text"}]}
                             {"field_ref" ["field" 39 nil]}
                             {"field_ref" ["field" 40 nil]}
                             {"field_ref" ["field" 40 {"source-field" 39}]}
                             {"field_ref" ["field" 42 {"source-field" 41}]}
                             {"field_ref" ["aggregation" 0]}
                             {"field_ref" ["expression" "expr"]}]
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id     (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                  {:name                   "My Saved Question"
                                                   :created_at             :%now
                                                   :updated_at             :%now
                                                   :creator_id             user-id
                                                   :display                "table"
                                                   :dataset_query          "{}"
                                                   :visualization_settings "{}"
                                                   :result_metadata        (json/generate-string result_metadata)
                                                   :database_id            database-id
                                                   :collection_id          nil})]
        (migrate!)
        (let [migrated-result-metadata (:result_metadata (t2/query-one {:select [:result_metadata]
                                                                        :from   [:report_card]
                                                                        :where  [:= :id card-id]}))]
          (testing "legacy result_metadata field refs are updated"
            (is (= expected
                   (json/parse-string migrated-result-metadata))))
          (testing "legacy result_metadata are updated to the current format"
            (is (= (->> result_metadata
                        json/generate-string
                        ((:out mi/transform-result-metadata))
                        json/generate-string)
                   migrated-result-metadata)))
          (testing "result_metadata is equivalent before and after migration"
            (is (= (->> result_metadata
                        json/generate-string
                        ((:out mi/transform-result-metadata))
                        json/generate-string)
                   (-> migrated-result-metadata
                       json/parse-string
                       ((:out mi/transform-result-metadata))
                       json/generate-string)))))))))

(deftest add-join-alias-to-visualization-settings-field-refs-test
  (testing "Migrations v47.00-028: update visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-028"] [migrate!]
      (let [result_metadata
            [{:field_ref [:field 1 nil]}
             {:field_ref [:field 1 {:join-alias "Self-joined Table"}]}
             {:field_ref [:field 2 {:source-field 3}]}
             {:field_ref [:field 3 {:temporal-unit "default"}]}
             {:field_ref [:field 4 {:join-alias "Self-joined Table"
                                    :binning {:strategy "default"}}]}
             {:field_ref [:field "column_name" {:base-type :type/Text}]}
             {:field_ref [:name "column_name"]}]
            visualization-settings
            {"column_settings" (-> {["ref" ["field" 1 nil]]                                   {"column_title" "1"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                    {"column_title" "2"}
                                    ["ref" ["field" 3 nil]]                                   {"column_title" "3"}
                                    ["ref" ["field" 4 nil]]                                   {"column_title" "4"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "5"}
                                    ["name" "column_name"]                                    {"column_title" "6"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["ref" ["field" 1 nil]]                                   {"column_title" "1"}
                                    ["ref" ["field" 1 {"join-alias" "Self-joined Table"}]]    {"column_title" "1"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                    {"column_title" "2"}
                                    ["ref" ["field" 3 nil]]                                   {"column_title" "3"}
                                    ["ref" ["field" 4 {"join-alias" "Self-joined Table"}]]    {"column_title" "4"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "5"}
                                    ["name" "column_name"]                                    {"column_title" "6"}}
                                   (update-keys json/generate-string))}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id     (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                  {:name                   "My Saved Question"
                                                   :created_at             :%now
                                                   :updated_at             :%now
                                                   :creator_id             user-id
                                                   :display                "table"
                                                   :dataset_query          "{}"
                                                   :result_metadata        (json/generate-string result_metadata)
                                                   :visualization_settings (json/generate-string visualization-settings)
                                                   :database_id            database-id
                                                   :collection_id          nil})]
        (migrate!)
        (testing "After the migration, column_settings field refs are updated to include join-alias"
          (is (= expected
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     json/parse-string))))
        (when (not= driver/*driver* :mysql) ; skipping MySQL because of rollback flakes (metabase#37434)
          (migrate! :down 46)
          (testing "After reversing the migration, column_settings field refs are updated to remove join-alias"
            (is (= visualization-settings
                   (-> (t2/query-one {:select [:visualization_settings]
                                      :from   [:report_card]
                                      :where  [:= :id card-id]})
                       :visualization_settings
                       json/parse-string)))))))))

(deftest downgrade-dashboard-tabs-test
  (testing "Migrations v47.00-029: downgrade dashboard tab test"
    ;; it's "v47.00-030" but not "v47.00-029" for some reason,
    ;; SOMETIMES the rollback of custom migration doesn't get triggered on mysql and this test got flaky.
    (impl/test-migrations "v47.00-030" [migrate!]
      (migrate!)
      (let [user-id      (first (t2/insert-returning-pks! (t2/table-name :model/User) {:first_name  "Howard"
                                                                                       :last_name   "Hughes"
                                                                                       :email       "howard@aircraft.com"
                                                                                       :password    "superstrong"
                                                                                       :date_joined :%now}))
            dashboard-id (first (t2/insert-returning-pks! :model/Dashboard {:name       "A dashboard"
                                                                            :creator_id user-id}))
            tab1-id      (first (t2/insert-returning-pks! :model/DashboardTab {:name         "Tab 1"
                                                                               :position     0
                                                                               :dashboard_id dashboard-id}))
            tab2-id      (first (t2/insert-returning-pks! :model/DashboardTab {:name         "Tab 2"
                                                                               :position     1
                                                                               :dashboard_id dashboard-id}))
            ;; adds a dummy tab without cards to make sure our migration doesn't fail on such case
            _            (first (t2/insert-returning-pks! :model/DashboardTab {:name         "Tab 3"
                                                                               :position     2
                                                                               :dashboard_id dashboard-id}))
            tab4-id      (first (t2/insert-returning-pks! :model/DashboardTab {:name         "Tab 4"
                                                                               :position     3
                                                                               :dashboard_id dashboard-id}))
            default-card {:dashboard_id           dashboard-id
                          :visualization_settings {:virtual_card {:display "text"}
                                                   :text         "A text card"}}
            tab1-card1-id (first (t2/insert-returning-pks! :model/DashboardCard (merge
                                                                                  default-card
                                                                                  {:dashboard_tab_id tab1-id
                                                                                   :row              0
                                                                                   :col              0
                                                                                   :size_x           4
                                                                                   :size_y           4})))

            tab1-card2-id (first (t2/insert-returning-pks! :model/DashboardCard (merge
                                                                                  default-card
                                                                                  {:dashboard_tab_id tab1-id
                                                                                   :row              2
                                                                                   :col              0
                                                                                   :size_x           2
                                                                                   :size_y           6})))

            tab2-card1-id (first (t2/insert-returning-pks! :model/DashboardCard (merge
                                                                                  default-card
                                                                                  {:dashboard_tab_id tab2-id
                                                                                   :row              0
                                                                                   :col              0
                                                                                   :size_x           4
                                                                                   :size_y           4})))

            tab2-card2-id (first (t2/insert-returning-pks! :model/DashboardCard (merge
                                                                                  default-card
                                                                                  {:dashboard_tab_id tab2-id
                                                                                   :row              4
                                                                                   :col              0
                                                                                   :size_x           4
                                                                                   :size_y           2})))
            tab4-card1-id (first (t2/insert-returning-pks! :model/DashboardCard (merge
                                                                                  default-card
                                                                                  {:dashboard_tab_id tab4-id
                                                                                   :row              0
                                                                                   :col              0
                                                                                   :size_x           4
                                                                                   :size_y           4})))
            tab4-card2-id (first (t2/insert-returning-pks! :model/DashboardCard (merge
                                                                                  default-card
                                                                                  {:dashboard_tab_id tab4-id
                                                                                   :row              4
                                                                                   :col              0
                                                                                   :size_x           4
                                                                                   :size_y           2})))]
       (migrate! :down 46)
       (is (= [;; tab 1
               {:id  tab1-card1-id
                :row 0}
               {:id  tab1-card2-id
                :row 2}

               ;; tab 2
               {:id  tab2-card1-id
                :row 8}
               {:id  tab2-card2-id
                :row 12}

               ;; tab 3
               {:id  tab4-card1-id
                :row 14}
               {:id  tab4-card2-id
                :row 18}]
              (t2/select-fn-vec #(select-keys % [:id :row]) :model/DashboardCard :dashboard_id dashboard-id)))))))

(deftest migrate-dashboard-revision-grid-from-18-to-24-test
  (impl/test-migrations ["v47.00-032" "v47.00-033"] [migrate!]
    (let [user-id      (first (t2/insert-returning-pks! (t2/table-name :model/User)
                                                        {:first_name  "Howard"
                                                         :last_name   "Hughes"
                                                         :email       "howard@aircraft.com"
                                                         :password    "superstrong"
                                                         :date_joined :%now}))

          cards        [{:row 15 :col 0  :size_x 12 :size_y 8}
                        {:row 7  :col 12 :size_x 6  :size_y 8}
                        {:row 2  :col 5  :size_x 5  :size_y 3}
                        {:row 25 :col 0  :size_x 7  :size_y 10}
                        {:row 2  :col 0  :size_x 5  :size_y 3}
                        {:row 7  :col 6  :size_x 6  :size_y 8}
                        {:row 25 :col 7  :size_x 11 :size_y 10}
                        {:row 7  :col 0  :size_x 6  :size_y 4}
                        {:row 23 :col 0  :size_x 18 :size_y 2}
                        {:row 5  :col 0  :size_x 18 :size_y 2}
                        {:row 0  :col 0  :size_x 18 :size_y 2}
                        ;; these 2 last cases is a specical case where the last card has (width, height) = (1, 1)
                        ;; it's to test an edge case to make sure downgrade from 24 -> 18 does not remove this card
                        {:row 36 :col 0  :size_x 17 :size_y 1}
                        {:row 36 :col 17 :size_x 1  :size_y 1}]
          revision-id (first (t2/insert-returning-pks! (t2/table-name :model/Revision)
                                                       {:object    (json/generate-string {:cards cards})
                                                        :model     "Dashboard"
                                                        :model_id  1
                                                        :user_id   user-id
                                                        :timestamp :%now}))]

      (migrate!)
      (testing "forward migration migrate correclty"
        (is (= [{:row 15 :col 0  :size_x 16 :size_y 8}
                {:row 7  :col 16 :size_x 8  :size_y 8}
                {:row 2  :col 7  :size_x 6  :size_y 3}
                {:row 25 :col 0  :size_x 9  :size_y 10}
                {:row 2  :col 0  :size_x 7  :size_y 3}
                {:row 7  :col 8  :size_x 8  :size_y 8}
                {:row 25 :col 9  :size_x 15 :size_y 10}
                {:row 7  :col 0  :size_x 8  :size_y 4}
                {:row 23 :col 0  :size_x 24 :size_y 2}
                {:row 5  :col 0  :size_x 24 :size_y 2}
                {:row 0  :col 0  :size_x 24 :size_y 2}
                {:row 36 :col 0  :size_x 23 :size_y 1}
                {:row 36 :col 23 :size_x 1  :size_y 1}]
               (-> (t2/select-one (t2/table-name :model/Revision) :id revision-id)
                   :object (json/parse-string true) :cards))))
      (migrate! :down 46)
      (testing "downgrade works correctly"
        (is (= cards (-> (t2/select-one (t2/table-name :model/Revision) :id revision-id)
                         :object (json/parse-string true) :cards)))))))

(deftest migrate-dashboard-revision-grid-from-18-to-24-handle-faliure-test
  (impl/test-migrations ["v47.00-032" "v47.00-033"] [migrate!]
    (let [user-id      (first (t2/insert-returning-pks! (t2/table-name :model/User)
                                                        {:first_name  "Howard"
                                                         :last_name   "Hughes"
                                                         :email       "howard@aircraft.com"
                                                         :password    "superstrong"
                                                         :date_joined :%now}))

          cards        [{:id 1 :row 0 :col 0 :size_x 4 :size_y 4}          ; correct case
                        {:id 2 :row 0 :col 0 :sizeX 4 :sizeY 4}            ; sizeX and sizeY are legacy names
                        {:id 3 :row nil :col nil :size_x nil :size_y nil}  ; contains nil fields
                        {:id 4 :row "x" :col "x" :size_x "x" :size_y "x"}  ; string values need to be skipped
                        {:id 5 :row 0 :col 0 :size_x 4 :size_y 4 :series [1 2 3]}]  ; include keys other than size
          revision-id (first (t2/insert-returning-pks! (t2/table-name :model/Revision)
                                                       {:object    (json/generate-string {:cards cards})
                                                        :model     "Dashboard"
                                                        :model_id  1
                                                        :user_id   user-id
                                                        :timestamp :%now}))]

      (migrate!)
      (testing "forward migration migrate correclty and ignore failures"
        (is (= [{:id 1 :row 0 :col 0 :size_x 5 :size_y 4}
                {:id 2 :row 0 :col 0 :size_x 5 :size_y 4}
                {:id 3 :row 0 :col 0 :size_x 5 :size_y 4}
                {:id 4 :row "x" :col "x" :size_x "x" :size_y "x"}
                {:id 5 :row 0 :col 0 :size_x 5 :size_y 4 :series [1 2 3]}]
               (-> (t2/select-one (t2/table-name :model/Revision) :id revision-id)
                   :object (json/parse-string true) :cards))))
      (migrate! :down 46)
      (testing "downgrade works correctly and ignore failures"
        (is (= [{:id 1 :row 0 :col 0 :size_x 4 :size_y 4}
                {:id 2 :row 0 :col 0 :size_x 4 :size_y 4}
                {:id 3 :size_y 4 :size_x 4 :col 0 :row 0}
                {:id 4 :row "x" :col "x" :size_x "x" :size_y "x"}
                {:id 5 :row 0 :col 0 :size_x 4 :size_y 4 :series [1 2 3]}]
               (-> (t2/select-one (t2/table-name :model/Revision) :id revision-id)
                   :object (json/parse-string true) :cards)))))))

(defn two-cards-overlap? [box1 box2]
  (let [{col1    :col
         row1    :row
         size_x1 :size_x
         size_y1 :size_y} box1
        {col2    :col
         row2    :row
         size_x2 :size_x
         size_y2 :size_y} box2]
    (and (< col1 (+ col2 size_x2))
         (> (+ col1 size_x1) col2)
         (< row1 (+ row2 size_y2))
         (> (+ row1 size_y1) row2))))

(defn no-cards-are-overlap?
  "Return false if the cards contains at least 1 pair of cards that overlap, else returns true"
  [boxes]
  (not (some #(apply two-cards-overlap? %) (math.combo/combinations boxes 2))))

(defn no-cards-are-out-of-grid-and-has-size-0?
  "Return true if all cards are inside the grid and has size >= 1."
  [boxes grid-size]
  (every? (fn [{:keys [col size_x size_y]}]
            (and (<= (+ col size_x) grid-size)
                 (pos? size_x)
                 (pos? size_y)))
          boxes))

(def ^:private big-random-dashboard-cards
  (let [num-rows 20]
    (for [[col row size_x size_y]
          (loop [i   0
                 row 0
                 acc []]
            (let [size-y (inc (math/round (* 6 (math/random))))]
              (if (> i num-rows)
                acc
                (recur
                  (inc i)
                  (+ row size-y)
                  (concat acc
                          (loop [col     0
                                 acc-row []]
                            (let [size-x  (inc (math/round (* 9 (math/random))))
                                  new-col (+ col size-x)]
                              ;; we want to ensure we have a card at the end of the row
                              (if (>= new-col 18)
                                (cons [col row (- 18 col) size-y] acc-row)
                                ;; probability of skipping is 5%
                                (if (> (math/random) 0.95)
                                  (recur (+ col size-x) acc-row)
                                  (recur (+ col size-x) (cons [col row size-x size-y] acc-row)))))))))))]
      {:row    row
       :col    col
       :size_x size_x
       :size_y size_y})))

(deftest migrated-grid-18-to-24-stretch-test
  (let [migrated-to-18   (map @#'custom-migrations/migrate-dashboard-grid-from-18-to-24 big-random-dashboard-cards)
        rollbacked-to-24 (map @#'custom-migrations/migrate-dashboard-grid-from-24-to-18 migrated-to-18)]

    (testing "make sure the initial arry is good to start with"
      (is (true? (no-cards-are-out-of-grid-and-has-size-0? big-random-dashboard-cards 18)))
      (is (true? (no-cards-are-overlap? big-random-dashboard-cards))))

    (testing "migrates to 24"
      (testing "shouldn't have any cards out of grid"
        (is (true? (no-cards-are-out-of-grid-and-has-size-0? migrated-to-18 24))))
      (testing "shouldn't have overlapping cards"
        (is (true? (no-cards-are-overlap? migrated-to-18)))))

    (testing "rollbacked to 18"
      (testing "shouldn't have any cards out of grid"
        (is (true? (no-cards-are-out-of-grid-and-has-size-0? rollbacked-to-24 18))))
      (testing "shouldn't have overlapping cards"
        (is (true? (no-cards-are-overlap? rollbacked-to-24)))))))

(deftest revision-migrate-legacy-column-settings-field-refs-test
  (testing "Migrations v47.00-033: update visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-033"] [migrate!]
      (let [visualization-settings
            {"column_settings" (-> {["name" "column_name"]                              {"column_title" "ID6"},
                                    ["ref" ["field-literal" "column_name" "type/Text"]] {"column_title" "ID5"},
                                    ["ref" ["field-id" 39]]                             {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                            {"column_title" "ID2"},
                                    ["ref" ["fk->" ["field-id" 39] ["field-id" 40]]]    {"column_title" "ID3"},
                                    ["ref" ["fk->" 41 42]]                              {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["name" "column_name"]                                    {"column_title" "ID6"},
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "ID5"},
                                    ["ref" ["field" 39 nil]]                                  {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                                  {"column_title" "ID2"},
                                    ["ref" ["field" 40 {"source-field" 39}]]                  {"column_title" "ID3"},
                                    ["ref" ["field" 42 {"source-field" 41}]]                  {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            card        {:visualization_settings visualization-settings}
            revision-id (t2/insert-returning-pks! (t2/table-name :model/Revision)
                                                  {:model     "Card"
                                                   :model_id  1 ;; TODO: this could be a foreign key in the future
                                                   :user_id   user-id
                                                   :object    (json/generate-string card)
                                                   :timestamp :%now})]
        (migrate!)
        (testing "legacy column_settings are updated"
          (is (= expected
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get "visualization_settings")))))
        (testing "legacy column_settings are updated to the current format"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)
                     walk/stringify-keys)
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get "visualization_settings")))))
        (testing "visualization_settings are equivalent before and after migration"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings))
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get "visualization_settings")
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)))))))))

(deftest revision-add-join-alias-to-column-settings-field-refs-test
  (testing "Migrations v47.00-034: update visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-034"] [migrate!]
      (let [visualization-settings
            {"column_settings" (-> {["ref" ["field" 1 {"join-alias" "Joined table"}]]         {"column_title" "THIS SHOULD TAKE PRECENDCE"}
                                    ["ref" ["field" 1 nil]]                                   {"column_title" "THIS SHOULD NOT TAKE PRECEDENCE"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                    {"column_title" "2"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "3"}
                                    ["name" "column_name"]                                    {"column_title" "4"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["ref" ["field" 1 {"join-alias" "Joined table"}]]             {"column_title" "THIS SHOULD TAKE PRECENDCE"}
                                    ["ref" ["field" 1 nil]]                                       {"column_title" "THIS SHOULD NOT TAKE PRECEDENCE"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                        {"column_title" "2"}
                                    ["ref" ["field" 2 {"source-field" 3
                                                       "join-alias"   "Joined table"}]]           {"column_title" "2"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]]     {"column_title" "3"}
                                    ["ref" ["field" "column_name" {"base-type"  "type/Text"
                                                                   "join-alias" "Joined table"}]] {"column_title" "3"}
                                    ["name" "column_name"]                                        {"column_title" "4"}}
                                   (update-keys json/generate-string))}
            card        {:visualization_settings visualization-settings
                         :dataset_query          {:database 1
                                                  :query    {:joins        [{:alias        "Joined table"
                                                                             :condition    [:=
                                                                                            [:field 43 nil]
                                                                                            [:field 46 {:join-alias "Joined table"}]]
                                                                             :fields       :all
                                                                             :source-table 5}]
                                                             :source-table 2}
                                                  :type     :query}}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            revision-id (t2/insert-returning-pks! (t2/table-name :model/Revision)
                                                  {:model     "Card"
                                                   :model_id  1 ;; TODO: this could be a foreign key in the future
                                                   :user_id   user-id
                                                   :object    (json/generate-string card)
                                                   :timestamp :%now})]
        (migrate!)
        (testing "column_settings field refs are updated"
          (is (= expected
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get "visualization_settings")))))
        (migrate! :down 46)
        (testing "down migration restores original visualization_settings, except it's okay if join-alias are missing"
          (is (= (m/dissoc-in visualization-settings
                              ["column_settings" (json/generate-string ["ref" ["field" 1 {"join-alias" "Joined table"}]])])
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get "visualization_settings")))))))))

(deftest migrate-legacy-dashboard-card-column-settings-field-refs-test
  (testing "Migrations v47.00-043: update report_dashboardcard.visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-043"] [migrate!]
      (let [visualization-settings
            {"column_settings" (-> {["name" "column_name"]                              {"column_title" "ID6"},
                                    ["ref" ["field-literal" "column_name" "type/Text"]] {"column_title" "ID5"},
                                    ["ref" ["field-id" 39]]                             {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                            {"column_title" "ID2"},
                                    ["ref" ["fk->" ["field-id" 39] ["field-id" 40]]]    {"column_title" "ID3"},
                                    ["ref" ["fk->" 41 42]]                              {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["name" "column_name"]                                    {"column_title" "ID6"},
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "ID5"},
                                    ["ref" ["field" 39 nil]]                                  {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                                  {"column_title" "ID2"},
                                    ["ref" ["field" 40 {"source-field" 39}]]                  {"column_title" "ID3"},
                                    ["ref" ["field" 42 {"source-field" 41}]]                  {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id     (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                  {:name                   "My Saved Question"
                                                   :created_at             :%now
                                                   :updated_at             :%now
                                                   :creator_id             user-id
                                                   :display                "table"
                                                   :dataset_query          "{}"
                                                   :visualization_settings "{}"
                                                   :database_id            database-id
                                                   :collection_id          nil})
            dashboard-id (t2/insert-returning-pks! :model/Dashboard {:name                "My Dashboard"
                                                                     :creator_id          user-id
                                                                     :parameters          []})
            dashcard-id  (t2/insert-returning-pks! :model/DashboardCard {:dashboard_id dashboard-id
                                                                         :visualization_settings (json/generate-string visualization-settings)
                                                                         :card_id      card-id
                                                                         :size_x       4
                                                                         :size_y       4
                                                                         :col          1
                                                                         :row          1})]
        (migrate!)
        (testing "legacy column_settings are updated"
          (is (= expected
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     json/parse-string))))
        (testing "legacy column_settings are updated to the current format"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)
                     walk/stringify-keys)
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     json/parse-string))))
        (testing "visualization_settings are equivalent before and after migration"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings))
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     json/parse-string
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)))))))))

(deftest add-join-alias-to-dashboard-card-visualization-settings-field-refs-test
  (testing "Migrations v47.00-044: update report_dashboardcard.visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-044"] [migrate!]
      (let [result_metadata
            [{:field_ref [:field 1 nil]}
             {:field_ref [:field 1 {:join-alias "Self-joined Table"}]}
             {:field_ref [:field 2 {:source-field 3}]}
             {:field_ref [:field 3 {:temporal-unit "default"}]}
             {:field_ref [:field 4 {:join-alias "Self-joined Table"
                                    :binning {:strategy "default"}}]}
             {:field_ref [:field "column_name" {:base-type :type/Text}]}
             {:field_ref [:name "column_name"]}]
            visualization-settings
            {"column_settings" (-> {["ref" ["field" 1 nil]]                                   {"column_title" "1"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                    {"column_title" "2"}
                                    ["ref" ["field" 3 nil]]                                   {"column_title" "3"}
                                    ["ref" ["field" 4 nil]]                                   {"column_title" "4"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "5"}
                                    ["name" "column_name"]                                    {"column_title" "6"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["ref" ["field" 1 nil]]                                   {"column_title" "1"}
                                    ["ref" ["field" 1 {"join-alias" "Self-joined Table"}]]    {"column_title" "1"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                    {"column_title" "2"}
                                    ["ref" ["field" 3 nil]]                                   {"column_title" "3"}
                                    ["ref" ["field" 4 {"join-alias" "Self-joined Table"}]]    {"column_title" "4"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "5"}
                                    ["name" "column_name"]                                    {"column_title" "6"}}
                                   (update-keys json/generate-string))}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id     (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                  {:name                   "My Saved Question"
                                                   :created_at             :%now
                                                   :updated_at             :%now
                                                   :creator_id             user-id
                                                   :display                "table"
                                                   :dataset_query          "{}"
                                                   :result_metadata        (json/generate-string result_metadata)
                                                   :visualization_settings "{}"
                                                   :database_id            database-id
                                                   :collection_id          nil})
            dashboard-id (t2/insert-returning-pks! :model/Dashboard {:name                "My Dashboard"
                                                                     :creator_id          user-id
                                                                     :parameters          []})
            dashcard-id  (t2/insert-returning-pks! :model/DashboardCard {:dashboard_id dashboard-id
                                                                         :visualization_settings (json/generate-string visualization-settings)
                                                                         :card_id      card-id
                                                                         :size_x       4
                                                                         :size_y       4
                                                                         :col          1
                                                                         :row          1})]
        (migrate!)
        (testing "After the migration, column_settings field refs are updated to include join-alias"
          (is (= expected
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     json/parse-string))))
        (migrate! :down 46)
        (testing "After reversing the migration, column_settings field refs are updated to remove join-alias"
          (is (= visualization-settings
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     json/parse-string))))))))

(deftest revision-migrate-legacy-dashboard-card-column-settings-field-refs-test
  (testing "Migrations v47.00-045: update dashboard cards' visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-045"] [migrate!]
      (let [visualization-settings
            {"column_settings" (-> {["name" "column_name"]                              {"column_title" "ID6"},
                                    ["ref" ["field-literal" "column_name" "type/Text"]] {"column_title" "ID5"},
                                    ["ref" ["field-id" 39]]                             {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                            {"column_title" "ID2"},
                                    ["ref" ["fk->" ["field-id" 39] ["field-id" 40]]]    {"column_title" "ID3"},
                                    ["ref" ["fk->" 41 42]]                              {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["name" "column_name"]                                    {"column_title" "ID6"},
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "ID5"},
                                    ["ref" ["field" 39 nil]]                                  {"column_title" "ID1"},
                                    ["ref" ["field" 40 nil]]                                  {"column_title" "ID2"},
                                    ["ref" ["field" 40 {"source-field" 39}]]                  {"column_title" "ID3"},
                                    ["ref" ["field" 42 {"source-field" 41}]]                  {"column_title" "ID4"}}
                                   (update-keys json/generate-string))}
            user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            dashboard   {:cards [{:visualization_settings visualization-settings}]}
            revision-id (t2/insert-returning-pks! (t2/table-name :model/Revision)
                                                  {:model     "Dashboard"
                                                   :model_id  1
                                                   :user_id   user-id
                                                   :object    (json/generate-string dashboard)
                                                   :timestamp :%now})]
        (migrate!)
        (testing "legacy column_settings are updated"
          (is (= expected
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get-in ["cards" 0 "visualization_settings"])))))
        (testing "legacy column_settings are updated to the current format"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)
                     walk/stringify-keys)
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get-in ["cards" 0 "visualization_settings"])))))
        (testing "visualization_settings are equivalent before and after migration"
          (is (= (-> visualization-settings
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings))
                 (-> (t2/query-one {:select [:object]
                                    :from   [:revision]
                                    :where  [:= :id revision-id]})
                     :object
                     json/parse-string
                     (get-in ["cards" 0 "visualization_settings"])
                     mi/normalize-visualization-settings
                     (#'mi/migrate-viz-settings)))))))))

(deftest revision-add-join-alias-to-dashboard-card-column-settings-field-refs-test
  (testing "Migrations v47.00-046: update dashboard cards' visualization_settings.column_settings legacy field refs"
    (impl/test-migrations ["v47.00-046"] [migrate!]
      (let [visualization-settings
            {"column_settings" (-> {["ref" ["field" 1 {"join-alias" "Joined table"}]]         {"column_title" "THIS SHOULD TAKE PRECENDCE"}
                                    ["ref" ["field" 1 nil]]                                   {"column_title" "THIS SHOULD NOT TAKE PRECEDENCE"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                    {"column_title" "2"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]] {"column_title" "3"}
                                    ["name" "column_name"]                                    {"column_title" "4"}}
                                   (update-keys json/generate-string))}
            expected
            {"column_settings" (-> {["ref" ["field" 1 {"join-alias" "Joined table"}]]             {"column_title" "THIS SHOULD TAKE PRECENDCE"}
                                    ["ref" ["field" 1 nil]]                                       {"column_title" "THIS SHOULD NOT TAKE PRECEDENCE"}
                                    ["ref" ["field" 2 {"source-field" 3}]]                        {"column_title" "2"}
                                    ["ref" ["field" 2 {"source-field" 3
                                                       "join-alias"   "Joined table"}]]           {"column_title" "2"}
                                    ["ref" ["field" "column_name" {"base-type" "type/Text"}]]     {"column_title" "3"}
                                    ["ref" ["field" "column_name" {"base-type"  "type/Text"
                                                                   "join-alias" "Joined table"}]] {"column_title" "3"}
                                    ["name" "column_name"]                                        {"column_title" "4"}}
                                   (update-keys json/generate-string))}
            user-id            (t2/insert-returning-pks! (t2/table-name :model/User)
                                                         {:first_name  "Howard"
                                                          :last_name   "Hughes"
                                                          :email       "howard@aircraft.com"
                                                          :password    "superstrong"
                                                          :date_joined :%now})
            database-id        (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                         {:name       "DB"
                                                          :engine     "h2"
                                                          :created_at :%now
                                                          :updated_at :%now
                                                          :details    "{}"})
            [card-id]          (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                         {:name                   "My Saved Question"
                                                          :created_at             :%now
                                                          :updated_at             :%now
                                                          :creator_id             user-id
                                                          :display                "table"
                                                          :dataset_query          (json/generate-string {:database 1
                                                                                                         :query    {:joins [{:alias        "Joined table"
                                                                                                                             :condition    [:=
                                                                                                                                            [:field 43 nil]
                                                                                                                                            [:field 46 {:join-alias "Joined table"}]]
                                                                                                                             :fields       :all
                                                                                                                             :source-table 5}]
                                                                                                                    :source-table 2}
                                                                                                         :type     :query})
                                                          :result_metadata        "{}"
                                                          :visualization_settings "{}"
                                                          :database_id            database-id
                                                          :collection_id          nil})
            dashboard   {:cards [{:card_id                card-id
                                  :visualization_settings visualization-settings}]}
            revision-id (t2/insert-returning-pks! (t2/table-name :model/Revision)
                                                  {:model     "Dashboard"
                                                   :model_id  1
                                                   :user_id   user-id
                                                   :object    (json/generate-string dashboard)
                                                   :timestamp :%now})]
       (migrate!)
       (testing "column_settings field refs are updated"
         (is (= expected
                (-> (t2/query-one {:select [:object]
                                   :from   [:revision]
                                   :where  [:= :id revision-id]})
                    :object
                    json/parse-string
                    (get-in ["cards" 0 "visualization_settings"])))))
       (migrate! :down 46)
       (testing "down migration restores original visualization_settings, except it's okay if join-alias are missing"
         (is (= (m/dissoc-in visualization-settings
                             ["column_settings" (json/generate-string ["ref" ["field" 1 {"join-alias" "Joined table"}]])])
                (-> (t2/query-one {:select [:object]
                                   :from   [:revision]
                                   :where  [:= :id revision-id]})
                    :object
                    json/parse-string
                    (get-in ["cards" 0 "visualization_settings"])))))))))

(deftest migrate-database-options-to-database-settings-test
  (let [do-test
        (fn [encrypted?]
          ;; set-new-database-permissions! relies on the data_permissions table, which was added after the migrations
          ;; we're testing here, so let's override it to be a no-op. Other tests add DBs using the table name instead of
          ;; model name, so they don't hit the post-insert hook, but here we're relying on the transformations being
          ;; applied so we can't do that.
          (with-redefs [database/set-new-database-permissions! (constantly nil)]
           (impl/test-migrations ["v48.00-001" "v48.00-002"] [migrate!]
             (let [default-db                {:name       "DB"
                                              :engine     "postgres"
                                              :created_at :%now
                                              :updated_at :%now}
                   success-id                (first (t2/insert-returning-pks!
                                                     :model/Database
                                                     (merge default-db
                                                            {:options  (json/generate-string {:persist-models-enabled true})
                                                             :settings {:database-enable-actions true}})))
                   options-nil-settings-id   (first (t2/insert-returning-pks!
                                                     :model/Database
                                                     (merge default-db
                                                            {:options  (json/generate-string {:persist-models-enabled true})
                                                             :settings nil})))
                   options-empty-settings-id (first (t2/insert-returning-pks!
                                                     :model/Database
                                                     (merge default-db
                                                            {:options  (json/generate-string {:persist-models-enabled true})
                                                             :settings {}})))
                   nil-options-id            (first (t2/insert-returning-pks!
                                                     :model/Database
                                                     (merge default-db
                                                            {:options  nil
                                                             :settings {:database-enable-actions true}})))
                   empty-options-id          (first (t2/insert-returning-pks!
                                                     :model/Database
                                                     (merge default-db
                                                            {:options  "{}"
                                                             :settings {:database-enable-actions true}})))]
               (testing "fowward migration\n"
                 (when encrypted?
                   (testing "make sure the settings is encrypted before the migration"
                     (is (true? (encryption/possibly-encrypted-string?
                                  (:settings (t2/query-one {:select [:settings]
                                                            :from [:metabase_database]
                                                            :where [[:= :id success-id]]})))))))
                 (migrate!)
                 (when encrypted?
                   (testing "make sure the settings is encrypted after the migration"
                     (is (true? (encryption/possibly-encrypted-string?
                                  (:settings (t2/query-one {:select [:settings]
                                                            :from [:metabase_database]
                                                            :where [[:= :id success-id]]})))))))

                 (testing "the options is merged into settings correctly"
                   (is (= {:persist-models-enabled true
                           :database-enable-actions true}
                          (t2/select-one-fn :settings :model/Database success-id)))
                   (testing "even when settings is nil"
                     (is (= {:persist-models-enabled true}
                            (t2/select-one-fn :settings :model/Database options-nil-settings-id))))
                   (testing "even when settings is empty"
                     (is (= {:persist-models-enabled true}
                            (t2/select-one-fn :settings :model/Database options-empty-settings-id)))))

                 (testing "nil or empty options doesn't break migration"
                   (is (= {:database-enable-actions true}
                          (t2/select-one-fn :settings :model/Database nil-options-id)))
                   (is (= {:database-enable-actions true}
                          (t2/select-one-fn :settings :model/Database empty-options-id)))))

              (testing "rollback migration"
                  (migrate! :down 46)
                  (testing "the persist-models-enabled is assoced back to options"
                    (is (= {:options  "{\"persist-models-enabled\":true}"
                            :settings {:database-enable-actions true}}
                           (t2/select-one [:model/Database :settings :options] success-id)))
                    (is (= {:options  nil
                            :settings {:database-enable-actions true}}
                           (t2/select-one [:model/Database :settings :options] empty-options-id))))

                  (testing "if settings doesn't have :persist-models-enabled, then options is empty map"))))))]
    (do-test false)
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (do-test true))))

(deftest fix-click-through-test
  (let [migrate (fn [card dash]
                  (:visualization_settings
                   (#'custom-migrations/fix-click-through {:id                     1
                                                           :dashcard_visualization dash
                                                           :card_visualization     card})))]
    (testing "toplevel"
      (let [card {"some_setting:"       {"foo" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "link"}
            dash {"other_setting" {"bar" 123}}]
        (is (= {"other_setting"  {"bar" 123}
                "click_behavior" {"type"         "link"
                                  "linkType"     "url"
                                  "linkTemplate" "http://example.com/{{col_name}}"}}
               (migrate card dash)))))

    (testing "top level disabled"
      (let [card {"some_setting:"       {"foo" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "link"}
            dash {"other_setting"       {"bar" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "menu"}]
        ;;click: "menu" turned off the custom drill through so it's not migrated. Dropping click and click_link_template would be fine but isn't needed.
        (is (nil? (migrate card dash)))))
    (testing "column settings"
      (let [card {"some_setting" {"foo" 123}
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]"
                   {"view_as"       "link"
                    "link_template" "http://example.com/{{id}}"
                    "link_text"     "here is my id: {{id}}"}}}
            dash {"other_setting" {"bar" 123}
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]" {"fun_formatting" "foo"}
                   "[\"ref\",[\"field-id\",2]]" {"other_fun_formatting" 123}}}]
        (is (= {"other_setting" {"bar" 123}
                "column_settings"
                {"[\"ref\",[\"field-id\",1]]"
                 {"fun_formatting" "foo"
                  "click_behavior" {"type"             "link"
                                    "linkType"         "url"
                                    "linkTemplate"     "http://example.com/{{id}}"
                                    "linkTextTemplate" "here is my id: {{id}}"}}
                 "[\"ref\",[\"field-id\",2]]"
                 {"other_fun_formatting" 123}}}
               (migrate card dash)))))
    (testing "manually updated new behavior"
      (let [card {"some_setting"        {"foo" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "link"}
            dash {"other_setting"  {"bar" 123}
                  "click_behavior" {"type"         "link"
                                    "linkType"     "url"
                                    "linkTemplate" "http://example.com/{{other_col_name}}"}}]
        (is (nil? (migrate card dash)))))
    (testing "Manually updated to new behavior on Column"
      (let [card {"some_setting" {"foo" 123},
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]"
                   {"view_as"                  "link"
                    "link_template"            "http://example.com/{{id}}"
                    "other_special_formatting" "currency"}
                   "[\"ref\",[\"field-id\",2]]"
                   {"view_as"              "link",
                    "link_template"        "http://example.com/{{something_else}}",
                    "other_fun_formatting" 0}}}
            dash {"other_setting" {"bar" 123}
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]"
                   {"click_behavior"
                    {"type"         "link"
                     "linkType"     "url"
                     "linkTemplate" "http://example.com/{{id}}"}}
                   "[\"ref\",[\"field-id\",2]]"
                   {"other_fun_formatting" 123}}}]
        (is (= {"other_setting" {"bar" 123}
                "column_settings"
                {"[\"ref\",[\"field-id\",1]]"
                 {"click_behavior"
                  {"type"         "link",
                   "linkType"     "url",
                   "linkTemplate" "http://example.com/{{id}}"}}
                 "[\"ref\",[\"field-id\",2]]"
                 {"other_fun_formatting" 123,
                  "click_behavior"
                  {"type"         "link",
                   "linkType"     "url",
                   "linkTemplate" "http://example.com/{{something_else}}"}}}}
               (migrate card dash)))))
    (testing "If there is migration eligible on dash but also new style on dash, new style wins"
      (let [dash {"column_settings"
                  {"[\"ref\",[\"field-id\",4]]"
                   {"view_as"       "link"
                    "link_template" "http://old" ;; this stuff could be migrated
                    "link_text"     "old"
                    "column_title"  "column title"
                    "click_behavior"
                    {"type"             "link",
                     "linkType"         "url", ;; but there is already a new style and it wins
                     "linkTemplate"     "http://new",
                     "linkTextTemplate" "new"}}}}]
        ;; no change
        (is (nil? (migrate nil dash)))))
    (testing "flamber case"
      (let [card {"column_settings"
                  {"[\"ref\",[\"field-id\",4]]"
                   {"view_as"       "link"
                    "link_template" "http//localhost/?QCDT&{{CATEGORY}}"
                    "link_text"     "MyQCDT {{CATEGORY}}"
                    "column_title"  "QCDT Category"}
                   "[\"ref\",[\"field-id\",6]]"
                   {"view_as"       "link"
                    "column_title"  "QCDT Rating"
                    "link_text"     "Rating {{RATING}}"
                    "link_template" "http//localhost/?QCDT&{{RATING}}"
                    "prefix"        "prefix-"
                    "suffix"        "-suffix"}
                   "[\"ref\",[\"field-id\",5]]"
                   {"view_as"       nil
                    "link_text"     "QCDT was disabled"
                    "link_template" "http//localhost/?QCDT&{{TITLE}}"
                    "column_title"  "(QCDT disabled) Title"}}
                  "table.pivot_column" "CATEGORY"
                  "table.cell_column"  "PRICE"}
            dash {"table.cell_column"  "PRICE"
                  "table.pivot_column" "CATEGORY"
                  "column_settings"
                  {"[\"ref\",[\"field-id\",5]]"
                   {"view_as"       nil
                    "link_text"     "QCDT was disabled"
                    "link_template" "http//localhost/?QCDT&{{TITLE}}"
                    "column_title"  "(QCDT disabled) Title"}
                   "[\"ref\",[\"field-id\",4]]"
                   {"view_as"       "link"
                    "link_template" "http//localhost/?QCDT&{{CATEGORY}}"
                    "link_text"     "MyQCDT {{CATEGORY}}"
                    "column_title"  "QCDT Category"
                    "click_behavior"
                    {"type"             "link"
                     "linkType"         "url"
                     "linkTemplate"     "http//localhost/?CB&{{CATEGORY}}"
                     "linkTextTemplate" "MyCB {{CATEGORY}}"}}
                   "[\"ref\",[\"field-id\",6]]"
                   {"view_as"       "link"
                    "column_title"  "QCDT Rating"
                    "link_text"     "Rating {{RATING}}"
                    "link_template" "http//localhost/?QCDT&{{RATING}}"
                    "prefix"        "prefix-"
                    "suffix"        "-suffix"}}
                  "card.title"         "Table with QCDT - MANUALLY ADDED CB 37"}]
        (is (= {"card.title"         "Table with QCDT - MANUALLY ADDED CB 37"
                "column_settings"
                {"[\"ref\",[\"field-id\",4]]"
                 {"column_title"  "QCDT Category"
                  "view_as"       "link"
                  "link_template" "http//localhost/?QCDT&{{CATEGORY}}"
                  "link_text"     "MyQCDT {{CATEGORY}}"
                  "click_behavior"
                  {"type"             "link"
                   "linkType"         "url"
                   "linkTemplate"     "http//localhost/?CB&{{CATEGORY}}"
                   "linkTextTemplate" "MyCB {{CATEGORY}}"}}
                 "[\"ref\",[\"field-id\",5]]"
                 {"link_text"     "QCDT was disabled"
                  "column_title"  "(QCDT disabled) Title"
                  "link_template" "http//localhost/?QCDT&{{TITLE}}"}
                 "[\"ref\",[\"field-id\",6]]"
                 {"prefix"        "prefix-"
                  "suffix"        "-suffix"
                  "column_title"  "QCDT Rating"
                  "view_as"       "link"
                  "link_text"     "Rating {{RATING}}"
                  "link_template" "http//localhost/?QCDT&{{RATING}}"
                  "click_behavior"
                  {"type"             "link"
                   "linkType"         "url"
                   "linkTemplate"     "http//localhost/?QCDT&{{RATING}}"
                   "linkTextTemplate" "Rating {{RATING}}"}}}
                "table.cell_column"  "PRICE"
                "table.pivot_column" "CATEGORY"}
               (migrate card dash)))))))

(deftest fix-click-through-general-test
  (testing "general case"
    (let [card-vis              {"column_settings"
                                 {"[\"ref\",[\"field-id\",2]]"
                                  {"view_as"       "link",
                                   "link_template" "http://example.com/{{ID}}",
                                   "link_text"     "here's an id: {{ID}}"},
                                  "[\"ref\",[\"field-id\",6]]"
                                  {"view_as"       "link",
                                   "link_template" "http://example.com//{{id}}",
                                   "link_text"     "here is my id: {{id}}"}},
                                 "table.pivot_column"  "QUANTITY",
                                 "table.cell_column"   "DISCOUNT",
                                 "click"               "link",
                                 "click_link_template" "http://example.com/{{count}}",
                                 "graph.dimensions"    ["CREATED_AT"],
                                 "graph.metrics"       ["count"],
                                 "graph.show_values"   true}
          original-dashcard-vis {"click"            "link",
                                 "click_link_template"
                                 "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}",
                                 "graph.dimensions" ["CREATED_AT" "CATEGORY"],
                                 "graph.metrics"    ["count"]}
          fixed                 (#'custom-migrations/fix-click-through {:id                     1,
                                                                        :card_visualization     card-vis
                                                                        :dashcard_visualization original-dashcard-vis})]
      (is (= {:id 1,
              :visualization_settings
              {"graph.dimensions"    ["CREATED_AT" "CATEGORY"],
               "graph.metrics"       ["count"],
               "click"               "link",
               "click_link_template" "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}",
               "click_behavior"
               {"type"         "link",
                "linkType"     "url",
                "linkTemplate" "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}"},
               "column_settings"
               ;; note none of this keywordizes keys in json parsing since these structures are gross as keywords
               {"[\"ref\",[\"field-id\",2]]"
                {"click_behavior"
                 {"type"             "link",
                  "linkType"         "url",
                  "linkTemplate"     "http://example.com/{{ID}}",
                  "linkTextTemplate" "here's an id: {{ID}}"}},
                "[\"ref\",[\"field-id\",6]]"
                {"click_behavior"
                 {"type"             "link",
                  "linkType"         "url",
                  "linkTemplate"     "http://example.com//{{id}}",
                  "linkTextTemplate" "here is my id: {{id}}"}}}}}
             fixed))
      (testing "won't fix if fix is already applied"
        ;; a customer got a custom script from flamber (for which this is making that fix available for everyone. See
        ;; #15014)
        (is (= nil (#'custom-migrations/fix-click-through
                    {:id                     1
                     :card_visualization     card-vis
                     :dashcard_visualization (:visualization_settings fixed)}))))))

  (testing "ignores columns when `view_as` is null"
    (let [card-viz {"column_settings"
                    {"normal"
                     ;; this one is view_as link so we should get it
                     {"view_as"       "link",
                      "link_template" "dash",
                      "link_text"     "here's an id: {{ID}}"}
                     "null-view-as"
                     {"view_as"       nil
                      "link_template" "i should not be present",
                      "link_text"     "i should not be present"}}}
          dash-viz {}]
      (is (= ["normal"]
             (keys (get-in
                    (#'custom-migrations/fix-click-through {:id                     1
                                                            :card_visualization     card-viz
                                                            :dashcard_visualization dash-viz})
                    [:visualization_settings "column_settings"])))))))

(deftest migrate-click-through-test
  (let [expect-correct-settings!
        (fn [f]
          (let [card-vis       (json/generate-string
                                {"column_settings"
                                 {"[\"ref\",[\"field-id\",2]]"
                                  {"view_as"       "link",
                                   "link_template" "http://example.com/{{ID}}",
                                   "link_text"     "here's an id: {{ID}}"},
                                  "[\"ref\",[\"field-id\",6]]"
                                  {"view_as"       "link",
                                   "link_template" "http://example.com//{{id}}",
                                   "link_text"     "here is my id: {{id}}"}},
                                 "table.pivot_column"  "QUANTITY",
                                 "table.cell_column"   "DISCOUNT",
                                 "click"               "link",
                                 "click_link_template" "http://example.com/{{count}}",
                                 "graph.dimensions"    ["CREATED_AT"],
                                 "graph.metrics"       ["count"],
                                 "graph.show_values"   true})
                dashcard-vis   (json/generate-string
                                {"click"            "link",
                                 "click_link_template"
                                 "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}",
                                 "graph.dimensions" ["CREATED_AT" "CATEGORY"],
                                 "graph.metrics"    ["count"]})
                [user-id]      (t2/insert-returning-pks! (t2/table-name :model/User)
                                                         {:first_name  "Howard"
                                                          :last_name   "Hughes"
                                                          :email       "howard@aircraft.com"
                                                          :password    "superstrong"
                                                          :date_joined :%now})
                [database-id]  (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                         {:name       "DB"
                                                          :engine     "h2"
                                                          :created_at :%now
                                                          :updated_at :%now
                                                          :details    "{}"})
                [card-id]      (t2/insert-returning-pks!
                                :report_card
                                {:visualization_settings card-vis
                                 :display                "table"
                                 :dataset_query          "{}"
                                 :creator_id             user-id
                                 :database_id            database-id
                                 :name                   "My Card"
                                 :created_at             :%now
                                 :updated_at             :%now})
                [dashboard-id] (t2/insert-returning-pks! :model/Dashboard {:name       "My Dashboard"
                                                                           :creator_id user-id
                                                                           :parameters []})
                [dashcard-id]  (t2/insert-returning-pks! :model/DashboardCard {:dashboard_id           dashboard-id
                                                                               :visualization_settings dashcard-vis
                                                                               :card_id                card-id
                                                                               :size_x                 4
                                                                               :size_y                 4
                                                                               :col                    1
                                                                               :row                    1})
                expected-settings {:graph.dimensions ["CREATED_AT" "CATEGORY"],
                                   :graph.metrics    ["count"],
                                   :click            "link",
                                   :click_link_template
                                   "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}"
                                   :click_behavior
                                   {:type         "link",
                                    :linkType     "url",
                                    :linkTemplate "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}"},
                                   :column_settings
                                   ;; the model keywordizes the json parsing yielding this monstrosity below
                                   {"[\"ref\",[\"field\",2,null]]"
                                    {:click_behavior
                                     {:type             "link",
                                      :linkType         "url",
                                      :linkTemplate     "http://example.com/{{ID}}",
                                      :linkTextTemplate "here's an id: {{ID}}"}},
                                    "[\"ref\",[\"field\",6,null]]"
                                    {:click_behavior
                                     {:type             "link",
                                      :linkType         "url",
                                      :linkTemplate     "http://example.com//{{id}}",
                                      :linkTextTemplate "here is my id: {{id}}"}}}}]
            (f)
            (is (= expected-settings
                   (-> (t2/select-one :model/DashboardCard :id dashcard-id)
                       :visualization_settings)))))]
    (testing "Running the migration from scratch"
      (impl/test-migrations ["v48.00-022"] [migrate!]
        (expect-correct-settings! migrate!)))
    (testing "Running the migration after a previous data-migration still works"
      (impl/test-migrations ["v48.00-022"] [migrate!]
        (expect-correct-settings! (fn []
                                    (#'custom-migrations/migrate-click-through!)
                                    (migrate!)))))))

(defn- get-json-setting
  [setting-k]
  (json/parse-string (t2/select-one-fn :value :setting :key (name setting-k))))

(defn- call-with-ldap-and-sso-configured [ldap-group-mappings sso-group-mappings f]
  (mt/with-temporary-raw-setting-values
    [ldap-group-mappings    (json/generate-string ldap-group-mappings)
     saml-group-mappings    (json/generate-string sso-group-mappings)
     jwt-group-mappings     (json/generate-string sso-group-mappings)
     saml-enabled           "true"
     ldap-enabled           "true"
     jwt-enabled            "true"]
    (f)))

(defmacro ^:private with-ldap-and-sso-configured
  "Run body with ldap and SSO configured, in which SSO will only be configured if enterprise is available"
  [ldap-group-mappings sso-group-mappings & body]
  (binding [setting/*allow-retired-setting-names* true]
    `(call-with-ldap-and-sso-configured ~ldap-group-mappings ~sso-group-mappings (fn [] ~@body))))

;; The `remove-admin-from-group-mapping-if-needed` migration is written to run in OSS version
;; even though it might make changes to some enterprise-only settings.
;; In order to write tests that runs in both OSS and EE, we can't use
;; [[metabase.models.setting/get]] and [[metabase.test.util/with-temporary-setting-values]]
;; because they require all settings are defined.
;; That's why we use a set of helper functions that get setting directly from DB during tests
(deftest migrate-remove-admin-from-group-mapping-if-needed-test
  (let [admin-group-id        (u/the-id (perms-group/admin))
        sso-group-mappings    {"group-mapping-a" [admin-group-id (+ 1 admin-group-id)]
                               "group-mapping-b" [admin-group-id (+ 1 admin-group-id) (+ 2 admin-group-id)]}
        ldap-group-mappings   {"dc=metabase,dc=com" [admin-group-id (+ 1 admin-group-id)]}
        sso-expected-mapping  {"group-mapping-a" [(+ 1 admin-group-id)]
                               "group-mapping-b" [(+ 1 admin-group-id) (+ 2 admin-group-id)]}
        ldap-expected-mapping {"dc=metabase,dc=com" [(+ 1 admin-group-id)]}]

    (testing "Remove admin from group mapping for LDAP, SAML, JWT if they are enabled"
      (with-ldap-and-sso-configured ldap-group-mappings sso-group-mappings
        (#'custom-migrations/migrate-remove-admin-from-group-mapping-if-needed)
        (is (= ldap-expected-mapping (get-json-setting :ldap-group-mappings)))
        (is (= sso-expected-mapping (get-json-setting :jwt-group-mappings)))
        (is (= sso-expected-mapping (get-json-setting :saml-group-mappings)))))

    (testing "remove admin from group mapping for LDAP, SAML, JWT even if they are disabled"
      (with-ldap-and-sso-configured ldap-group-mappings sso-group-mappings
        (mt/with-temporary-raw-setting-values
          [ldap-enabled "false"
           saml-enabled "false"
           jwt-enabled  "false"]
          (#'custom-migrations/migrate-remove-admin-from-group-mapping-if-needed)
          (is (= ldap-expected-mapping (get-json-setting :ldap-group-mappings)))
          (is (= sso-expected-mapping (get-json-setting :jwt-group-mappings)))
          (is (= sso-expected-mapping (get-json-setting :saml-group-mappings))))))

    (testing "Don't remove admin group if `ldap-sync-admin-group` is enabled"
      (with-ldap-and-sso-configured ldap-group-mappings sso-group-mappings
        (mt/with-temporary-raw-setting-values
          [ldap-sync-admin-group "true"]
          (#'custom-migrations/migrate-remove-admin-from-group-mapping-if-needed)
          (is (= ldap-group-mappings (get-json-setting :ldap-group-mappings))))))))

(deftest check-data-migrations-rollback
  ;; We're actually testing `v48.00-024`, but we want the `migrate!` function to run all the migrations in 48
  ;; after rolling back to 47, so we're using `v48.00-000` as the start of the migration range in `test-migrations`
  (impl/test-migrations ["v48.00-000"] [migrate!]
    (testing "we can migrate even if data_migrations is empty"
      ;; 0 because we removed them and fresh db won't trigger any
      (is (= 0 (t2/count :data_migrations)))
      (migrate!))

    (testing "no data_migrations table after v.48.00-024"
      (is (thrown? ExceptionInfo
                   (t2/count :data_migrations))))

    (testing "rollback causes all known data_migrations to reappear"
      (migrate! :down 47)
      ;; 34 because there was a total of 34 data migrations (which are filled on rollback)
      (is (= 34 (t2/count :data_migrations))))))

(defn- table-and-column-of-type
  [ttype]
  (->> (t2/query
        [(case (mdb/db-type)
           :postgres
           (format "SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE data_type = '%s' AND table_schema = 'public';"
                   ttype)
           :mysql
           (format "SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE data_type = '%s' AND table_schema = '%s';"
                   ttype (-> (mdb/data-source) .getConnection .getCatalog))
           :h2
           (format "SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE data_type = '%s';"
                   ttype))])
       (map (fn [{:keys [table_name column_name is_nullable]}]
              [(keyword (u/lower-case-en table_name)) (keyword (u/lower-case-en column_name)) (= is_nullable "YES")]))
       set))

(deftest unify-type-of-time-columns-test
  (impl/test-migrations ["v49.00-054"] [migrate!]
    (let [db-type       (mdb/db-type)
          datetime-type (case db-type
                          :postgres "timestamp without time zone"
                          :h2       "TIMESTAMP"
                          :mysql    "datetime")]
        (testing "Sanity check"
          (is (true? (set/subset?
                      (set (#'custom-migrations/db-type->to-unified-columns db-type))
                      (table-and-column-of-type datetime-type)))))

        (testing "all of our time columns are now converted to timestamp-tz type, only changelog tables are intact"
          (migrate!)
          (is (= #{[:databasechangelog :dateexecuted false] [:databasechangeloglock :lockgranted true]}
                 (set (table-and-column-of-type datetime-type)))))

        (testing "downgrade should revert all converted columns to its original type"
          (migrate! :down 48)
          (is (true? (set/subset?
                      (set (#'custom-migrations/db-type->to-unified-columns db-type))
                      (table-and-column-of-type datetime-type)))))

        ;; this is a weird behavior on mariadb that I can only find on CI, but it's nice to have this test anw
        (testing "not nullable timestamp column should not have extra on update"
          (let [user-id (t2/insert-returning-pk! :core_user {:first_name  "Howard"
                                                             :last_name   "Hughes"
                                                             :email       "howard@aircraft.com"
                                                             :password    "superstrong"
                                                             :date_joined :%now})
                session (t2/insert-returning-instance! :core_session {:user_id    user-id
                                                                      :id         (str (random-uuid))
                                                                      :created_at :%now})]
            (t2/update! :core_session (:id session) {:anti_csrf_token "normal"})
            (testing "created_at shouldn't change if there is an update"
              (is (= (:created_at session)
                     (t2/select-one-fn :created_at :core_session :id (:id session))))))))))

(def ^:private deep-nested-map
  "A 35 level nested map to test for mariadb"
  (reduce (fn [m _]
            (hash-map "a" m))
          {:a 1}
          (range 35)))

(deftest card-revision-add-type-test
  (impl/test-migrations "v49.2024-01-22T11:52:00" [migrate!]
    (let [user-id          (:id (new-instance-with-default :core_user))
          db-id            (:id (new-instance-with-default :metabase_database))
          card             (new-instance-with-default :report_card {:dataset false :creator_id user-id :database_id db-id})
          model            (new-instance-with-default :report_card {:dataset true :creator_id user-id :database_id db-id})
          card-2           (new-instance-with-default :report_card {:dataset false :creator_id user-id :database_id db-id})
          card-revision-id (:id (new-instance-with-default :revision
                                                           {:object    (json/generate-string (dissoc card :type))
                                                            :model     "Card"
                                                            :model_id  (:id card)
                                                            :user_id   user-id}))
          model-revision-id (:id (new-instance-with-default :revision
                                                            {:object    (json/generate-string (dissoc model :type))
                                                             :model     "Card"
                                                             :model_id  (:id card)
                                                             :user_id   user-id}))
          ;; this is only here to test that the migration doesn't break when there's a deep nested map on mariadb see #41924
          _                (:id (new-instance-with-default :revision
                                                           {:object    (json/generate-string deep-nested-map)
                                                            :model     "Card"
                                                            :model_id  (:id card-2)
                                                            :user_id   user-id}))]
      (testing "sanity check revision object"
        (let [card-revision-object (t2/select-one-fn (comp json/parse-string :object) :revision card-revision-id)]
          (testing "doesn't have type"
            (is (not (contains? card-revision-object "type"))))
          (testing "has dataset"
            (is (contains? card-revision-object "dataset")))))

      (testing "after migration card revisions should have type"
        (migrate!)
        (let [card-revision-object  (t2/select-one-fn (comp json/parse-string :object) :revision card-revision-id)
              model-revision-object (t2/select-one-fn (comp json/parse-string :object) :revision model-revision-id)]
          (is (= "question" (get card-revision-object "type")))
          (is (= "model" (get model-revision-object "type")))))

      (testing "rollback should remove type and keep dataset"
        (migrate! :down 48)
        (let [card-revision-object  (t2/select-one-fn (comp json/parse-string :object) :revision card-revision-id)
              model-revision-object (t2/select-one-fn (comp json/parse-string :object) :revision model-revision-id)]
          (is (contains? card-revision-object "dataset"))
          (is (contains? model-revision-object "dataset"))
          (is (not (contains? card-revision-object "type")))
          (is (not (contains? model-revision-object "type"))))))))

(deftest card-revision-add-type-null-character-test
  (testing "CardRevisionAddType migration works even if there's a null character in revision.object (metabase#40835)")
  (impl/test-migrations "v49.2024-01-22T11:52:00" [migrate!]
    (let [user-id          (:id (new-instance-with-default :core_user))
          db-id            (:id (new-instance-with-default :metabase_database))
          card             (new-instance-with-default :report_card {:dataset false :creator_id user-id :database_id db-id})
          viz-settings     "{\"table.pivot_column\":\"\u0000..\\u0000\"}" ; note the escaped and unescaped null characters
          card-revision-id (:id (new-instance-with-default :revision
                                                           {:object    (json/generate-string
                                                                        (assoc (dissoc card :type)
                                                                               :visualization_settings viz-settings))
                                                            :model     "Card"
                                                            :model_id  (:id card)
                                                            :user_id   user-id}))]
      (testing "sanity check revision object"
        (let [card-revision-object (t2/select-one-fn (comp json/parse-string :object) :revision card-revision-id)]
          (testing "doesn't have type"
            (is (not (contains? card-revision-object "type"))))))
      (testing "after migration card revisions should have type"
        (migrate!)
        (let [card-revision-object  (t2/select-one-fn (comp json/parse-string :object) :revision card-revision-id)]
          (is (= "question" (get card-revision-object "type")))
          (testing "original visualization_settings should be preserved"
            (is (= viz-settings
                   (get card-revision-object "visualization_settings")))))))))

(deftest delete-scan-field-values-trigger-test
  (testing "We should delete the triggers for DBs that are configured not to scan their field values\n"
    (impl/test-migrations "v49.2024-04-09T10:00:03" [migrate!]
      (letfn [(do-test []
                (api.database-test/with-db-scheduler-setup
                  (let [db-with-full-schedules (new-instance-with-default :metabase_database
                                                                          {:metadata_sync_schedule      "0 0 * * * ? *"
                                                                           :cache_field_values_schedule "0 0 1 * * ? *"
                                                                           :is_full_sync                true
                                                                           :is_on_demand                false})
                        db-manual-schedule     (new-instance-with-default :metabase_database
                                                                          {:details                     (json/generate-string {:let-user-control-scheduling true})
                                                                           :is_full_sync                true
                                                                           :is_on_demand                false
                                                                           :metadata_sync_schedule      "0 0 * * * ? *"
                                                                           :cache_field_values_schedule "0 0 2 * * ? *"})
                        db-on-demand           (new-instance-with-default :metabase_database
                                                                          {:details                     (json/generate-string {:let-user-control-scheduling true})
                                                                           :is_full_sync                false
                                                                           :is_on_demand                true
                                                                           :metadata_sync_schedule      "0 0 * * * ? *"
                                                                           :cache_field_values_schedule "0 0 2 * * ? *"})
                        db-never-scan          (new-instance-with-default :metabase_database
                                                                          {:details                     (json/generate-string {:let-user-control-scheduling true})
                                                                           :is_full_sync                false
                                                                           :is_on_demand                false
                                                                           :metadata_sync_schedule      "0 0 * * * ? *"
                                                                           :cache_field_values_schedule "0 0 2 * * ? *"})
                        db-with-scan-fv        [db-with-full-schedules db-manual-schedule]
                        db-without-scan-fv     [db-on-demand db-never-scan]]
                    (doseq [db (concat db-with-scan-fv db-without-scan-fv)]
                      (#'database/check-and-schedule-tasks-for-db! (t2/instance :model/Database db))
                      (testing "sanity check that the schedule exists"
                        (is (= (#'task.sync-databases-test/all-db-sync-triggers-name db)
                               (#'task.sync-databases-test/query-all-db-sync-triggers-name db)))))

                    (migrate!)
                    (testing "default options and scan with manual schedules should have scan field values"
                      (doseq [db db-with-scan-fv]
                        (is (= (#'task.sync-databases-test/all-db-sync-triggers-name db)
                               (#'task.sync-databases-test/query-all-db-sync-triggers-name db)))))

                    (testing "never scan and on demand should not have scan field values"
                      (doseq [db (t2/select :model/Database :id [:in (map :id db-without-scan-fv)])]
                        (is (= #{(#'api.database-test/sync-and-analyze-trigger-name db)}
                               (#'task.sync-databases-test/query-all-db-sync-triggers-name db)))
                        (is (nil? (:cache_field_values_schedule db))))))))]
        (testing "without encryption key"
          (do-test))
        (testing "with encryption key"
          (encryption-test/with-secret-key "dont-tell-anyone-about-this"
            (do-test)))))))

(deftest migration-works-when-have-encryption-key-test
  ;; this test is here to warn developers that they should test their migrations with and without encryption key
  (encryption-test/with-secret-key "dont-tell-anyone-about-this"
    ;; run migration to the latest migration
    (impl/test-migrations ["v49.2024-04-09T10:00:03"] [migrate!]
      ;; create a db because db.details should be encrypted
      (let [db-id     (:id (new-instance-with-default :metabase_database {:details (encryption/maybe-encrypt "{}")}))
            db-detail (fn []
                        (:details (t2/query-one {:select [:details]
                                                 :from   [:metabase_database]
                                                 :where  [:= :id db-id]})))]
        (testing "sanity check that db details is encrypted"
          (is (true? (encryption/possibly-encrypted-string? (db-detail)))))

        (testing "after migrate up, db details should still be encrypted"
          (migrate!)
          (is (true? (encryption/possibly-encrypted-string? (db-detail)))))
       (migrate! :down 48)
       (testing "after migrate down, db details should still be encrypted"
         (is (true? (encryption/possibly-encrypted-string? (db-detail)))))))))

(defn scheduler-job-keys
  []
  (->> (task/scheduler-info)
       :jobs
       (map :key)
       set))

(deftest delete-send-pulse-job-on-migrate-down-test
  (impl/test-migrations ["v50.2024-04-25T01:04:06"] [migrate!]
    (migrate!)
    (pulse-channel-test/with-send-pulse-setup!
      ;; the `pulse-channell-test/with-send-pulse-setup!` macro dynamically binds an in-memory scheduler to `task/*quartz-scheduler*`
      ;; but we need to re-bind that to global here because the InitSendPulseTriggers job will need access to the scheduler,
      ;; and since quartz job is running in a different thread other than this test's thread, we need to bind it globally
      (with-redefs [task/*quartz-scheduler* task/*quartz-scheduler*]
        (let [user-id  (:id (new-instance-with-default :core_user))
              pulse-id (:id (new-instance-with-default :pulse {:creator_id user-id}))
              pc       (new-instance-with-default :pulse_channel {:pulse_id pulse-id})]
          ;; trigger this so we schedule a trigger for send-pulse
          (task.send-pulses/update-send-pulse-trigger-if-needed! pulse-id pc :add-pc-ids #{(:id pc)})
          (testing "sanity check that we have a send pulse trigger and 2 jobs"
            (is (= 1 (count (pulse-channel-test/send-pulse-triggers pulse-id))))
            (is (= #{"metabase.task.send-pulses.send-pulse.job"
                     "metabase.task.send-pulses.init-send-pulse-triggers.job"}
                   (scheduler-job-keys))))
          (testing "migrate down will remove init-send-pulse-triggers job, send-pulse job and send-pulse triggers"
            (migrate! :down 49)
            (is (= #{} (scheduler-job-keys))))

          (testing "the init-send-pulse-triggers job should be re-run after migrate up"
            (migrate!)
            ;; we redefine this so quartz triggers that run on different threads use the same db connection as this test
            (with-redefs [mdb.connection/*application-db* mdb.connection/*application-db*]
              ;; simulate starting MB after migrate up, which will trigger this function
              (task/init! ::task.send-pulses/SendPulses)
              ;; wait a bit for the InitSendPulseTriggers to run
              (u/poll {:thunk #(pulse-channel-test/send-pulse-triggers pulse-id)
                       :done? #(= 1 %)})
              (testing "sanity check that we have a send pulse trigger and 2 jobs after restart"
                (is (= #{(pulse-channel-test/pulse->trigger-info pulse-id pc [(:id pc)])}
                       (pulse-channel-test/send-pulse-triggers pulse-id)))
                (is (= #{"metabase.task.send-pulses.send-pulse.job"
                         "metabase.task.send-pulses.init-send-pulse-triggers.job"}
                       (scheduler-job-keys)))))))))))

(def ^:private area-bar-combo-cards-test-data
  {"stack display takes priority"
   {:card     {:display                "area"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_type    "stacked"
                                         :stackable.stack_display "bar"})}
    :expected {:display                "bar"
               :visualization_settings {:stackable.stack_type "stacked"}}}

   "series settings have no display"
   {:card     {:display                "area"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_type "normalized"
                                         :series_settings      {:A {:display :bar}}})}
    :expected {:display                "area"
               :visualization_settings {:stackable.stack_type "normalized"
                                        :series_settings      {:A {}}}}}

   "combo display has no stack type"
   {:card     {:display                "combo"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_type "stacked"})}
    :expected {:display                "combo"
               :visualization_settings {}}}

   "series settings display can override combo if all equal, and area or bar"
   {:card     {:display                "combo"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_type "stacked"
                                         :series_settings      {:A {:display :bar}
                                                                :B {:display :bar}
                                                                :C {:display :bar}}})}
    :expected {:display                "bar"
               :visualization_settings {:stackable.stack_type "stacked"
                                        :series_settings      {:A {}
                                                               :B {}
                                                               :C {}}}}}

   "series settings display do not override combo if not equal"
   {:card     {:display                "combo"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_type "stacked"
                                         :series_settings      {:A {:display :bar}
                                                                :B {:display :area}
                                                                :C {:display :bar}}})}
    :expected {:display                "combo"
               :visualization_settings {:series_settings {:A {:display "bar"}
                                                          :B {:display "area"}
                                                          :C {:display "bar"}}}}}

   "series settings display do not override combo if all equal, but not area or bar"
   {:card     {:display                "combo"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_type "normalized"
                                         :series_settings      {:A {:display :line}
                                                                :B {:display :line}
                                                                :C {:display :line}}})}
    :expected {:display                "combo"
               :visualization_settings {:series_settings {:A {:display "line"}
                                                          :B {:display "line"}
                                                          :C {:display "line"}}}}}

   "any card with stackable.stack_display should have that key removed"
   {:card     {:display                "table"
               :visualization_settings (json/generate-string
                                        {:stackable.stack_display :line})}
    :expected {:display                "table"
               :visualization_settings {}}}})

(deftest migrate-stacked-area-bar-combo-display-settings-test
  (testing "Migrations v50.2024-05-15T13:13:13: Fix visualization settings for stacked area/bar/combo displays"
    (impl/test-migrations ["v50.2024-05-15T13:13:13"] [migrate!]
      (let [user-id     (t2/insert-returning-pks! (t2/table-name :model/User)
                                                  {:first_name  "Howard"
                                                   :last_name   "Hughes"
                                                   :email       "howard@aircraft.com"
                                                   :password    "superstrong"
                                                   :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-ids    (t2/insert-returning-pks! (t2/table-name :model/Card)
                                                  (mapv (fn [[name {:keys [card]}]]
                                                          (merge card {:name name
                                                                       :created_at    :%now
                                                                       :updated_at    :%now
                                                                       :creator_id    user-id
                                                                       :dataset_query "{}"
                                                                       :database_id   database-id
                                                                       :collection_id nil}))
                                                        area-bar-combo-cards-test-data))]
        (migrate!)
        (testing "Area Bar Combo Stacked Viz settings migration"
          (let [cards (->> (t2/query {:select [:name :display :visualization_settings]
                                      :from   [:report_card]
                                      :where  [:in :id card-ids]})
                           (map (fn [card] (update card :visualization_settings #(json/parse-string % keyword)))))]
            (doseq [{:keys [name] :as card} cards]
              (testing (format "Migrating a card where: %s" name)
                (is (= (-> (get-in area-bar-combo-cards-test-data [name :expected])
                           (dissoc :name))
                       (-> card
                           (dissoc :name))))))))))))

(def ^:private migrate-uploads-default-db
  {:name       "DB"
   :engine     "h2"
   :created_at :%now
   :updated_at :%now
   :details    "{}"})

(deftest migrate-uploads-settings-test-1
  (testing "MigrateUploadsSettings with valid settings state works as expected."
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (impl/test-migrations ["v50.2024-05-17T19:54:26"] [migrate!]
        (let [uploads-db-id     (t2/insert-returning-pk! :metabase_database (assoc migrate-uploads-default-db :name "DB 1"))
              not-uploads-db-id (t2/insert-returning-pk! :metabase_database (assoc migrate-uploads-default-db :name "DB 2"))]
          (let [settings [{:key "uploads-database-id",  :value (encryption/maybe-encrypt (str uploads-db-id))}
                          {:key "uploads-enabled",      :value (encryption/maybe-encrypt "true")}
                          {:key "uploads-table-prefix", :value (encryption/maybe-encrypt "uploads_")}
                          {:key "uploads-schema-name",  :value (encryption/maybe-encrypt "uploads")}]
                _ (t2/insert! :setting settings)
                get-settings #(t2/query {:select [:key :value], :from :setting, :where [:in :key (map :key settings)]})
                settings-before (get-settings)]
            (testing "make sure the settings are encrypted before the migrations"
              (is (not-empty settings-before))
              (is (every? encryption/possibly-encrypted-string?
                          (map :value settings-before))))
            (migrate!)
            (testing "make sure the settings are removed after the migrations"
              (is (empty? (get-settings))))
            (is (=? {uploads-db-id     {:uploads_enabled true,  :uploads_schema_name "uploads", :uploads_table_prefix "uploads_"}
                     not-uploads-db-id {:uploads_enabled false, :uploads_schema_name  nil,      :uploads_table_prefix nil}}
                    (m/index-by :id (t2/select :metabase_database))))
            (when (not= driver/*driver* :mysql) ; skipping MySQL because of rollback flakes (metabase#37434)
              (migrate! :down 49)
              (testing "make sure the settings contain the same decrypted values after the migrations"
                (let [settings-after (get-settings)]
                  (is (not-empty settings-after))
                  (is (every? encryption/possibly-encrypted-string?
                              (map :value settings-after)))
                  (is (= (set (map #(update % :value encryption/maybe-decrypt) settings-before))
                         (set (map #(update % :value encryption/maybe-decrypt) settings-after)))))))))))))

(deftest migrate-uploads-settings-test-2
  (testing "MigrateUploadsSettings with invalid settings state (missing uploads-database-id) doesn't fail."
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (impl/test-migrations ["v50.2024-05-17T19:54:26"] [migrate!]
        (let [uploads-db-id (t2/insert-returning-pk! :metabase_database migrate-uploads-default-db)
              settings      [;; no uploads-database-id and uploads-schema-name
                             {:key "uploads-enabled",      :value (encryption/maybe-encrypt "true")}
                             {:key "uploads-table-prefix", :value (encryption/maybe-encrypt "uploads_")}]
              _             (t2/insert! :setting settings)
              get-settings  #(t2/query {:select [:key :value], :from :setting, :where [:in :key (map :key settings)]})]
          (migrate!)
          (testing "make sure the settings are removed after the migrations"
            (is (empty? (get-settings))))
          (is (=? {uploads-db-id {:uploads_enabled      false
                                  :uploads_schema_name  nil
                                  :uploads_table_prefix nil}}
                  (m/index-by :id (t2/select :metabase_database)))))))))

(deftest migrate-uploads-settings-test-3
  (testing "MigrateUploadsSettings with invalid settings state (missing uploads-enabled) doesn't set uploads_enabled on the database."
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (impl/test-migrations ["v50.2024-05-17T19:54:26"] [migrate!]
        (let [uploads-db-id (t2/insert-returning-pk! :metabase_database migrate-uploads-default-db)
              settings      [;; no uploads-enabled
                             {:key "uploads-database-id", :value (encryption/maybe-encrypt "uploads_")}]
              _             (t2/insert! :setting settings)
              get-settings  #(t2/query {:select [:key :value], :from :setting, :where [:in :key (map :key settings)]})]
          (migrate!)
          (testing "make sure the settings are removed after the migrations"
            (is (empty? (get-settings))))
          (is (=? {uploads-db-id {:uploads_enabled      false
                                  :uploads_schema_name  nil
                                  :uploads_table_prefix nil}}
                  (m/index-by :id (t2/select :metabase_database)))))))))

(deftest create-sample-content-test
  (testing "The sample content is created iff *create-sample-content*=true"
    (doseq [create? [true false]]
      (testing (str "*create-sample-content* = " create?)
        (impl/test-migrations "v50.2024-05-27T15:55:22" [migrate!]
          (let [sample-content-created? #(boolean (not-empty (t2/query "SELECT * FROM report_dashboard where name = 'E-commerce insights'")))]
            (binding [custom-migrations/*create-sample-content* create?]
              (is (false? (sample-content-created?)))
              (migrate!)
              (is ((if create? true? false?) (sample-content-created?)))))))))
  (testing "The sample content isn't created if the sample database existed already in the past (or any database for that matter)"
    (impl/test-migrations "v50.2024-05-27T15:55:22" [migrate!]
      (let [sample-content-created? #(boolean (not-empty (t2/query "SELECT * FROM report_dashboard where name = 'E-commerce insights'")))]
        (is (false? (sample-content-created?)))
        (t2/insert-returning-pks! :metabase_database {:name       "db"
                                                      :engine     "h2"
                                                      :created_at :%now
                                                      :updated_at :%now
                                                      :details    "{}"})
        (t2/query {:delete-from :metabase_database})
        (migrate!)
        (is (false? (sample-content-created?)))
        (is (empty? (t2/query "SELECT * FROM metabase_database"))
            "No database should have been created"))))
  (testing "The sample content isn't created if a user existed already"
    (impl/test-migrations "v50.2024-05-27T15:55:22" [migrate!]
      (let [sample-content-created? #(boolean (not-empty (t2/query "SELECT * FROM report_dashboard where name = 'E-commerce insights'")))]
        (is (false? (sample-content-created?)))
        (t2/insert-returning-pks!
         :core_user
         {:first_name    "Rasta"
          :last_name     "Toucan"
          :email         "rasta@metabase.com"
          :password      "password"
          :password_salt "and pepper"
          :date_joined   :%now})
        (migrate!)
        (is (false? (sample-content-created?)))))))

(deftest decrypt-cache-settings-test
  (impl/test-migrations "v50.2024-06-12T12:33:07" [migrate!]
    (encryption-test/with-secret-key "whateverwhatever"
      (t2/insert! :setting [{:key "enable-query-caching", :value (encryption/maybe-encrypt "true")}
                            {:key "query-caching-ttl-ratio", :value (encryption/maybe-encrypt "100")}
                            {:key "query-caching-min-ttl", :value (encryption/maybe-encrypt "123")}]))

    (testing "Values were indeed encrypted"
      (is (not= "true" (t2/select-one-fn :value :setting :key "enable-query-caching"))))

    (encryption-test/with-secret-key "whateverwhatever"
      (migrate!))

    (testing "But not anymore"
      (is (= "true" (t2/select-one-fn :value :setting :key "enable-query-caching")))
      (is (= "100" (t2/select-one-fn :value :setting :key "query-caching-ttl-ratio")))
      (is (= "123" (t2/select-one-fn :value :setting :key "query-caching-min-ttl"))))))

(def ^:private result-metadata-for-viz-settings
  [{:name "C1"    :field_ref [:field 1 nil]}
   {:name "C2"    :field_ref [:field 2 {:base-type :type/BigInteger :join-alias "Products"}]}
   {:name "C3"    :field_ref [:field 3 {:base-type :type/BigInteger :source-field 10}]}
   {:name "C4"    :field_ref [:expression "Exp"]}
   {:name "C5"    :field_ref [:field 5 {:temporal-unit :month}]}
   {:name "C6"    :field_ref [:field 6 {:base-type :type/Float :binning {:strategy :num-bins :min-value 0 :max-value 160 :num-bins 8 :bin-width 20}}]}
   {:name "C7"    :field_ref [:field "C7" {:base-type :type/BigInteger}]}
   {:name "count" :field_ref [:aggregation 0]}])

(def ^:private viz-settings-with-field-ref-keys
  {:column_settings (-> {[:ref [:field 1 nil]]                                                  {:column_title "1"}
                         [:ref [:field 2 {:base-type :type/BigInteger :join-alias "Products"}]] {:column_title "2"}
                         [:ref [:field 3 {:base-type :type/BigInteger :source-field 10}]]       {:column_title "3"}
                         [:ref [:expression "Exp"]]                                             {:column_title "4"}
                         [:ref [:field 5 nil]]                                                  {:column_title "5"}
                         [:ref [:field 6 {:base-type :type/Float}]]                             {:column_title "6"}
                         [:name "C7"]                                                           {:column_title "7"}
                         [:name "count"]                                                        {:column_title "8"}
                         ;; unmatched column
                         [:ref [:field 9 nil]]                                                  {:column_title "9"}}
                        (update-keys json/generate-string))})

(def ^:private viz-settings-with-name-keys
  {:column_settings (-> {[:name "C1"]           {:column_title "1"}
                         [:name "C2"]           {:column_title "2"}
                         [:name "C3"]           {:column_title "3"}
                         [:name "C4"]           {:column_title "4"}
                         [:name "C5"]           {:column_title "5"}
                         [:name "C6"]           {:column_title "6"}
                         [:name "C7"]           {:column_title "7"}
                         [:name "count"]        {:column_title "8"}
                         ;; unmatched column
                         [:ref [:field 9 nil]]  {:column_title "9"}}
                        (update-keys json/generate-string))})

(defn- keyword-except-column-key [key]
  (if (str/starts-with? key "[") key (keyword key)))

(deftest update-legacy-column-keys-in-card-viz-settings-test
  (testing "v51.2024-08-07T10:00:00"
    (impl/test-migrations ["v51.2024-08-07T10:00:00"] [migrate!]
      (let [user-id (t2/insert-returning-pks! (t2/table-name :model/User)
                                              {:first_name  "Howard"
                                               :last_name   "Hughes"
                                               :email       "howard@aircraft.com"
                                               :password    "superstrong"
                                               :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id (t2/insert-returning-pks! (t2/table-name :model/Card)
                                              {:name                   "My Saved Question"
                                               :created_at             :%now
                                               :updated_at             :%now
                                               :creator_id             user-id
                                               :display                "table"
                                               :dataset_query          "{}"
                                               :result_metadata        (json/generate-string result-metadata-for-viz-settings)
                                               :visualization_settings (json/generate-string viz-settings-with-field-ref-keys)
                                               :database_id            database-id
                                               :collection_id          nil})]
        (migrate!)
        (testing "After the migration, column_settings are migrated to name-based keys"
          (is (= viz-settings-with-name-keys
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     (json/parse-string keyword-except-column-key)))))
        (migrate! :down 49)
        (testing "After reversing the migration, column_settings are restored to field ref-based keys"
          (is (= viz-settings-with-field-ref-keys
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     (json/parse-string keyword-except-column-key)))))))))

(deftest update-legacy-column-keys-in-dashboard-card-viz-settings-test
  (testing "v51.2024-08-07T11:00:00"
    (impl/test-migrations ["v51.2024-08-07T11:00:00"] [migrate!]
      (let [user-id (t2/insert-returning-pks! (t2/table-name :model/User)
                                              {:first_name  "Howard"
                                               :last_name   "Hughes"
                                               :email       "howard@aircraft.com"
                                               :password    "superstrong"
                                               :date_joined :%now})
            database-id (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                  {:name       "DB"
                                                   :engine     "h2"
                                                   :created_at :%now
                                                   :updated_at :%now
                                                   :details    "{}"})
            card-id (t2/insert-returning-pks! (t2/table-name :model/Card)
                                              {:name                   "My Saved Question"
                                               :created_at             :%now
                                               :updated_at             :%now
                                               :creator_id             user-id
                                               :display                "table"
                                               :dataset_query          "{}"
                                               :result_metadata        (json/generate-string result-metadata-for-viz-settings)
                                               :visualization_settings "{}"
                                               :database_id            database-id
                                               :collection_id          nil})
            dashboard-id (t2/insert-returning-pks! :model/Dashboard {:name                "My Dashboard"
                                                                     :creator_id          user-id
                                                                     :parameters          []})
            dashcard-id (t2/insert-returning-pks! :model/DashboardCard {:dashboard_id dashboard-id
                                                                        :visualization_settings (json/generate-string viz-settings-with-field-ref-keys)
                                                                        :card_id      card-id
                                                                        :size_x       4
                                                                        :size_y       4
                                                                        :col          1
                                                                        :row          1})]
        (migrate!)
        (testing "After the migration, column_settings are migrated to name-based keys"
          (is (= viz-settings-with-name-keys
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     (json/parse-string keyword-except-column-key)))))
        (migrate! :down 49)
        (testing "After reversing the migration, column_settings are restored to field ref-based keys"
          (is (= viz-settings-with-field-ref-keys
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_dashboardcard]
                                    :where  [:= :id dashcard-id]})
                     :visualization_settings
                     (json/parse-string keyword-except-column-key)))))))))
