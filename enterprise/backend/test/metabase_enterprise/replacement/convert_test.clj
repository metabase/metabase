(ns metabase-enterprise.replacement.convert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.convert :as convert]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ sanitize-table-name ------------------------------------------------

(deftest sanitize-table-name-test
  (testing "basic lowercasing and character replacement"
    (is (= "my_model" (#'convert/sanitize-table-name "My Model"))))
  (testing "collapses multiple underscores"
    (is (= "foo_bar" (#'convert/sanitize-table-name "foo---bar"))))
  (testing "trims leading/trailing underscores"
    (is (= "hello" (#'convert/sanitize-table-name "  hello  "))))
  (testing "handles special characters"
    (is (= "orders_2024_q1" (#'convert/sanitize-table-name "Orders (2024) Q1!"))))
  (testing "truncates to 63 chars"
    (let [long-name (apply str (repeat 100 "a"))]
      (is (= 63 (count (#'convert/sanitize-table-name long-name))))))
  (testing "empty-ish input"
    (is (= "" (#'convert/sanitize-table-name "---")))))

;;; ------------------------------------------------ unique-table-name ------------------------------------------------

(deftest unique-table-name-test
  (testing "returns base-name when no collision exists"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (is (= "my_table" (#'convert/unique-table-name db-id "transforms" "my_table")))))
  (testing "appends _2, _3 etc. to avoid collisions"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _           {:db_id db-id :schema "transforms" :name "my_table" :active true}]
      (is (= "my_table_2" (#'convert/unique-table-name db-id "transforms" "my_table")))))
  (testing "skips past existing suffixed names"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _           {:db_id db-id :schema "transforms" :name "my_table" :active true}
                   :model/Table    _           {:db_id db-id :schema "transforms" :name "my_table_2" :active true}]
      (is (= "my_table_3" (#'convert/unique-table-name db-id "transforms" "my_table")))))
  (testing "ignores inactive tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _           {:db_id db-id :schema "transforms" :name "my_table" :active false}]
      (is (= "my_table" (#'convert/unique-table-name db-id "transforms" "my_table"))))))

;;; ------------------------------------------------ model layer ------------------------------------------------

(deftest create-run-with-run-type-test
  (testing "5-arity defaults to :replace run_type"
    (mt/with-model-cleanup [:model/ReplacementRun]
      (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))]
        (is (= :replace (:run_type run))))))
  (testing "6-arity accepts explicit run_type"
    (mt/with-model-cleanup [:model/ReplacementRun]
      (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert_to_transform)]
        (is (= :convert_to_transform (:run_type run)))))))

(deftest list-runs-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run1 (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))
          run2 (replacement-run/create-run! :card 3 :card 4 (mt/user->id :crowberto) :convert_to_transform)]
      ;; Start run2 so it's active
      (replacement-run/start-run! (:id run2))
      (testing "lists all runs"
        (let [runs (replacement-run/list-runs)]
          (is (>= (count runs) 2))
          (is (some #(= (:id run1) (:id %)) runs))
          (is (some #(= (:id run2) (:id %)) runs))))
      (testing "filters to active runs only"
        (let [runs (replacement-run/list-runs :is-active true)]
          (is (every? :is_active runs))
          (is (some #(= (:id run2) (:id %)) runs))
          (is (not (some #(= (:id run1) (:id %)) runs))))))))

(deftest update-phase-progress-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert_to_transform)]
      (replacement-run/start-run! (:id run))
      (replacement-run/update-phase-progress! (:id run) :transform_progress 0.5)
      (replacement-run/update-phase-progress! (:id run) :sync_progress 1.0)
      (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
        (is (= 0.5 (:transform_progress updated)))
        (is (= 1.0 (:sync_progress updated)))
        (is (nil? (:replacement_progress updated)))))))

(deftest update-target-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run (replacement-run/create-run! :card 1 :card 1 (mt/user->id :crowberto) :convert_to_transform)]
      (replacement-run/update-target! (:id run) :table 42)
      (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
        (is (= :table (:target_entity_type updated)))
        (is (= 42 (:target_entity_id updated)))))))

;;; ------------------------------------------------ API endpoints ------------------------------------------------

(deftest convert-card-not-found-test
  (testing "POST /convert_card_to_transform — 404 for non-existent card"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 404 "ee/replacement/convert-card-to-transform"
                            {:card_id 999999}))))

(deftest convert-card-not-model-test
  (testing "POST /convert_card_to_transform — 400 for non-model card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id}
                     {:database_id   (mt/id)
                      :dataset_query (mt/mbql-query orders)
                      :type          :question
                      :name          "Not a model"}]
        (mt/user-http-request :crowberto :post 400 "ee/replacement/convert-card-to-transform"
                              {:card_id card-id})))))

(deftest convert-card-concurrent-409-test
  (testing "POST /convert_card_to_transform — 409 when another run is active"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id}
                     {:database_id   (mt/id)
                      :dataset_query (mt/mbql-query orders)
                      :type          :model
                      :name          "My Model"}]
        (mt/with-model-cleanup [:model/ReplacementRun]
          ;; Insert a fake active run
          (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))]
            (replacement-run/start-run! (:id run)))
          (mt/user-http-request :crowberto :post 409 "ee/replacement/convert-card-to-transform"
                                {:card_id card-id}))))))

(deftest convert-card-requires-superuser-test
  (testing "POST /convert_card_to_transform — 403 for non-admin"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :rasta :post 403 "ee/replacement/convert-card-to-transform"
                            {:card_id 1}))))

(deftest list-runs-api-test
  (testing "GET /runs — lists runs"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [run  (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert_to_transform)
              runs (mt/user-http-request :crowberto :get 200 "ee/replacement/runs")]
          (is (sequential? runs))
          (is (some #(= (:id run) (:id %)) runs))))))
  (testing "GET /runs — requires superuser"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :rasta :get 403 "ee/replacement/runs")))
  (testing "GET /runs — requires feature flag"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Dependency Tracking"
       (mt/user-http-request :crowberto :get 402 "ee/replacement/runs")))))

(deftest existing-endpoints-include-new-fields-test
  (testing "GET /runs/:id returns run_type and phase progress fields"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert_to_transform)]
          (replacement-run/start-run! (:id run))
          (replacement-run/update-phase-progress! (:id run) :transform_progress 0.5)
          (let [result (mt/user-http-request :crowberto :get 200 (str "ee/replacement/runs/" (:id run)))]
            (is (= "convert_to_transform" (:run_type result)))
            (is (= 0.5 (:transform_progress result)))
            (is (nil? (:sync_progress result)))
            (is (nil? (:replacement_progress result)))))))))
