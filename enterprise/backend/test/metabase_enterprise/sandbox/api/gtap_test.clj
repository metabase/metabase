(ns metabase-enterprise.sandbox.api.gtap-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.http-client :as http]
            [metabase.models :refer [Card Field PermissionsGroup Table]]
            [metabase.public-settings.metastore :as metastore]
            [metabase.server.middleware.util :as middleware.u]
            [metabase.test :as mt]
            [schema.core :as s]))

(defmacro ^:private with-sandboxes-enabled [& body]
  `(with-redefs [metastore/enable-sandboxes? (constantly true)]
     ~@body))

(deftest require-auth-test
  (testing "Must be authenticated to query for GTAPs"
    (with-sandboxes-enabled
      (is (= (get middleware.u/response-unauthentic :body)
             (http/client :get 401 "mt/gtap")))

      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (str "mt/gtap")))))))

(def ^:private default-gtap-results
  {:id                   true
   :card_id              true
   :table_id             true
   :group_id             true
   :attribute_remappings {:foo 1}})

(defmacro ^:private with-gtap-cleanup
  "Invokes `body` ensuring any `GroupTableAccessPolicy` created will be removed afterward. Leaving behind a GTAP can
  case referential integrity failures for any related `Card` that would be cleaned up as part of a `with-temp*` call"
  [& body]
  `(with-sandboxes-enabled
     (mt/with-model-cleanup [GroupTableAccessPolicy]
       ~@body)))

(defn- gtap-post
  "`gtap-data` is a map to be POSTed to the GTAP endpoint"
  [gtap-data]
  (mt/user-http-request :crowberto :post 200 "mt/gtap" gtap-data))

(deftest validate-token-test
  (testing "POST /api/mt/gtap"
    (testing "Must have a valid token to use GTAPs"
      (with-redefs [metastore/enable-sandboxes? (constantly false)]
        (mt/with-temp* [Table            [{table-id :id}]
                        PermissionsGroup [{group-id :id}]
                        Card             [{card-id :id}]]
          (is (re= #".*sandboxing is not enabled.*"
                   (mt/user-http-request :crowberto :post 403 "mt/gtap"
                                         {:table_id             table-id
                                          :group_id             group-id
                                          :card_id              card-id
                                          :attribute_remappings {"foo" 1}}))))))))
(deftest create-gtap-test
  (testing "POST /api/mt/gtap"
    (mt/with-temp* [Table            [{table-id :id}]
                    PermissionsGroup [{group-id :id}]]
      (testing "Test that we can create a new GTAP"
        (mt/with-temp Card [{card-id :id}]
          (with-gtap-cleanup
            (let [post-results (gtap-post {:table_id             table-id
                                           :group_id             group-id
                                           :card_id              card-id
                                           :attribute_remappings {"foo" 1}})]
              (is (= default-gtap-results
                     (mt/boolean-ids-and-timestamps post-results)))
              (is (= post-results
                     (mt/user-http-request :crowberto :get 200 (format "mt/gtap/%s" (:id post-results)))))))))

      (testing "Test that we can create a new GTAP without a card"
        (with-gtap-cleanup
          (let [post-results (gtap-post {:table_id             table-id
                                         :group_id             group-id
                                         :card_id              nil
                                         :attribute_remappings {"foo" 1}})]
            (is (= (assoc default-gtap-results :card_id false)
                   (mt/boolean-ids-and-timestamps post-results)))
            (is (= post-results
                   (mt/user-http-request :crowberto :get 200 (format "mt/gtap/%s" (:id post-results))))))))

      (testing "Meaningful errors should be returned if you create an invalid GTAP"
        (mt/with-temp* [Field [_ {:name "My field", :table_id table-id, :base_type :type/Integer}]
                        Card  [{card-id :id} {:dataset_query (mt/mbql-query venues
                                                               {:fields      [[:expression "My field"]]
                                                                :expressions {"My field" [:ltrim "wow"]}})}]]
          (with-gtap-cleanup
            (is (schema= {:message  (s/eq "Sandbox Questions can't return columns that have different types than the Table they are sandboxing.")
                          :expected (s/eq "type/Integer")
                          :actual   (s/eq "type/Text")
                          s/Keyword s/Any}
                         (mt/user-http-request :crowberto :post 400 "mt/gtap"
                                               {:table_id             table-id
                                                :group_id             group-id
                                                :card_id              card-id
                                                :attribute_remappings {"foo" 1}})))))))))

(deftest delete-gtap-test
  (testing "DELETE /api/mt/gtap/:id"
    (testing "Test that we can delete a GTAP"
      (mt/with-temp* [Table            [{table-id :id}]
                      PermissionsGroup [{group-id :id}]
                      Card             [{card-id :id}]]
        (with-gtap-cleanup
          (let [{:keys [id]} (gtap-post {:table_id             table-id
                                         :group_id             group-id
                                         :card_id              card-id
                                         :attribute_remappings {"foo" 1}})]
            (is (= default-gtap-results
                   (mt/boolean-ids-and-timestamps (mt/user-http-request :crowberto :get 200 (format "mt/gtap/%s" id)))))
            (is (= nil
                   (mt/user-http-request :crowberto :delete 204 (format "mt/gtap/%s" id))))
            (is (= "Not found."
                   (mt/user-http-request :crowberto :get 404 (format "mt/gtap/%s" id))))))))))

(deftest update-gtap-test
  (testing "PUT /api/mt/gtap"
    (mt/with-temp* [Table                  [{table-id :id}]
                    PermissionsGroup       [{group-id :id}]
                    Card                   [{card-id :id}]]
      (with-sandboxes-enabled
        (testing "Test that we can update only the attribute remappings for a GTAP"
          (mt/with-temp GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                               :group_id             group-id
                                                               :card_id              card-id
                                                               :attribute_remappings {"foo" 1}}]
            (is (= (assoc default-gtap-results :attribute_remappings {:bar 2})
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:attribute_remappings {:bar 2}}))))))

        (testing "Test that we can add a card_id via PUT"
          (mt/with-temp GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                               :group_id             group-id
                                                               :card_id              nil
                                                               :attribute_remappings {"foo" 1}}]
            (is (= default-gtap-results
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:card_id card-id}))))))

        (testing "Test that we can remove a card_id via PUT"
          (mt/with-temp GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                               :group_id             group-id
                                                               :card_id              card-id
                                                               :attribute_remappings {"foo" 1}}]
            (is (= (assoc default-gtap-results :card_id false)
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:card_id nil}))))))

        (testing "Test that we can remove a card_id and change attribute remappings via PUT"
          (mt/with-temp GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                               :group_id             group-id
                                                               :card_id              card-id
                                                               :attribute_remappings {"foo" 1}}]
            (is (= (assoc default-gtap-results :card_id false, :attribute_remappings {:bar 2})
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:card_id              nil
                                           :attribute_remappings {:bar 2}}))))))))))
