(ns metabase.api.model-action-test
  (:require
    [clojure.test :refer [deftest is testing]]
    [metabase.actions.test-util :as actions.test-util]
    [metabase.models :refer [Card ModelAction]]
    [metabase.test :as mt]))

(deftest get-test
  (actions.test-util/with-actions-enabled
    (actions.test-util/with-action [{:keys [action-id]} {}]
      (actions.test-util/with-action [{http-action-id :action-id} {:name "HTTP Example"}]
        (mt/with-temp* [Card [{card-id :id} {:dataset true}]
                        ModelAction [_ {:card_id card-id :action_id action-id :slug "query"}]
                        ModelAction [_ {:card_id card-id :action_id http-action-id :slug "http"}]
                        ModelAction [_ {:card_id card-id :slug "implicit"}]]
          (let [response (mt/user-http-request :crowberto :get 200 (str "model-action?card-id=" card-id))]
            (is (partial=
                  [{:slug "query" :name "Query Example"}
                   {:slug "http" :name "HTTP Example"}
                   {:slug "implicit" :name nil}]
                  response))))))))

(deftest post-test
  (actions.test-util/with-actions-enabled
    (mt/with-temp* [Card [{card-id :id} {:dataset true}]]
      (testing "With implicit action"
        (let [response (mt/user-http-request :crowberto :post 200 "model-action"
                                             {:card_id card-id
                                              :requires_pk false
                                              :slug "insert"})]
          (is (partial=
                {:slug "insert"}
                response))))
      (testing "With custom action"
        (actions.test-util/with-action [{:keys [action-id]} {}]
          (let [response (mt/user-http-request :crowberto :post 200 "model-action"
                                               {:card_id card-id
                                                :action_id action-id
                                                :requires_pk false
                                                :slug "insert"})]
            (is (partial=
                  {:slug "insert"}
                  response))))))))
