(ns metabase.api.emitter-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.models :refer [Card Dashboard Emitter]]
   [metabase.test :as mt]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(deftest create-emitter-test
  (testing "POST /api/emitter"
    (testing "Creating an emitter with the POST endpoint should return the newly created Emitter"
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (actions.test-util/with-action [{:keys [action-id query-action-card-id]} {}]
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

(deftest update-emitter-test
  (testing "PUT /api/emitter/:id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (actions.test-util/with-action [action {}]
          (actions.test-util/with-card-emitter [{:keys [emitter-id]} action]
            (testing "Should be able to update an emitter"
              (mt/user-http-request :crowberto :put 204 (format "emitter/%d" emitter-id)
                                    {:options {:a 1}})
              (is (partial= {:options {:a 1}} (db/select-one Emitter :id emitter-id))))
            (testing "Should 404 if bad emitter-id"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :put 404 (format "emitter/%d" Integer/MAX_VALUE)
                                           {}))))))))))

(deftest delete-emitter-test
  (testing "DELETE /api/emitter/:id"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
      (actions.test-util/with-actions-test-data-and-actions-enabled
        (actions.test-util/with-action [context {}]
          (actions.test-util/with-card-emitter [{:keys [emitter-id]} context]
            (testing "Should be able to delete an emitter"
              (is (nil? (mt/user-http-request :crowberto :delete 204 (format "emitter/%d" emitter-id)))))
            (testing "Should 404 if bad emitter-id"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :delete 404 (format "emitter/%d" Integer/MAX_VALUE)
                                           {}))))))))))

(deftest execute-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [context {}]
        (actions.test-util/with-card-emitter [{:keys [emitter-id]} context]
          (let [emitter-path  (format "emitter/%d/execute" emitter-id)]
            (testing "Should be able to execute an emitter"
              (is (= {:rows-affected 1}
                     (mt/user-http-request :crowberto :post 200 emitter-path
                                           {:parameters {"my_id" {:type  :number/=
                                                                  :value 1}}}))))
            (is (= [1 "Shop"]
                   (mt/first-row
                     (mt/run-mbql-query categories {:filter [:= $id 1]}))))
            (testing "Should affect 0 rows if id is out of range"
              (is (= {:rows-affected 0}
                     (mt/user-http-request :crowberto :post 200 emitter-path
                                           {:parameters {"my_id" {:type  :number/=
                                                                  :value Integer/MAX_VALUE}}}))))
            (testing "Should 404 if bad emitter-id"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :post 404 (format "emitter/%d/execute" Integer/MAX_VALUE)
                                           {}))))
            (testing "Missing parameter should fail gracefully"
              (is (partial= {:message "Error executing QueryEmitter: Error building query parameter map: Error determining value for parameter \"id\": You'll need to pick a value for 'ID' before this query can run."}
                            (mt/user-http-request :crowberto :post 500 emitter-path
                                                  {:parameters {}}))))
            (testing "Sending an invalid number should fail gracefully"

              (is (partial= {:message "Error executing QueryEmitter: Error building query parameter map: Error determining value for parameter \"id\": Unparseable number: \"BAD\""}
                            (mt/user-http-request :crowberto :post 500 emitter-path
                                                  {:parameters {"my_id" {:type :number/= :value "BAD"}}}))))))))))

(deftest execute-http-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [context {:type :http}]
        (actions.test-util/with-card-emitter [{:keys [emitter-id]} context]
          (let [emitter-path (format "emitter/%d/execute" emitter-id)]
            (testing "Should be able to execute an emitter"
              (is (= {:the_parameter 1}
                     (mt/user-http-request :crowberto :post 200 emitter-path
                                           {:parameters {"my_id" {:type :number/= :value 1}}}))))
            (testing "Should handle errors"
              (is (= {:remote-status 400}
                     (mt/user-http-request :crowberto :post 400 emitter-path
                                           {:parameters {"my_id" {:type :number/= :value 1}
                                                         "my_fail" {:type :text :value "true"}}}))))
            (testing "Missing parameter should fail gracefully"
              (is (partial= {:message "Problem building request: Cannot call the service: missing required parameters: #{\"id\"}"}
                            (mt/user-http-request :crowberto :post 500 emitter-path
                                                  {:parameters {}}))))
            (testing "Sending an invalid number should fail gracefully"
              (is (str/starts-with? (:message (mt/user-http-request :crowberto :post 500 emitter-path
                                                  {:parameters {"my_id" {:type :number/= :value "BAD"}}}))
                                    "Problem building request:")))))))))
