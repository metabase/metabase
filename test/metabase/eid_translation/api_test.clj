(ns metabase.eid-translation.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.eid-translation.util :as eid-translation.util]
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
      (is (= (set (map name (keys @#'eid-translation.util/api-name->model)))
             (set (:allowed-models (mt/user-http-request :crowberto :post 400 "eid-translation/translate"
                                                         {:entity_ids {"Card" [card-eid]}}))))))))
