(ns metabase-enterprise.sandbox.api.gtap-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
   [metabase.http-client :as client]
   [metabase.models :refer [Card Field PermissionsGroup Table]]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.server.middleware.util :as mw.util]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest require-auth-test
  (testing "Must be authenticated to query for GTAPs"
    (premium-features-test/with-premium-features #{:sandboxes}
      (is (= (get mw.util/response-unauthentic :body)
             (client/client :get 401 "mt/gtap")))

      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (str "mt/gtap")))))))

(def ^:private default-gtap-results
  {:id                   true
   :card_id              true
   :table_id             true
   :group_id             true
   :permission_id        false
   :attribute_remappings {:foo 1}})

(defmacro ^:private with-gtap-cleanup
  "Invokes `body` ensuring any `GroupTableAccessPolicy` created will be removed afterward. Leaving behind a GTAP can
  case referential integrity failures for any related `Card` that would be cleaned up as part of a `with-temp*` call"
  [& body]
  `(premium-features-test/with-premium-features #{:sandboxes}
     (mt/with-model-cleanup [GroupTableAccessPolicy]
       ~@body)))

(defn- gtap-post
  "`gtap-data` is a map to be POSTed to the GTAP endpoint"
  [gtap-data]
  (mt/user-http-request :crowberto :post 200 "mt/gtap" gtap-data))

(deftest validate-token-test
  (testing "POST /api/mt/gtap"
    (testing "Must have a valid token to use GTAPs"
      (with-redefs [premium-features/enable-sandboxes? (constantly false)]
        (mt/with-temporary-setting-values [premium-embedding-token nil]
          (mt/with-temp [Table            {table-id :id} {}
                         PermissionsGroup {group-id :id} {}
                         Card             {card-id :id}  {}]
            (is (= "Sandboxes is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                   (mt/user-http-request :crowberto :post 402 "mt/gtap"
                                         {:table_id             table-id
                                          :group_id             group-id
                                          :card_id              card-id
                                          :attribute_remappings {"foo" 1}})))))))))

(deftest fetch-gtap-test
  (testing "GET /api/mt/gtap/"
    (with-gtap-cleanup
      (mt/with-temp [Table                  {table-id-1 :id} {}
                     Table                  {table-id-2 :id} {}
                     PermissionsGroup       {group-id-1 :id} {}
                     PermissionsGroup       {group-id-2 :id} {}
                     Card                   {card-id :id} {}
                     GroupTableAccessPolicy {gtap-id-1 :id} {:table_id table-id-1
                                                             :group_id group-id-1
                                                             :card_id  card-id}
                     GroupTableAccessPolicy {gtap-id-2 :id} {:table_id table-id-2
                                                             :group_id group-id-2
                                                             :card_id  card-id}]
        (testing "Test that we can fetch the list of all GTAPs"
          (is (partial=
               [{:id gtap-id-1 :table_id table-id-1 :group_id group-id-1}
                {:id gtap-id-2 :table_id table-id-2 :group_id group-id-2}]
               (filter
                #(#{gtap-id-1 gtap-id-2} (:id %))
                (mt/user-http-request :crowberto :get 200 "mt/gtap/")))))

        (testing "Test that we can fetch the GTAP for a specific table and group"
          (is (partial=
               {:id gtap-id-1 :table_id table-id-1 :group_id group-id-1}
               (mt/user-http-request :crowberto :get 200 "mt/gtap/"
                                     :group_id group-id-1 :table_id table-id-1))))))))

(deftest create-gtap-test
  (testing "POST /api/mt/gtap"
    (mt/with-temp [Table            {table-id :id} {}
                   PermissionsGroup {group-id :id} {}]
      (testing "Test that we can create a new GTAP"
        (t2.with-temp/with-temp [Card {card-id :id}]
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
        (mt/with-temp [Field _ {:name "My field" :table_id table-id :base_type :type/Integer}
                       Card  {card-id :id} {:dataset_query (mt/mbql-query venues
                                                                          {:fields      [[:expression "My field"]]
                                                                           :expressions {"My field" [:ltrim "wow"]}})}]
          (with-gtap-cleanup
            (is (=? {:message  "Sandbox Questions can't return columns that have different types than the Table they are sandboxing."
                     :expected "type/Integer"
                     :actual   "type/Text"}
                    (mt/user-http-request :crowberto :post 400 "mt/gtap"
                                          {:table_id             table-id
                                           :group_id             group-id
                                           :card_id              card-id
                                           :attribute_remappings {"foo" 1}})))))))))

(deftest validate-sandbox-test
  (testing "POST /api/mt/gtap/validate"
    (mt/with-temp [Table            {table-id :id} {}
                   PermissionsGroup {group-id :id} {}]
      (testing "A valid sandbox passes validation and returns no error"
        (t2.with-temp/with-temp [Card {card-id :id}]
          (with-gtap-cleanup
            (mt/user-http-request :crowberto :post 204 "mt/gtap/validate"
                                  {:table_id             table-id
                                   :group_id             group-id
                                   :card_id              card-id}))))

      (testing "A sandbox without a card-id passes validation, because the validation is not applicable in this case"
        (with-gtap-cleanup
          (mt/user-http-request :crowberto :post 204 "mt/gtap/validate"
                                {:table_id             table-id
                                 :group_id             group-id
                                 :card_id              nil
                                 :attribute_remappings {"foo" 1}})))

      (testing "An invalid sandbox results in a 400 error being returned"
        (mt/with-temp [Field _ {:name "My field", :table_id table-id, :base_type :type/Integer}
                       Card  {card-id :id} {:dataset_query (mt/mbql-query venues
                                                             {:fields      [[:expression "My field"]]
                                                              :expressions {"My field" [:ltrim "wow"]}})}]
          (with-gtap-cleanup
            (is (=? {:message  "Sandbox Questions can't return columns that have different types than the Table they are sandboxing."
                     :expected "type/Integer"
                     :actual   "type/Text"}
                    (mt/user-http-request :crowberto :post 400 "mt/gtap/validate"
                                          {:table_id             table-id
                                           :group_id             group-id
                                           :card_id              card-id
                                           :attribute_remappings {"foo" 1}})))))))))

(deftest delete-gtap-test
  (testing "DELETE /api/mt/gtap/:id"
    (testing "Test that we can delete a GTAP"
      (mt/with-temp [Table            {table-id :id} {}
                     PermissionsGroup {group-id :id} {}
                     Card             {card-id :id} {}]
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
    (mt/with-temp [Table            {table-id :id} {}
                   PermissionsGroup {group-id :id} {}
                   Card             {card-id :id}  {}]
      (premium-features-test/with-premium-features #{:sandboxes}
        (testing "Test that we can update only the attribute remappings for a GTAP"
          (t2.with-temp/with-temp [GroupTableAccessPolicy {gtap-id :id} {:table_id             table-id
                                                                         :group_id             group-id
                                                                         :card_id              card-id
                                                                         :attribute_remappings {"foo" 1}}]
            (is (= (assoc default-gtap-results :attribute_remappings {:bar 2})
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:attribute_remappings {:bar 2}}))))))

        (testing "Test that we can add a card_id via PUT"
          (t2.with-temp/with-temp [GroupTableAccessPolicy {gtap-id :id} {:table_id             table-id
                                                                         :group_id             group-id
                                                                         :card_id              nil
                                                                         :attribute_remappings {"foo" 1}}]
            (is (= default-gtap-results
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:card_id card-id}))))))

        (testing "Test that we can remove a card_id via PUT"
          (t2.with-temp/with-temp [GroupTableAccessPolicy {gtap-id :id} {:table_id             table-id
                                                                         :group_id             group-id
                                                                         :card_id              card-id
                                                                         :attribute_remappings {"foo" 1}}]
            (is (= (assoc default-gtap-results :card_id false)
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:card_id nil}))))))

        (testing "Test that we can remove a card_id and change attribute remappings via PUT"
          (t2.with-temp/with-temp [GroupTableAccessPolicy {gtap-id :id} {:table_id             table-id
                                                                         :group_id             group-id
                                                                         :card_id              card-id
                                                                         :attribute_remappings {"foo" 1}}]
            (is (= (assoc default-gtap-results :card_id false, :attribute_remappings {:bar 2})
                   (mt/boolean-ids-and-timestamps
                    (mt/user-http-request :crowberto :put 200 (format "mt/gtap/%s" gtap-id)
                                          {:card_id              nil
                                           :attribute_remappings {:bar 2}}))))))))))

(deftest bulk-upsert-sandboxes-test
  (testing "PUT /api/permissions/graph"
    (mt/with-temp [Table            {table-id-1 :id} {:db_id (mt/id) :schema "PUBLIC"}
                   Table            {table-id-2 :id} {:db_id (mt/id) :schema "PUBLIC"}
                   PermissionsGroup {group-id :id}   {}
                   Card             {card-id-1 :id}  {}
                   Card             {card-id-2 :id}  {}]
      (premium-features-test/with-premium-features #{:sandboxes}
        (with-gtap-cleanup
          (testing "Test that we can create a new sandbox using the permission graph API"
            (let [graph  (-> (perms/data-perms-graph)
                             (assoc-in [:groups group-id (mt/id) :data :schemas "PUBLIC" table-id-1 :query] :segmented)
                             (assoc :sandboxes [{:table_id             table-id-1
                                                 :group_id             group-id
                                                 :card_id              card-id-1
                                                 :attribute_remappings {"foo" 1}}]))
                  result (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)]
              (is (=? [{:id                   (mt/malli=? :int)
                        :table_id             table-id-1
                        :group_id             group-id
                        :card_id              card-id-1
                        :attribute_remappings {:foo 1}
                        :permission_id        (mt/malli=? :int)}]
                      (:sandboxes result)))
              (is (t2/exists? GroupTableAccessPolicy :table_id table-id-1 :group_id group-id))))

          (testing "Test that we can update a sandbox using the permission graph API"
            (let [sandbox-id (t2/select-one-fn :id GroupTableAccessPolicy
                                                  :table_id table-id-1
                                                  :group_id group-id)
                  graph      (-> (perms/data-perms-graph)
                                 (assoc :sandboxes [{:id                   sandbox-id
                                                     :card_id              card-id-2
                                                     :attribute_remappings {"foo" 2}}]))
                  result     (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)]
              (is (partial= [{:table_id table-id-1 :group_id group-id}]
                            (:sandboxes result)))
              (is (partial= {:card_id              card-id-2
                             :attribute_remappings {"foo" 2}}
                            (t2/select-one GroupTableAccessPolicy
                                           :table_id table-id-1
                                           :group_id group-id)))))

          (testing "Test that we can create and update multiple sandboxes at once using the permission graph API"
            (let [sandbox-id (t2/select-one-fn :id GroupTableAccessPolicy
                                                  :table_id table-id-1
                                                  :group_id group-id)
                  graph       (-> (perms/data-perms-graph)
                                  (assoc-in [:groups group-id (mt/id) :data :schemas "PUBLIC" table-id-2 :query] :segmented)
                                  (assoc :sandboxes [{:id                   sandbox-id
                                                      :card_id              card-id-1
                                                      :attribute_remappings {"foo" 3}}
                                                     {:table_id             table-id-2
                                                      :group_id             group-id
                                                      :card_id              card-id-2
                                                      :attribute_remappings {"foo" 10}}]))
                  result     (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)]
              (is (partial= [{:table_id table-id-1 :group_id group-id}
                             {:table_id table-id-2 :group_id group-id}]
                            (:sandboxes result)))
              ;; Updated sandbox
              (is (partial= {:card_id              card-id-1
                             :attribute_remappings {"foo" 3}}
                            (t2/select-one GroupTableAccessPolicy
                                           :table_id table-id-1
                                           :group_id group-id)))
              ;; Created sandbox
              (is (partial= {:card_id              card-id-2
                             :attribute_remappings {"foo" 10}}
                            (t2/select-one GroupTableAccessPolicy
                                           :table_id table-id-2
                                           :group_id group-id))))))))))

(deftest bulk-upsert-sandboxes-error-test
  (testing "PUT /api/permissions/graph"
    (testing "make sure an error is thrown if the :sandboxes key is included in the request, but the :sandboxes feature
             is not enabled"
      (with-redefs [premium-features/enable-sandboxes? (constantly false)]
        (mt/with-temporary-setting-values [premium-embedding-token nil]
          (is (= "Sandboxes is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :crowberto :put 402 "permissions/graph"
                                       (assoc (perms/data-perms-graph) :sandboxes [{:card_id 1}])))))))))
