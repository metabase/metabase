(ns metabase.api.emitter-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.models :refer [Card Dashboard]]
   [metabase.test :as mt]
   [metabase.util.schema :as su]
   [schema.core :as s]))

(deftest create-emitter-test
  (testing "POST /api/emitter"
    (testing "Creating an emitter with the POST endpoint should return the newly created Emitter"
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (actions.test-util/with-query-action [{:keys [action-id query-action-card-id]}]
          (let [expected-response {:id                 su/IntGreaterThanZero
                                   :parameter_mappings (s/eq nil)
                                   :action_id          (s/eq action-id)
                                   :action             {:type     (s/eq      "query")
                                                        :card     {:id       (s/eq query-action-card-id)
                                                                   s/Keyword s/Any}
                                                        s/Keyword s/Any}
                                   s/Keyword           s/Any}]
            (testing "CardEmitter"
              (mt/with-temp Card [{card-id :id}]
                (is (schema= expected-response
                             (mt/user-http-request :crowberto :post 200 "emitter" {:card_id   card-id
                                                                                   :action_id action-id})))))
            (testing "DashboardEmitter"
              (mt/with-temp Dashboard [{dashboard-id :id}]
                (is (schema= expected-response
                             (mt/user-http-request :crowberto :post 200 "emitter" {:dashboard_id dashboard-id
                                                                                   :action_id    action-id})))))))))))

(deftest execute-custom-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-query-action [context]
        (actions.test-util/with-card-emitter [{:keys [emitter-id]} context]
          (testing "Should be able to execute an emitter"
            (is (= {:rows-affected 1}
                   (mt/user-http-request :crowberto :post 200 (format "emitter/%d/execute" emitter-id)
                                         {:parameters {"my_id" {:type  :number/=
                                                                :value 1}}}))))
          (is (= [1 "Bird Shop"]
                 (mt/first-row
                  (mt/run-mbql-query categories {:filter [:= $id 1]})))))))))
