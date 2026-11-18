(ns metabase.metabot.models.metabot-prompt-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest model-is-type-of-card-test
  (mt/with-temp [:model/Card    {metric-id :id} {:type :metric}
                 :model/Card    {model-id :id}  {:type :model}
                 :model/Metabot {metabot-id :id} {:name "Test Metabot"}]
    (mt/with-model-cleanup [:model/MetabotPrompt]
      (testing "insert derives the model from the Card and ignores the incoming one"
        (let [id (t2/insert-returning-pk! :model/MetabotPrompt {:metabot_id metabot-id
                                                                :card_id    metric-id
                                                                :model      :model
                                                                :prompt     "How many?"})]
          (is (= :metric (t2/select-one-fn :model :model/MetabotPrompt :id id)))
          (testing "update of the Card recomputes the model"
            (t2/update! :model/MetabotPrompt :id id {:card_id model-id})
            (is (= :model (t2/select-one-fn :model :model/MetabotPrompt :id id))))
          (testing "update of the model alone is a 400"
            (is (=? {:status-code 400}
                    (try (t2/update! :model/MetabotPrompt :id id {:model :metric})
                         (catch clojure.lang.ExceptionInfo e (ex-data e)))))
            (is (= :model (t2/select-one-fn :model :model/MetabotPrompt :id id)))))))))
