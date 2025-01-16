(ns metabase.db.custom-migrations-test
  "Tests to make sure the custom migrations work as expected.

  Tests for migrations from older versions of Metabase now live
  in [[metabase.db.custom-migrations.old-migrations-tests]]. You can move stuff from here to that namespace after we
  cut a new major release... see docstring there for more info."
  (:require
   [clojure.test :refer :all]
   [metabase.db.custom-migrations :as custom-migrations]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; Disable the search index, as older schemas may not be compatible with ingestion.
(use-fixtures :each (fn [thunk]
                      (binding [search.ingestion/*disable-updates* true]
                        (thunk))))

;;;
;;; 52 tests
;;;

(defn- insert-returning-pk!
  [table record]
  (first (t2/insert-returning-pks! table record)))

(defn- insert-stage-number-data!
  []
  (let [single-stage-query {:source-table 29, :filter [:> [:field 288 nil] "2015-01-01"]},
        multi-stage-query {:source-query
                           {:source-query single-stage-query
                            :aggregation [:count],
                            :order-by [[:asc [:field 275 {:source-field 290}]]],
                            :breakout [[:field 200 nil]
                                       [:field 275 {:source-field 290}]],
                            :filter [:starts-with [:field 275 {:source-field 290}] "F"]},
                           :filter [:> [:field "count" {:base-type :type/Integer}] 5]}
        native-query {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
        user-id (insert-returning-pk! (t2/table-name :model/User)
                                      {:first_name  "Howard"
                                       :last_name   "Hughes"
                                       :email       "howard@aircraft.com"
                                       :password    "superstrong"
                                       :date_joined :%now})
        database-id (insert-returning-pk! (t2/table-name :model/Database)
                                          {:name       "DB"
                                           :engine     "h2"
                                           :created_at :%now
                                           :updated_at :%now
                                           :details    "{}"})
        dashboard-id (insert-returning-pk! :model/Dashboard {:name                "My Dashboard"
                                                             :creator_id          user-id
                                                             :parameters          []})
        single-stage-dataset-query (json/encode {:type "query"
                                                 :database database-id
                                                 :query single-stage-query})
        multi-stage-dataset-query (json/encode {:type "query"
                                                :database database-id
                                                :query multi-stage-query})
        native-dataset-query (json/encode {:type "native"
                                           :database database-id
                                           :native native-query})
        single-stage-question-id (insert-returning-pk! (t2/table-name :model/Card)
                                                       {:name                   "Single-stage Question"
                                                        :created_at             :%now
                                                        :updated_at             :%now
                                                        :creator_id             user-id
                                                        :type                   "question"
                                                        :display                "table"
                                                        :dataset_query          single-stage-dataset-query
                                                        :visualization_settings "{}"
                                                        :database_id            database-id
                                                        :collection_id          nil})
        native-question-id (insert-returning-pk! (t2/table-name :model/Card)
                                                 {:name                   "Native Question"
                                                  :created_at             :%now
                                                  :updated_at             :%now
                                                  :creator_id             user-id
                                                  :type                   "question"
                                                  :display                "table"
                                                  :dataset_query          native-dataset-query
                                                  :visualization_settings "{}"
                                                  :database_id            database-id
                                                  :collection_id          nil})
        multi-stage-question-id (insert-returning-pk! (t2/table-name :model/Card)
                                                      {:name                    "Multi-stage Question"
                                                       :created_at             :%now
                                                       :updated_at             :%now
                                                       :creator_id             user-id
                                                       :type                   "question"
                                                       :display                "table"
                                                       :dataset_query          multi-stage-dataset-query
                                                       :visualization_settings "{}"
                                                       :database_id            database-id
                                                       :collection_id          nil})
        multi-stage-model-id (insert-returning-pk! (t2/table-name :model/Card)
                                                   {:name                   "Single Stage Question"
                                                    :created_at             :%now
                                                    :updated_at             :%now
                                                    :creator_id             user-id
                                                    :type                   "model"
                                                    :display                "table"
                                                    :dataset_query          multi-stage-dataset-query
                                                    :visualization_settings "{}"
                                                    :database_id            database-id
                                                    :collection_id          nil})]
    {:user-id                  user-id
     :database-id              database-id
     :dashboard-id             dashboard-id
     :single-stage-question-id single-stage-question-id
     :native-question-id       native-question-id
     :multi-stage-question-id  multi-stage-question-id
     :multi-stage-model-id     multi-stage-model-id}))

(defn- sample-content-created? []
  (boolean (not-empty (t2/query "SELECT * FROM report_dashboard where name = 'E-commerce Insights'"))))

(deftest create-sample-content-test
  (testing "The sample content is created iff *create-sample-content*=true"
    (doseq [create? [true false]]
      (testing (str "*create-sample-content* = " create?)
        (impl/test-migrations "v52.2024-12-03T15:55:22" [migrate!]
          (binding [custom-migrations/*create-sample-content* create?]
            (is (false? (sample-content-created?)))
            (migrate!)
            (is (= create? (sample-content-created?))))

          (when (true? create?)
            (testing "The Examples collection has permissions set to grant read-write access to all users"
              (let [id (t2/select-one-pk :model/Collection :is_sample true)]
                (is (partial=
                     {:collection_id id
                      :perm_type     :perms/collection-access
                      :perm_value    :read-and-write}
                     (t2/select-one :model/Permissions :collection_id id)))))))))))

(deftest create-sample-content-test-2
  (testing "The sample content isn't created if the sample database existed already in the past (or any database for that matter)"
    (impl/test-migrations "v52.2024-12-03T15:55:22" [migrate!]
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

(deftest create-sample-content-test-3
  (testing "The sample content isn't created if a user existed already"
    (impl/test-migrations "v52.2024-12-03T15:55:22" [migrate!]
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
      (is (false? (sample-content-created?))))))

(deftest set-stage-number-in-parameter-mappings-test
  (testing "v52.2024-10-26T18:42:42"
    (impl/test-migrations ["v52.2024-10-26T18:42:42"] [migrate!]
      (let [{:keys [dashboard-id
                    single-stage-question-id
                    native-question-id
                    multi-stage-question-id
                    multi-stage-model-id]}
            (insert-stage-number-data!)

            parameter-mappings-without-stage-numbers
            (fn [card-id]
              [{:card_id card-id
                :parameter_id (str (random-uuid))
                :target ["dimension" ["field" 200 {:base-type "type/Integer"}]]}
               {:card_id card-id
                :parameter_id (str (random-uuid))
                :target ["strange-long-forgotten-target" ["field" "count" {:base-type "type/Integer"}]]}
               {:card_id card-id
                :parameter_id (str (random-uuid))
                :target ["dimension" ["field" 275 {:base-type "type/Text"}]]}])

            create-dashcard (fn create-dashcard
                              ([card-id] (create-dashcard card-id (parameter-mappings-without-stage-numbers card-id)))
                              ([card-id pmappings]
                               (insert-returning-pk! :model/DashboardCard
                                                     {:dashboard_id dashboard-id
                                                      :parameter_mappings pmappings
                                                      :visualization_settings "{}"
                                                      :card_id card-id
                                                      :size_x  4
                                                      :size_y  4
                                                      :col     1
                                                      :row     1})))
            single-stage-dashcard-id      (create-dashcard single-stage-question-id)
            native-dashcard-id            (create-dashcard native-question-id)
            multi-stage-dashcard1-id      (create-dashcard multi-stage-question-id)
            multi-stage-dashcard2-id      (create-dashcard multi-stage-question-id [])
            multi-stage-dashcard3-id      (create-dashcard multi-stage-question-id)
            multi-stage-model-dashcard-id (create-dashcard multi-stage-model-id)
            stage-0-pattern (fn [card-id]
                              [{:card_id card-id
                                :parameter_id string?
                                :target ["dimension" ["field" 200 {:base-type "type/Integer"}] {:stage-number 0}]}
                               {:card_id card-id
                                :parameter_id string?
                                :target ["strange-long-forgotten-target" ["field" "count" {:base-type "type/Integer"}]]}
                               {:card_id card-id
                                :parameter_id string?
                                :target ["dimension" ["field" 275 {:base-type "type/Text"}] {:stage-number 0}]}])
            stage-2-pattern (fn [card-id]
                              [{:card_id card-id
                                :parameter_id string?
                                :target ["dimension" ["field" 200 {:base-type "type/Integer"}] {:stage-number 2}]}
                               {:card_id card-id
                                :parameter_id string?
                                :target ["strange-long-forgotten-target" ["field" "count" {:base-type "type/Integer"}]]}
                               {:card_id card-id
                                :parameter_id string?
                                :target ["dimension" ["field" 275 {:base-type "type/Text"}] {:stage-number 2}]}])
            no-stage-pattern (fn [card-id]
                               [{:card_id card-id
                                 :parameter_id string?
                                 :target ["dimension" ["field" 200 {:base-type "type/Integer"}]]}
                                {:card_id card-id
                                 :parameter_id string?
                                 :target ["strange-long-forgotten-target" ["field" "count" {:base-type "type/Integer"}]]}
                                {:card_id card-id
                                 :parameter_id string?
                                 :target ["dimension" ["field" 275 {:base-type "type/Text"}]]}])
            query-parameter-mappings (fn []
                                       (->> (t2/query {:select   [:parameter_mappings]
                                                       :from     [:report_dashboardcard]
                                                       :where    [:in :id [single-stage-dashcard-id ; stage 0
                                                                           native-dashcard-id       ; stage 0
                                                                           multi-stage-dashcard1-id ; stage 2
                                                                           multi-stage-dashcard2-id ; no params
                                                                           multi-stage-dashcard3-id ; stage 2
                                                                           multi-stage-model-dashcard-id]] ; stage 0
                                                       :order-by [:id]})
                                            (map #(-> % :parameter_mappings json/decode+kw))))]
        (migrate!)
        (testing "After the migration, dimension parameter_mappings have stage numbers"
          (is (=? [(stage-0-pattern single-stage-question-id)
                   (stage-0-pattern native-question-id)
                   (stage-2-pattern multi-stage-question-id)
                   []
                   (stage-2-pattern multi-stage-question-id)
                   (stage-0-pattern multi-stage-model-id)]
                  (query-parameter-mappings))))
        (migrate! :down 51)
        (testing "After reversing the migration, parameter_mappings have no stage numbers"
          (is (=? [(no-stage-pattern single-stage-question-id)
                   (no-stage-pattern native-question-id)
                   (no-stage-pattern multi-stage-question-id)
                   []
                   (no-stage-pattern multi-stage-question-id)
                   (no-stage-pattern multi-stage-model-id)]
                  (query-parameter-mappings))))))))

(deftest set-stage-number-in-viz-settings-parameter-mappings-test
  (testing "v52.2024-11-12T15:13:18"
    (impl/test-migrations ["v52.2024-11-12T15:13:18"] [migrate!]
      (let [{:keys [dashboard-id
                    single-stage-question-id
                    native-question-id
                    multi-stage-question-id
                    multi-stage-model-id]}
            (insert-stage-number-data!)

            viz-settings-generator
            (fn [dimensions]             ; 4 dimensions are consumed
              ;; crazy as it sounds, the FE uses the JSON encoded form of the dimensions as IDs and keys
              (let [dimension-strs (mapv json/encode dimensions)
                    dimension-keys (mapv keyword dimension-strs)
                    click-behavior (fn [target-id & dimension-indices]
                                     {:targetId target-id
                                      :parameterMapping (into {} (for [i dimension-indices]
                                                                   [(dimension-keys i)
                                                                    {:source {:type "column"
                                                                              :id "0"
                                                                              :name "0"}
                                                                     :target {:type "dimension"
                                                                              :id (dimension-strs i)
                                                                              :dimension (dimensions i)}
                                                                     :id (dimension-strs i)}]))
                                      :linkType "question"
                                      :type "link"})]
                (fn [[target-id0 target-id1 target-id2]]
                  {:table.cell_column "model_id"
                   :table.columns
                   [{:enabled true
                     :fieldRef ["field" 146 {:base-type "type/Text", :join-alias "People - User"}]
                     :name "full_name"}
                    {:enabled false
                     :fieldRef ["field" 191 {:base-type "type/Integer"}]
                     :name "user_id"}
                    {:enabled true
                     :fieldRef ["aggregation" 0]
                     :name "count"}],
                   :table.pivot_column "end_timestamp",
                   ;; interesting part starts here (the fields above this are just random stuff from viz settings)
                   :column_settings
                   {:name0 {:click_behavior (click-behavior target-id0 0 1)} ; two column_settings level mappings
                    :name1 {:click_behavior (-> (click-behavior target-id1 2) ; dashboard target -> should not change
                                                (assoc :linkType "dashboard"))}}
                   :click_behavior
                   (click-behavior target-id2 3)}))) ; a single visualization_settings level mapping

            dimensions (mapv (fn [id] ["dimension" ["field" id nil]]) (range 200 204))
            viz-settings-without-stage-numbers (viz-settings-generator dimensions)

            viz-settings-with-stage-numbers
            (fn [target-ids stage-numbers]
              (let [enriched-dimensions (mapv (fn [dim stage-number]
                                                (cond-> dim
                                                  stage-number (assoc 2 {:stage-number stage-number})))
                                              dimensions
                                              ;; The penultimate dimension (index 2) is for a dashboard,
                                              ;; so it should get no stage-number. The last element is
                                              ;; moved to the end (index 3).
                                              (-> stage-numbers
                                                  (assoc 2 nil)
                                                  (conj (peek stage-numbers))))]
                ((viz-settings-generator enriched-dimensions) target-ids)))

            create-dashcard (fn create-dashcard
                              [card-id targets-or-viz-settings]
                              (insert-returning-pk! :model/DashboardCard
                                                    {:dashboard_id dashboard-id
                                                     :parameter_mappings []
                                                     :visualization_settings
                                                     (if (map? targets-or-viz-settings)
                                                       targets-or-viz-settings
                                                       (viz-settings-without-stage-numbers
                                                        targets-or-viz-settings))
                                                     :card_id card-id
                                                     :size_x  4
                                                     :size_y  4
                                                     :col     1
                                                     :row     1}))
            single-stage-dashcard-id (create-dashcard single-stage-question-id
                                                      [single-stage-question-id dashboard-id native-question-id])
            multi-stage-dashcard-id  (create-dashcard single-stage-question-id
                                                      [multi-stage-question-id dashboard-id multi-stage-model-id])
            no-vs-dashcard-id        (create-dashcard multi-stage-question-id {})
            query-viz-settings (fn []
                                 (->> (t2/query {:select   [:visualization_settings]
                                                 :from     [:report_dashboardcard]
                                                 :where    [:in :id [single-stage-dashcard-id
                                                                     multi-stage-dashcard-id
                                                                     no-vs-dashcard-id]]
                                                 :order-by [:id]})
                                      (map #(-> % :visualization_settings json/decode+kw))))]
        (migrate!)
        (testing "After the migration, dimension parameterMappings have stage numbers"
          (is (= [(viz-settings-with-stage-numbers [single-stage-question-id dashboard-id native-question-id]
                                                   [0 0 0])
                  (viz-settings-with-stage-numbers [multi-stage-question-id dashboard-id multi-stage-model-id]
                                                   [2 2 0])
                  {}]
                 (query-viz-settings))))
        (migrate! :down 51)
        (testing "After reversing the migration, parameterMappings have no stage numbers"
          (is (= [(viz-settings-without-stage-numbers [single-stage-question-id dashboard-id native-question-id])
                  (viz-settings-without-stage-numbers [multi-stage-question-id dashboard-id multi-stage-model-id])
                  {}]
                 (query-viz-settings))))))))


;;;
;;; 53+ tests go below. Thanks!
;;;
