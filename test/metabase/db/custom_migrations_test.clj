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
   [metabase.db.connection :as mdb.connection]
   [metabase.db.custom-migrations :as custom-migrations]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.db.setup :as db.setup]
   [metabase.models :refer [Card Database User]]
   [metabase.models.interface :as mi]
   [metabase.task :as task]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

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
            card-id     (t2/insert-returning-pks! Card {:name                   "My Saved Question"
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
            card-id     (t2/insert-returning-pks! Card {:name                   "My Saved Question"
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
            card-id     (t2/insert-returning-pks! Card {:name                   "My Saved Question"
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
    (impl/test-migrations "v47.00-029" [migrate!]
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
          revision-id (first (t2/insert-returning-pks! 'Revision
                                                        {:object   {:cards cards}
                                                         :model    "Dashboard"
                                                         :model_id 1
                                                         :user_id  user-id}))]

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
      (is (= cards (t2/select-one-fn (comp :cards :object) :model/Revision :id revision-id)))))))

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
          revision-id (first (t2/insert-returning-pks! 'Revision
                                                       {:object   {:cards cards}
                                                        :model    "Dashboard"
                                                        :model_id 1
                                                        :user_id  user-id}))]

      (migrate!)
      (testing "forward migration migrate correclty and ignore failures"
        (is (= [{:id 1 :row 0, :col 0, :size_x 4, :size_y 4}
                {:id 2 :row 0, :col 0, :sizeX 4, :sizeY 4}
                {:id 3 :row nil, :col nil, :size_x nil, :size_y nil}
                {:id 4 :row "x", :col "x", :size_x "x", :size_y "x"}
                {:id 5 :row 0 :col 0 :size_x 4 :size_y 4 :series [1 2 3]}]
               (t2/select-one-fn (comp :cards :object) :model/Revision :id revision-id))))
      (migrate-down! 46)

      (testing "downgrade works correctly and ignore failures"
        (is (= [{:id 1 :row 0, :col 0, :size_x 4, :size_y 4}
                {:id 2 :row 0, :col 0, :sizeX 4, :sizeY 4}
                {:id 3 :row nil, :col nil, :size_x nil, :size_y nil}
                {:id 4 :row "x", :col "x", :size_x "x", :size_y "x"}
                {:id 5 :row 0 :col 0 :size_x 4 :size_y 4 :series [1 2 3]}]
               (t2/select-one-fn (comp :cards :object) :model/Revision :id revision-id)))))))

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
