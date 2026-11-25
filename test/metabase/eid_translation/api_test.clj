(ns metabase.eid-translation.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.test :as mt]))

(deftest ^:parallel entity-id-translation-test
  (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
    (is (= {card-eid {:id card-id :type "card" :status "ok"}}
           (-> (mt/user-http-request :crowberto :post 200
                                     "eid-translation/translate"
                                     {:entity_ids {"card" [card-eid]}})
               :entity_ids
               (update-keys name))))
    (testing "error message contains allowed models"
      (is (= (cond-> #{"action" "card" "collection" "dashboard" "dashboard-card" "dashboard-tab" "dataset" "dimension"
                       "document" "exploration" "glossary" "measure" "metric" "permissions-group" "pulse" "pulse-card"
                       "pulse-channel" "segment" "snippet" "timeline" "timeline-event" "transform" "transform-tag"
                       "user"}
               config/ee-available? (into #{"card-test" "segment-test" "test-suite" "transform-test"}))
             (set (:allowed-models (mt/user-http-request :crowberto :post 400 "eid-translation/translate"
                                                         {:entity_ids {"Card" [card-eid]}}))))))))
