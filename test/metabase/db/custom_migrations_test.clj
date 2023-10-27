(ns metabase.db.custom-migrations-test
  "Tests to make sure the custom migrations work as expected."
  (:require
   [cheshire.core :as json]
   [clojure.math :as math]
   [clojure.math.combinatorics :as math.combo]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.custom-migrations :as custom-migrations]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.db.setup :as db.setup]
   [metabase.models :refer [Database User]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.setting :as setting]
   [metabase.task :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2])
  (:import
   [clojure.lang ExceptionInfo]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(jobs/defjob AbandonmentEmail [_] :default)

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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
                                                        :last_name   "Hughes"
                                                        :email       "howard@aircraft.com"
                                                        :password    "superstrong"
                                                        :date_joined :%now})
            database-id (t2/insert-returning-pks! Database {:name       "DB"
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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
                                                        :last_name   "Hughes"
                                                        :email       "howard@aircraft.com"
                                                        :password    "superstrong"
                                                        :date_joined :%now})
            database-id (t2/insert-returning-pks! Database {:name       "DB"
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
      (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
            result_metadata
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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
                                                        :last_name   "Hughes"
                                                        :email       "howard@aircraft.com"
                                                        :password    "superstrong"
                                                        :date_joined :%now})
            database-id (t2/insert-returning-pks! Database {:name       "DB"
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
        (db.setup/migrate! db-type data-source :down 46)
        (testing "After reversing the migration, column_settings field refs are updated to remove join-alias"
          (is (= visualization-settings
                 (-> (t2/query-one {:select [:visualization_settings]
                                    :from   [:report_card]
                                    :where  [:= :id card-id]})
                     :visualization_settings
                     json/parse-string))))))))

(deftest downgrade-dashboard-tabs-test
  (testing "Migrations v47.00-029: downgrade dashboard tab test"
    ;; it's "v47.00-030" but not "v47.00-029" because for some reasons,
    ;; SOMETIMES the rollback of custom migration doens't get triggered on mysql and this test got flaky.
    (impl/test-migrations "v47.00-030" [migrate!]
      (migrate!)
      (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
            migrate-down! (partial db.setup/migrate! db-type data-source :down)
            user-id      (first (t2/insert-returning-pks! User {:first_name  "Howard"
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
       (migrate-down! 46)
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
    (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
          migrate-down! (partial db.setup/migrate! db-type data-source :down)
          user-id      (first (t2/insert-returning-pks! User {:first_name  "Howard"
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
               (t2/select-one-fn (comp :cards :object) :model/Revision :id revision-id))))
      (migrate-down! 46)
      (testing "downgrade works correctly"
        (is (= cards (-> (t2/select-one (t2/table-name :model/Revision) :id revision-id)
                         :object (json/parse-string true) :cards)))))))

(deftest migrate-dashboard-revision-grid-from-18-to-24-handle-faliure-test
  (impl/test-migrations ["v47.00-032" "v47.00-033"] [migrate!]
    (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
          migrate-down! (partial db.setup/migrate! db-type data-source :down)
          user-id      (first (t2/insert-returning-pks! User {:first_name  "Howard"
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
      (migrate-down! 46)

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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
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
      (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
            visualization-settings
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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
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
        (db.setup/migrate! db-type data-source :down 46)
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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
                                                        :last_name   "Hughes"
                                                        :email       "howard@aircraft.com"
                                                        :password    "superstrong"
                                                        :date_joined :%now})
            database-id (t2/insert-returning-pks! :model/Database {:name       "DB"
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
      (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
            result_metadata
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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
                                                        :last_name   "Hughes"
                                                        :email       "howard@aircraft.com"
                                                        :password    "superstrong"
                                                        :date_joined :%now})
            database-id (t2/insert-returning-pks! :model/Database {:name       "DB"
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
       (db.setup/migrate! db-type data-source :down 46)
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
            user-id     (t2/insert-returning-pks! User {:first_name  "Howard"
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
      (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
            visualization-settings
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
            user-id            (t2/insert-returning-pks! User {:first_name  "Howard"
                                                               :last_name   "Hughes"
                                                               :email       "howard@aircraft.com"
                                                               :password    "superstrong"
                                                               :date_joined :%now})
            database-id        (t2/insert-returning-pks! Database {:name       "DB"
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
       (db.setup/migrate! db-type data-source :down 46)
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
               (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*]
                 (db.setup/migrate! db-type data-source :down 46)
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
                [user-id]      (t2/insert-returning-pks! User {:first_name  "Howard"
                                                               :last_name   "Hughes"
                                                               :email       "howard@aircraft.com"
                                                               :password    "superstrong"
                                                               :date_joined :%now})
                [database-id]  (t2/insert-returning-pks! Database {:name       "DB"
                                                                   :engine     "h2"
                                                                   :created_at :%now
                                                                   :updated_at :%now
                                                                   :details    "{}"})
                [card-id]      (t2/insert-returning-pks!
                                :model/Card
                                {:visualization_settings card-vis
                                 :display                "table"
                                 :dataset_query          "{}"
                                 :creator_id             user-id
                                 :database_id            database-id
                                 :name                   "My Card"})
                [dashboard-id] (t2/insert-returning-pks! :model/Dashboard {:name       "My Dashboard"
                                                                           :creator_id user-id
                                                                           :parameters []})
                [dashcard-id]  (t2/insert-returning-pks! :model/DashboardCard {:dashboard_id           dashboard-id
                                                                               :visualization_settings dashcard-vis
                                                                               :card_id                card-id
                                                                               :size_x                 4
                                                                               :size_y                 4
                                                                               :col                    1
                                                                               :row                    1})]
            (let [expected-settings {:graph.dimensions ["CREATED_AT" "CATEGORY"],
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
                         :visualization_settings))))))]
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
  (impl/test-migrations ["v48.00-024"] [migrate!]
    (let [{:keys [db-type ^javax.sql.DataSource
                  data-source]} mdb.connection/*application-db*
          migrate-all!          (partial db.setup/migrate! db-type data-source)
          throw-err             (fn [& _args]
                                  (throw (ex-info "This shouldn't be called ever" {})))]

      (testing "we can migrate even if data_migrations is empty"
        ;; 0 because we removed them and fresh db won't trigger any
        (is (= 0 (t2/count :data_migrations)))
        (migrate!))

      (testing "no data_migrations table after v.48.00-024"
        (is (thrown? ExceptionInfo
                     (t2/count :data_migrations))))

      (testing "rollback causes all known data_migrations to reappear"
        (migrate-all! :down 47)
        ;; 34 because there was a total of 34 data migrations (which are filled on rollback)
        (is (= 34 (t2/count :data_migrations))))

      (testing "when migrating up, migrations won't run since they are in data_migration because of rollback"
        (is (nil?
             (with-redefs [custom-migrations/migrate-click-through!                            throw-err
                           custom-migrations/migrate-remove-admin-from-group-mapping-if-needed throw-err]
               (migrate!))))))))
