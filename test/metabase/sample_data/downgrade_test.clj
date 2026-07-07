(ns metabase.sample-data.downgrade-test
  "Tests for the SQLite -> H2 sample database downgrade restore
  ([[metabase.sample-data.downgrade]]), driven both through the real Liquibase rollback and by calling
  the helpers directly."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.custom-migrations :as custom-migrations]
   [metabase.app-db.schema-migrations-test.impl :as migration-impl]
   ;; loads the RestoreH2SampleDatabaseOnDowngrade custom-migration class the rollback tests exercise
   [metabase.custom-migrations.init]
   [metabase.sample-data.downgrade :as sample-data.downgrade]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

;; Disable the search index, as older schemas may not be compatible with ingestion.
(use-fixtures :each (fn [thunk]
                      (binding [search.ingestion/*disable-updates* true]
                        (thunk))))

(deftest restore-h2-sample-database-on-downgrade-rollback-test
  (testing "Downgrading past the changeset (the real rollback path) removes the SQLite sample database
           and restores the H2 sample database and its bundled Example content in its place"
    ;; Start early enough that CreateSampleContent runs under our binding and installs the real SQLite
    ;; Sample Database and Example collection tree - the exact state a SQLite-sample version leaves.
    (migration-impl/test-migrations ["v63.2026-06-08T00:00:00"] [migrate!]
      (binding [custom-migrations/*create-sample-content* true]
        (migrate!))
      (let [sqlite-db-id    (:id (t2/query-one {:select [:id] :from [:metabase_database]
                                                :where  [:and [:= :is_sample true] [:= :engine "sqlite"]]}))
            sample-coll-ids (mapv :id (t2/query {:select [:id] :from [:collection] :where [:= :is_sample true]}))]
        (testing "precondition: the SQLite sample database and its Example collections exist after upgrade"
          (is (some? sqlite-db-id))
          (is (seq sample-coll-ids)))
        (migrate! :down 62)
        (testing "the SQLite sample database is gone"
          (is (not (t2/exists? (t2/table-name :model/Database) :id sqlite-db-id))))
        (let [h2-db-id (:id (t2/query-one {:select [:id] :from [:metabase_database]
                                           :where  [:and [:= :is_sample true] [:= :engine "h2"]]}))]
          (testing "an H2 sample database is restored, with its tables and fields seeded"
            (is (some? h2-db-id))
            (is (pos? (t2/count :metabase_table :db_id h2-db-id)))
            (is (pos? (t2/count :metabase_field
                                :table_id [:in {:select [:id] :from [:metabase_table] :where [:= :db_id h2-db-id]}]))))
          (testing "the Example collections are kept (reused, not pruned)"
            (is (= (count sample-coll-ids)
                   (t2/count :collection :id [:in sample-coll-ids]))))
          (testing "the bundled Example content is restored onto the H2 sample database"
            (is (pos? (t2/count :report_card :database_id h2-db-id)))
            (let [example-dash-id (some-> (t2/query-one {:select [:value] :from [:setting]
                                                         :where  [:= :key "example-dashboard-id"]})
                                          :value parse-long)]
              (is (some? example-dash-id))
              (is (t2/exists? (t2/table-name :model/Dashboard) :id example-dash-id)))))))))

(deftest delete-sample-database-and-dependents-test
  (testing "The deletion helper removes the sample database and the content it leaves empty, keeping the
           Example collections (the restore reuses them) and everything unrelated"
    (mt/with-temp
      [:model/Database   sample      {:engine :sqlite, :is_sample true, :details {:db "mem:sample"}}
       :model/Database   other       {:engine :h2,     :details {:db "mem:other"}}
       :model/Card       other-card  {:database_id (:id other)}
       :model/Dashboard  sample-dash {}
       :model/Dashboard  mixed-dash  {}
       :model/Collection examples    {:name "Examples",   :is_sample true}
       :model/Collection ecommerce   {:name "E-commerce", :is_sample true, :location (str "/" (:id examples) "/")}
       :model/Collection keep-coll   {:name "Keep me"}]
      ;; Mirror the bundled sample content's fan-out: 8 tables x 7 fields, 39 cards, plus dashcards,
      ;; series, and tabs. MySQL 9.7 resolves a multi-level ON DELETE CASCADE of this shape
      ;; incompletely (it deletes the tables but orphans most cards and all fields), so the cleanup
      ;; must not rely on DB-level cascade. This fixture makes that regression visible.
      (let [table-ids     (vec (t2/insert-returning-pks! :model/Table
                                                         (for [i (range 8)]
                                                           {:db_id  (:id sample)
                                                            :name   (str "sample_table_" i)
                                                            :active true})))
            _             (t2/insert! :model/Field
                                      (for [tid table-ids
                                            i   (range 7)]
                                        {:table_id      tid
                                         :name          (str "field_" i)
                                         :base_type     :type/Text
                                         :database_type "TEXT"
                                         :position      i}))
            card-ids      (vec (t2/insert-returning-pks! :model/Card
                                                         (for [i (range 39)]
                                                           {:name                   (str "sample card " i)
                                                            :display                "table"
                                                            :dataset_query          {}
                                                            :visualization_settings {}
                                                            :creator_id             (mt/user->id :rasta)
                                                            :database_id            (:id sample)
                                                            :table_id               (nth table-ids (mod i (count table-ids)))})))
            [dc1 _dc2 dc3] (t2/insert-returning-pks! :model/DashboardCard
                                                     [{:dashboard_id (:id sample-dash) :card_id (first card-ids)
                                                       :size_x 4 :size_y 4 :row 0 :col 0}
                                                      {:dashboard_id (:id mixed-dash) :card_id (second card-ids)
                                                       :size_x 4 :size_y 4 :row 0 :col 0}
                                                      {:dashboard_id (:id mixed-dash) :card_id (:id other-card)
                                                       :size_x 4 :size_y 4 :row 0 :col 4}])
            _             (t2/insert! :model/DashboardCardSeries {:dashboardcard_id dc1
                                                                  :card_id          (nth card-ids 2)
                                                                  :position         0})
            _             (t2/insert! :model/DashboardTab {:dashboard_id (:id sample-dash)
                                                           :name         "Tab 1"
                                                           :position     0})
            ;; parameter_card rows orphan in three ways; a fourth must survive.
            [pc-src
             pc-card-owner
             pc-dash-owner
             pc-keep]    (t2/insert-returning-pks!
                          :model/ParameterCard
                          [;; value source is a sample card -> delete
                           {:card_id (first card-ids) :parameterized_object_type "dashboard"
                            :parameterized_object_id (:id mixed-dash) :parameter_id "src"}
                           ;; parameterized object is a sample card -> delete
                           {:card_id (:id other-card) :parameterized_object_type "card"
                            :parameterized_object_id (second card-ids) :parameter_id "card-owner"}
                           ;; parameterized object is a deleted sample dashboard -> delete
                           {:card_id (:id other-card) :parameterized_object_type "dashboard"
                            :parameterized_object_id (:id sample-dash) :parameter_id "dash-owner"}
                           ;; non-sample source on a surviving dashboard -> keep
                           {:card_id (:id other-card) :parameterized_object_type "dashboard"
                            :parameterized_object_id (:id mixed-dash) :parameter_id "keep"}])]
        (#'sample-data.downgrade/delete-sample-database-and-dependents! (:id sample))
        (testing "the sample database and all of its child content are deleted, with no orphans"
          (is (not (t2/exists? :model/Database :id (:id sample))))
          (is (zero? (t2/count :metabase_table :db_id (:id sample))))
          (is (zero? (t2/count :metabase_field :table_id [:in table-ids])))
          (is (zero? (t2/count :report_card :database_id (:id sample))))
          (is (zero? (t2/count :report_dashboardcard :card_id [:in card-ids])))
          (is (zero? (t2/count :dashboardcard_series :card_id [:in card-ids]))))
        (testing "a dashboard left empty by the deletion is deleted, along with its tabs"
          (is (not (t2/exists? :model/Dashboard :id (:id sample-dash))))
          (is (zero? (t2/count :dashboard_tab :dashboard_id (:id sample-dash)))))
        (testing "parameter_card rows referencing a deleted sample card or dashboard are removed"
          (is (not (t2/exists? :model/ParameterCard :id pc-src)))
          (is (not (t2/exists? :model/ParameterCard :id pc-card-owner)))
          (is (not (t2/exists? :model/ParameterCard :id pc-dash-owner)))
          (testing "but an unrelated parameter_card is kept"
            (is (t2/exists? :model/ParameterCard :id pc-keep))))
        (testing "the sample Example collections are kept - the restore reuses them"
          (is (t2/exists? :model/Collection :id (:id examples)))
          (is (t2/exists? :model/Collection :id (:id ecommerce))))
        (testing "a dashboard that still has other cards, and unrelated content, is kept"
          (is (t2/exists? :model/Dashboard :id (:id mixed-dash)))
          (is (t2/exists? :report_dashboardcard :id dc3))
          (is (t2/exists? :model/Card :id (:id other-card)))
          (is (t2/exists? :model/Database :id (:id other)))
          (is (t2/exists? :model/Collection :id (:id keep-coll))))))))

(deftest ^:mb/old-migrations-test downgrade-deletes-sample-dependents-and-restores-test
  (testing "Downgrade deletes everything that depends on the SQLite sample DB (transitively, even
           user-created), keeps any Example collection a user still has their own content in, and restores
           the H2 sample database"
    (migration-impl/test-migrations ["v63.2026-06-08T00:00:00"] [migrate!]
      (binding [custom-migrations/*create-sample-content* true]
        (migrate!))
      (let [examples-id  (:id (t2/query-one {:select [:id] :from [:collection]
                                             :where [:= :is_sample true] :order-by [[:id :asc]]}))
            ecommerce-id (:id (t2/query-one {:select [:id] :from [:collection]
                                             :where [:= :is_sample true] :order-by [[:id :desc]]}))
            sqlite-db-id (:id (t2/query-one {:select [:id] :from [:metabase_database]
                                             :where [:and [:= :is_sample true] [:= :engine "sqlite"]]}))
            sample-card  (:id (t2/query-one {:select [:id] :from [:report_card] :where [:= :database_id sqlite-db-id] :limit 1}))
            ins          (fn [t r] (first (t2/insert-returning-pks! t r)))
            other-db     (ins :metabase_database {:name "User DB" :engine "h2" :is_sample false
                                                  :details "{}" :created_at :%now :updated_at :%now})
            ;; a user question that doesn't touch the sample DB, filed in Examples -> must survive
            user-card    (ins :report_card {:name "keep me" :display "table" :dataset_query "{}"
                                            :visualization_settings "{}" :creator_id 13371338 :database_id other-db
                                            :collection_id examples-id :created_at :%now :updated_at :%now})
            ;; a user model built on a sample card -> depends transitively -> must be deleted
            user-model   (ins :report_card {:name "built on sample" :display "table" :dataset_query "{}"
                                            :visualization_settings "{}" :creator_id 13371338 :database_id other-db
                                            :source_card_id sample-card :collection_id examples-id
                                            :created_at :%now :updated_at :%now})
            exists?      (fn [t id] (boolean (seq (t2/query {:select [1] :from [t] :where [:= :id id] :limit 1}))))]
        (migrate! :down 62)
        (testing "the SQLite sample database and everything depending on it - including the user model - are deleted"
          (is (not (exists? :metabase_database sqlite-db-id)))
          (is (not (exists? :report_card sample-card)))
          (is (not (exists? :report_card user-model))))
        (testing "a user question that does not depend on the sample DB survives"
          (is (exists? :report_card user-card)))
        (testing "Example collections holding surviving user content are kept"
          (is (exists? :collection examples-id))
          (is (exists? :collection ecommerce-id)))
        (testing "an H2 sample database is restored"
          (is (some? (:id (t2/query-one {:select [:id] :from [:metabase_database]
                                         :where [:and [:= :is_sample true] [:= :engine "h2"]]})))))))))

(deftest ^:mb/old-migrations-test downgrade-leaves-no-orphaned-card-children-test
  ;; The deletion hand-deletes only the dashcard tables and lets DB-level ON DELETE CASCADE clear
  ;; report_card's other children (query_field, query_table, card_bookmark, report_cardfavorite, ...).
  ;; MySQL 9.7 resolves cascades incompletely; this test seeds those children for a sample card and
  ;; asserts none survive - i.e. it FAILS if the relied-on cascade leaves orphans.
  (testing "downgrade leaves no child rows pointing at a deleted sample card"
    (migration-impl/test-migrations ["v63.2026-06-08T00:00:00"] [migrate!]
      (binding [custom-migrations/*create-sample-content* true]
        (migrate!))
      (let [internal-user 13371338
            sqlite-db-id  (:id (t2/query-one {:select [:id] :from [:metabase_database]
                                              :where [:and [:= :is_sample true] [:= :engine "sqlite"]]}))
            sample-card   (:id (t2/query-one {:select [:id] :from [:report_card] :where [:= :database_id sqlite-db-id] :limit 1}))
            ins           (fn [t r] (first (t2/insert-returning-pks! t r)))]
        ;; children of report_card that the deletion leaves to ON DELETE CASCADE (not hand-deleted)
        (ins :query_field {:card_id sample-card :column "TOTAL" :explicit_reference true})
        (ins :query_table {:card_id sample-card :table "ORDERS"})
        (ins :card_bookmark {:user_id internal-user :card_id sample-card})
        (ins :report_cardfavorite {:card_id sample-card :owner_id internal-user :created_at :%now :updated_at :%now})
        (#'sample-data.downgrade/delete-sample-database-and-dependents! sqlite-db-id)
        (testing "the sample card was deleted"
          (is (not (t2/exists? :report_card :id sample-card))))
        (testing "no child table is left with a row pointing at the deleted card"
          (doseq [table [:query_field :query_table :card_bookmark :report_cardfavorite]]
            (is (zero? (t2/count table :card_id sample-card))
                (str table " has an orphaned row referencing the deleted sample card"))))))))
