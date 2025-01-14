(ns metabase.api.embed.common-test
  (:require [clojure.test :refer [deftest is testing use-fixtures]]
            [metabase.analytics.stats :as stats]
            [metabase.api.embed.common :as api.embed.common]
            [metabase.eid-translation :as eid-translation]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ->id-test
  (#'stats/clear-translation-count!)
  (is (= (assoc eid-translation/default-counter :total 0)
         (#'stats/get-translation-count)))
  (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
    (is (= card-id (api.embed.common/->id :card card-id)))
    (is (= card-id (api.embed.common/->id :model/Card card-id)))
    (is (partial= {:ok 0 :total 0} (#'stats/get-translation-count))
        "Translations are not counted when they don't occur")
    (#'stats/clear-translation-count!)
    (is (= card-id (api.embed.common/->id :card card-eid)))
    (is (= card-id (api.embed.common/->id :model/Card card-eid)))
    (is (partial= {:ok 2 :total 2} (#'stats/get-translation-count))
        "Translations are counted when they do occur")
    (#'stats/clear-translation-count!))

  (let [samples (t2/select-fn->fn :id :entity_id [:model/Card :id :entity_id] {:limit 100})]
    (when (seq samples)
      (doseq [[card-id entity-id] samples]
        (testing (str "card-id: " card-id " entity-id: " entity-id)

          (is (= card-id (api.embed.common/->id :model/Card card-id)))
          (is (= card-id (api.embed.common/->id :card card-id)))

          (is (= card-id (api.embed.common/->id :model/Card entity-id)))
          (is (= card-id (api.embed.common/->id :card entity-id)))))
      (is (malli= [:map [:ok pos-int?] [:total pos-int?]]
                  (#'stats/get-translation-count))))))
