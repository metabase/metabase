(ns metabase-enterprise.replacement.convert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ model layer ------------------------------------------------

(deftest create-run-with-run-type-test
  (testing "5-arity defaults to :replace run_type"
    (mt/with-model-cleanup [:model/ReplacementRun]
      (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))]
        (is (= :replace (:run_type run))))))
  (testing "6-arity accepts explicit run_type"
    (mt/with-model-cleanup [:model/ReplacementRun]
      (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert-to-transform)]
        (is (= :convert-to-transform (:run_type run)))))))

(deftest list-runs-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run1 (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))
          run2 (replacement-run/create-run! :card 3 :card 4 (mt/user->id :crowberto) :convert-to-transform)]
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

(deftest update-target-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run (replacement-run/create-run! :card 1 :card 1 (mt/user->id :crowberto) :convert-to-transform)]
      (replacement-run/update-target! (:id run) :table 42)
      (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
        (is (= :table (:target_entity_type updated)))
        (is (= 42 (:target_entity_id updated)))))))

;;; ------------------------------------------------ API endpoints ------------------------------------------------

(def ^:private valid-convert-body
  "A valid request body for the convert endpoint (card_id is overridden per test)."
  {:card_id          999999
   :transform_name   "My Transform"
   :transform_target {:type "table" :name "my_transform" :schema "transforms"}})

(deftest convert-card-not-found-test
  (testing "POST /convert-card-to-transform — 404 for non-existent card"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 404 "ee/replacement/convert-card-to-transform"
                            valid-convert-body))))

(deftest convert-card-not-model-test
  (testing "POST /convert-card-to-transform — 400 for non-model card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id}
                     {:database_id   (mt/id)
                      :dataset_query (mt/mbql-query orders)
                      :type          :question
                      :name          "Not a model"}]
        (mt/user-http-request :crowberto :post 400 "ee/replacement/convert-card-to-transform"
                              (assoc valid-convert-body :card_id card-id))))))

(deftest convert-card-concurrent-409-test
  (testing "POST /convert-card-to-transform — 409 when another run is active"
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
                                (assoc valid-convert-body :card_id card-id)))))))

(deftest convert-card-requires-superuser-test
  (testing "POST /convert-card-to-transform — 403 for non-admin"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :rasta :post 403 "ee/replacement/convert-card-to-transform"
                            valid-convert-body))))

(deftest convert-card-requires-transform-params-test
  (testing "POST /convert-card-to-transform — 400 when missing transform_name"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 400 "ee/replacement/convert-card-to-transform"
                            {:card_id 1})))
  (testing "POST /convert-card-to-transform — 400 when missing transform_target"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 400 "ee/replacement/convert-card-to-transform"
                            {:card_id 1 :transform_name "foo"}))))

(deftest list-runs-api-test
  (testing "GET /runs — lists runs"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [run  (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert-to-transform)
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

(deftest existing-endpoints-include-run-type-test
  (testing "GET /runs/:id returns run_type field"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert-to-transform)]
          (replacement-run/start-run! (:id run))
          (let [result (mt/user-http-request :crowberto :get 200 (str "ee/replacement/runs/" (:id run)))]
            (is (= "convert-to-transform" (:run_type result)))
            (is (= 0.0 (:progress result)))))))))
