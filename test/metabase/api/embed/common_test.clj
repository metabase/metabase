(ns metabase.api.embed.common-test
  (:require [clojure.test :refer [deftest is testing]]
            [metabase.api.embed.common :as api.embed.common]
            [metabase.test :as mt]
            [toucan2.core :as t2]))

(deftest ->id-test
  (api.embed.common/get-and-clear-translation-count!)
  (is (= @#'api.embed.common/default-eid-translation-counter
         (api.embed.common/entity-id-translation-counter)))
  (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
    (is (= card-id (api.embed.common/->id :card card-id)))
    (is (= card-id (api.embed.common/->id :model/Card card-id)))
    (is (partial= {:ok 0 :total 0} (api.embed.common/get-and-clear-translation-count!))
        "Translations are not counted when they don't occur")
    (is (= card-id (api.embed.common/->id :card card-eid)))
    (is (= card-id (api.embed.common/->id :model/Card card-eid)))
    (is (partial= {:ok 2 :total 2} (api.embed.common/get-and-clear-translation-count!))
        "Translations are counted when they do occur"))

  (doseq [[card-id entity-id] (t2/select-fn->fn :id :entity_id [:model/Card :id :entity_id] {:limit 100})]
    (testing (str "card-id: " card-id " entity-id: " entity-id)
      (is (= card-id (api.embed.common/->id :model/Card card-id)))
      (is (= card-id (api.embed.common/->id :card card-id)))
      (is (= card-id (api.embed.common/->id :model/Card entity-id)))
      (is (= card-id (api.embed.common/->id :card entity-id))))))
