(ns metabase.actions-rest.http-action-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.http-test :as actions.http-test]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- http-action
  "An HTTP action without a model that posts its `deal_id` parameter to `url`."
  [url]
  {:name       "Request discount"
   :type       "http"
   :parameters [{:id "p1" :slug "deal_id" :type "number/=" :required true}]
   :method     "POST"
   :url        url
   :body       {"deal" "{{deal_id}}"}})

(deftest create-http-action-test
  (mt/with-model-cleanup [:model/Action]
    (testing "an HTTP action is created with its request"
      (is (=? {:type         "http"
               :method       "POST"
               :url          "https://crm.example.com/discounts"
               :query_params nil
               :body         {:deal "{{deal_id}}"}}
              (mt/user-http-request :crowberto :post 200 "action" (http-action "https://crm.example.com/discounts")))))
    (testing "a placeholder that names no parameter is a 400"
      (is (= "No parameter has the slug deal."
             (mt/user-http-request :crowberto :post 400 "action"
                                   (http-action "https://crm.example.com/{{deal}}")))))
    (testing "an update is checked the same way"
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "action" (http-action "https://crm.example.com"))]
        (is (= "No parameter has the slug deal."
               (mt/user-http-request :crowberto :put 400 (str "action/" id) {:url "https://crm.example.com/{{deal}}"})))))))

(deftest http-action-in-data-app-collection-test
  (testing "an HTTP action can go in a data app's collection"
    (when config/ee-available?
      (mt/with-temp [:model/Collection {app-id :id} {:namespace "data-apps"}]
        (mt/with-model-cleanup [:model/Action]
          (is (=? {:collection_id app-id}
                  (mt/user-http-request :crowberto :post 200 "action"
                                        (assoc (http-action "https://crm.example.com") :collection_id app-id)))))))))

(deftest execute-http-action-test
  (mt/with-model-cleanup [:model/Action]
    (mt/with-temp-env-var-value! [mb-http-action-allowed-networks "allow-all"]
      (actions.http-test/do-with-server
       (fn [_request] (actions.http-test/json-response 200 {"status" "approved"}))
       (fn [url requests]
         (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "action" (http-action (str url "/discounts")))]
           (testing "executing sends the request filled in with the parameters and returns the response"
             (is (= {:response-status 200 :response-body {:status "approved"}}
                    (mt/user-http-request :crowberto :post 200 (format "action/%d/execute" id)
                                          {:parameters {"deal_id" 42}})))
             (is (= {"deal" 42} (json/decode (:body (last @requests))))))
           (testing "a required parameter without a value is a 400 and sends nothing"
             (let [request-count (count @requests)]
               (is (re-find #"deal_id"
                            (str (mt/user-http-request :crowberto :post 400 (format "action/%d/execute" id)
                                                       {:parameters {}}))))
               (is (= request-count (count @requests)))))))))))

(deftest execute-http-action-with-secret-test
  (mt/with-model-cleanup [:model/Action]
    (mt/with-temp-env-var-value! [mb-http-action-allowed-networks "allow-all"]
      (actions.http-test/do-with-server
       (fn [{:keys [headers]}]
         (actions.http-test/json-response 200 {"authorization" (get headers "authorization")}))
       (fn [url requests]
         (mt/with-temp [:model/ActionSecret {secret-id :id} {:name          "crm_token"
                                                             :value         "s3cret"
                                                             :allowed_hosts ["localhost"]}]
           (let [create  (fn [header]
                           (:id (mt/user-http-request :crowberto :post 200 "action"
                                                      (assoc (http-action (str url "/discounts"))
                                                             :headers {"Authorization" header}))))
                 execute (fn [action-id status]
                           (mt/user-http-request :crowberto :post status (format "action/%d/execute" action-id)
                                                 {:parameters {"deal_id" 42}}))
                 action-id (create "Bearer {{secrets.crm_token}}")]
             (testing "the secret goes to an allowed host and never back in the response"
               (is (= {:response-status 200 :response-body {:authorization "Bearer ***"}}
                      (execute action-id 200)))
               (is (= "Bearer s3cret" (get-in (last @requests) [:headers "authorization"]))))
             (testing "a host the secret isn't allowed for is a 400 and gets nothing"
               (t2/update! :model/ActionSecret :id secret-id {:allowed_hosts ["example.com"]})
               (let [request-count (count @requests)]
                 (is (= "The secret crm_token can't be sent to localhost."
                        (execute action-id 400)))
                 (is (= request-count (count @requests)))))
             (testing "a secret that doesn't exist is a 400"
               (is (= "No secret is named missing."
                      (execute (create "Bearer {{secrets.missing}}") 400)))))))))))
