(ns metabase.metabot.models.metabot-prompt-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.metabot.models.metabot-prompt :as metabot-prompt]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest model-is-type-of-card-test
  (mt/with-temp [:model/Card    {metric-id :id} {:type :metric}
                 :model/Card    {model-id :id}  {:type :model}
                 :model/Metabot {metabot-id :id} {:name "Test Metabot"}]
    (mt/with-model-cleanup [:model/MetabotPrompt]
      (testing "create derives the model from the Card"
        (let [id (:id (first (metabot-prompt/create-metabot-prompts!
                              [{:metabot_id metabot-id :card_id metric-id :prompt "How many?"}])))]
          (is (= :metric (t2/select-one-fn :model :model/MetabotPrompt :id id)))
          (testing "update of the Card recomputes the model"
            (metabot-prompt/update-metabot-prompts! [{:id id :card_id model-id}])
            (is (= :model (t2/select-one-fn :model :model/MetabotPrompt :id id))))
          (testing "update of the model alone is a 400"
            (is (=? {:status-code 400}
                    (try (metabot-prompt/update-metabot-prompts! [{:id id :model :metric}])
                         (catch clojure.lang.ExceptionInfo e (ex-data e)))))
            (is (= :model (t2/select-one-fn :model :model/MetabotPrompt :id id)))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Card    {card-id :id}    {:type :metric}
                 :model/Metabot {metabot-id :id} {:name "Test Metabot"}]
    (let [rows    (fn [n] (vec (repeatedly n #(hash-map :metabot_id metabot-id :card_id card-id :prompt (mt/random-name)))))
          created (atom [])
          create! (fn [n]
                    (events.tu/statement-count! (fn [] (swap! created into (map :id (metabot-prompt/create-metabot-prompts! (rows n)))))))]
      (try
        (testing "creating prompts"
          (create! 1)
          (is (= (create! 2) (create! 6))))
        (testing "updating and deleting prompts"
          (let [[warm small large] (map vec [(take 1 @created) (take 2 (drop 1 @created)) (drop 3 @created)])
                update!            (fn [ids]
                                     (events.tu/statement-count! (fn [] (metabot-prompt/update-metabot-prompts! (mapv (fn [id] {:id id :prompt "same"}) ids)))))
                delete!            (fn [ids]
                                     (events.tu/statement-count! (fn [] (metabot-prompt/delete-metabot-prompts! ids))))]
            (update! warm)
            (is (= (update! small) (update! large)))
            (delete! warm)
            (is (= (delete! small) (delete! large)))))
        (finally
          (t2/delete! :model/MetabotPrompt :metabot_id metabot-id))))))
