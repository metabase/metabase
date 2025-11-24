(ns metabase.segments.api-test
  "Tests for /api/segment endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; ## Helper Fns

(defn- user-details [user]
  (select-keys
   user
   [:email :first_name :last_login :is_qbnewb :is_superuser :id :last_name :date_joined :common_name :locale :tenant_id]))

(defn- segment-response [segment]
  (-> (into {} segment)
      (dissoc :id)
      (update :creator #(into {} %))
      (update :entity_id some?)
      (update :created_at some?)
      (update :updated_at some?)))

(defn- mbql4-segment-definition
  "Create a legacy MBQL4 segment definition"
  [field-id value]
  {:filter [:= [:field field-id nil] value]})

(defn- pmbql-segment-definition
  "Create an MBQL5 segment definition"
  [table-id field-id value]
  (let [metadata-provider (lib-be/application-database-metadata-provider (t2/select-one-fn :db_id :model/Table :id table-id))
        table (lib.metadata/table metadata-provider table-id)
        query (lib/query metadata-provider table)
        field (lib.metadata/field metadata-provider field-id)]
    (lib/filter query (lib/= field value))))

;; Helper function for creating model-based pMBQL definitions
(defn- card-segment-definition
  "Create an MBQL5 segment definition for a card (card with dataset=true)"
  [card-id field-id value]
  (let [table-id (t2/select-one-fn :table_id :model/Card :id card-id)
        metadata-provider (lib-be/application-database-metadata-provider (t2/select-one-fn :db_id :model/Table :id table-id))
        card (lib.metadata/card metadata-provider card-id)
        query (lib/query metadata-provider card)
        field (lib.metadata/field metadata-provider field-id)]
    (lib/filter query (lib/= field value))))

;; ## /api/segment/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest authentication-test
  (is (= (get api.response/response-unauthentic :body)
         (client/client :get 401 "segment")))

  (is (= (get api.response/response-unauthentic :body)
         (client/client :put 401 "segment/13"))))

;; ## POST /api/segment

(deftest create-segment-permissions-test
  (testing "POST /api/segment"
    (testing "Test security. Requires superuser perms."
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "segment" {:name       "abc"
                                                               :table_id   123
                                                               :definition {}}))))))

(deftest create-segment-input-validation-test
  (testing "POST /api/segment"
    (is (=? {:errors {:name "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :post 400 "segment" {})))

    (is (=? {:specific-errors
             {:definition ["missing required key, received: nil"],
              :malli/error ["Must provide exactly one of :table_id or :card_id, received: {:name \"abc\"}"]},
             :errors {:definition "Value must be a map."}}
            (mt/user-http-request :crowberto :post 400 "segment" {:name "abc"})))

    (is (=? {:specific-errors
             {:table_id ["value must be an integer greater than zero., received: \"foobar\""],
              :definition ["missing required key, received: nil"]},
             :errors {:table_id "nullable value must be an integer greater than zero."
                      :definition "Value must be a map."}}
            (mt/user-http-request :crowberto :post 400 "segment" {:name     "abc"
                                                                  :table_id "foobar"})))

    (is (=? {:errors {:definition "Value must be a map."}}
            (mt/user-http-request :crowberto :post 400 "segment" {:name     "abc"
                                                                  :table_id 123})))

    (is (=? {:errors {:definition "Value must be a map."}}
            (mt/user-http-request :crowberto :post 400 "segment" {:name       "abc"
                                                                  :table_id   123
                                                                  :definition "foobar"})))))

(deftest create-segment-test
  (mt/with-temp [:model/Database {database-id :id} {}
                 :model/Table    {:keys [id]} {:db_id database-id}]
    (doseq [[format-name def-fn] {"MBQL4" mbql4-segment-definition
                                  "pMBQL" (partial pmbql-segment-definition id)}]
      (testing format-name
        (is (= {:name                    "A Segment"
                :description             "I did it!"
                :show_in_getting_started false
                :caveats                 nil
                :points_of_interest      nil
                :table_id                id
                :card_id                 nil
                :creator_id              (mt/user->id :crowberto)
                :creator                 (user-details (mt/fetch-user :crowberto))
                :entity_id               true
                :created_at              true
                :updated_at              true
                :archived                false
                :definition true}
               (-> (mt/user-http-request :crowberto :post 200 "segment"
                                         {:name                    "A Segment"
                                          :description             "I did it!"
                                          :show_in_getting_started false
                                          :caveats                 nil
                                          :points_of_interest      nil
                                          :table_id                id
                                          :definition              (def-fn 10 20)})
                   segment-response
                   (update :definition map?))))))))

(deftest ^:parallel create-segment-with-card-id-test
  (testing "POST /api/segment with card_id"
    (testing "Can create a segment based on a card"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table {table-id :id} {:db_id database-id}
                     :model/Card {card-id :id} {:table_id table-id
                                                :type :model
                                                :database_id database-id}]
        (let [result (mt/user-http-request :crowberto :post 200 "segment"
                                           {:name "Card Segment"
                                            :description "A segment on a card"
                                            :card_id card-id
                                            :definition (card-segment-definition card-id 10 20)})]
          (is (=? {:name "Card Segment"
                   :description "A segment on a card"
                   :creator_id (mt/user->id :crowberto)
                   :archived false
                   :definition map?
                   :id pos-int?}
                  result))
          ;; Verify the segment was created with card_id and not table_id
          (is (=? {:card_id card-id
                   :table_id nil}
                  (t2/select-one :model/Segment :id (:id result)))))))))

(deftest ^:parallel create-segment-xor-both-test
  (testing "POST /api/segment with both table_id and card_id should fail"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table {table-id :id} {:db_id database-id}
                   :model/Card {card-id :id} {:table_id table-id
                                              :type :model
                                              :database_id database-id}]
      (let [response (mt/user-http-request :crowberto :post 400 "segment"
                                           {:name "Bad Segment"
                                            :table_id table-id
                                            :card_id card-id
                                            :definition {}})]
        (is (seq (:specific-errors response)))
        (is (re-find #"Must provide exactly one" (first (:specific-errors response))))))))

(deftest ^:parallel create-segment-xor-neither-test
  (testing "POST /api/segment with neither table_id nor card_id should fail"
    (let [response (mt/user-http-request :crowberto :post 400 "segment"
                                         {:name "Bad Segment"
                                          :definition {}})]
      (is (seq (:specific-errors response)))
      (is (re-find #"Must provide exactly one" (first (:specific-errors response)))))))

(deftest ^:parallel create-segment-with-card-id-permissions-test
  (testing "POST /api/segment with card_id"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table {table-id :id} {:db_id database-id}
                   :model/Card {card-id :id} {:table_id table-id
                                              :type :model
                                              :database_id database-id}]
      (testing "Superuser can create segment on card"
        (is (=? {:name "Card Segment"
                 :card_id card-id
                 :id pos-int?}
                (mt/user-http-request :crowberto :post 200 "segment"
                                      {:name "Card Segment"
                                       :card_id card-id
                                       :definition (card-segment-definition card-id 10 20)}))))
      (testing "Non-superuser cannot create segment on card"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "segment"
                                     {:name "Card Segment"
                                      :card_id card-id
                                      :definition {}})))))))

(deftest fetch-segment-with-card-id-test
  (testing "GET /api/segment/:id for segment created with card_id"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table {table-id :id} {:db_id database-id}
                   :model/Card {card-id :id} {:table_id table-id
                                              :type :model
                                              :database_id database-id}
                   :model/Segment {segment-id :id} {:creator_id (mt/user->id :crowberto)
                                                    :table_id nil
                                                    :card_id card-id
                                                    :definition (card-segment-definition card-id 2 "cans")}]
      (mt/with-full-data-perms-for-all-users!
        (is (=? {:name "Toucans in the rainforest"
                 :description "Lookin' for a blueberry"
                 :creator_id (mt/user->id :crowberto)
                 :archived false
                 :definition map?}
                (mt/user-http-request :rasta :get 200 (format "segment/%d" segment-id))))
        ;; Verify card_id is present in the database
        (is (=? {:card_id card-id
                 :table_id nil}
                (t2/select-one :model/Segment :id segment-id)))))))

(deftest fetch-segment-with-card-id-permissions-test
  (testing "GET /api/segment/:id for segment based on card"
    (testing "Requires read perms for the Card (not the Table)"
      (mt/with-temp [:model/Database db {}
                     :model/Table table {:db_id (u/the-id db)}
                     :model/Collection {coll-id :id} {} ; Create collection for testing permissions
                     :model/Card card {:table_id (u/the-id table)
                                       :type :model
                                       :database_id (u/the-id db)
                                       :collection_id coll-id}
                     :model/Segment segment {:table_id nil
                                             :card_id (u/the-id card)
                                             :definition (card-segment-definition (u/the-id card) 2 "cans")}]
        ;; Remove permissions for all users from the collection
        (perms/revoke-collection-permissions! (perms/all-users-group) coll-id)
        (testing "User without card permissions cannot read segment"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "segment/" (u/the-id segment))))))
        ;; Grant read permissions to the collection
        (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
        (testing "User with card permissions can read segment"
          (is (some? (mt/user-http-request :rasta :get 200 (str "segment/" (u/the-id segment))))))))))

;; ## PUT /api/segment

(deftest update-permissions-test
  (testing "PUT /api/segment/:id"
    (testing "test security. requires superuser perms"
      (mt/with-temp [:model/Segment segment {}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "segment/" (:id segment))
                                     {:name             "abc"
                                      :definition       {}
                                      :revision_message "something different"})))))))

(deftest update-input-validation-test
  (testing "PUT /api/segment/:id"
    (is (=? {:errors {:name "nullable value must be a non-blank string."}}
            (mt/user-http-request :crowberto :put 400 "segment/1" {:name "" :revision_message "abc"})))

    (is (=? {:errors {:revision_message "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :put 400 "segment/1" {:name "abc"})))

    (is (=? {:errors {:revision_message "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :put 400 "segment/1" {:name             "abc"
                                                                   :revision_message ""})))

    (is (=? {:errors {:definition "nullable map"}}
            (mt/user-http-request :crowberto :put 400 "segment/1" {:name             "abc"
                                                                   :revision_message "123"
                                                                   :definition       "foobar"})))))

(deftest update-test
  (testing "PUT /api/segment/:id"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table    {table-id :id} {:db_id database-id}
                   :model/Segment {:keys [id]} {:table_id table-id
                                                :definition (mbql4-segment-definition 2 "cans")}]
      (doseq [[format-name def-fn] {"MBQL4" mbql4-segment-definition
                                    "pMBQL" (partial pmbql-segment-definition table-id)}]
        (letfn [(request [expected-response-code]
                  (mt/user-http-request
                   :crowberto :put expected-response-code (format "segment/%d" id)
                   {:id                      id
                    :name                    "Costa Rica"
                    :description             nil
                    :show_in_getting_started false
                    :caveats                 nil
                    :points_of_interest      nil
                    :table_id                456
                    :revision_message        "I got me some revisions"
                    :definition              (def-fn 2 "cans")}))]
          (testing format-name
            (case format-name
              "pMBQL"
              (is (= {:name                    "Costa Rica"
                      :description             nil
                      :show_in_getting_started false
                      :caveats                 nil
                      :points_of_interest      nil
                      :table_id                table-id
                      :card_id nil
                      :creator_id              (mt/user->id :rasta)
                      :creator                 (user-details (mt/fetch-user :rasta))
                      :entity_id               true
                      :created_at              true
                      :updated_at              true
                      :archived                false
                      :definition true}
                     (-> (request 200)
                         segment-response
                         (update :definition map?))))
              "MBQL4"
              (is (= "Segment definition must be an MBQL query"
                     (request 400))))))))))

(deftest partial-update-test
  (testing "PUT /api/segment/:id"
    (testing "Can I update a segment's name without specifying `:points_of_interest` and `:show_in_getting_started`?"
      (mt/with-temp [:model/Segment segment {:definition (mbql4-segment-definition 2 "cans")}]
        ;; just make sure API call doesn't barf
        (is (some? (mt/user-http-request :crowberto :put 200 (str "segment/" (u/the-id segment))
                                         {:name             "Cool name"
                                          :revision_message "WOW HOW COOL"})))))))

(deftest archive-test
  (testing "PUT /api/segment/:id"
    (testing "Can we archive a Segment with the PUT endpoint?"
      (mt/with-temp [:model/Segment {:keys [id]} {:definition (mbql4-segment-definition 2 "cans")}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "segment/" id)
                                        {:archived true, :revision_message "Archive the Segment"})))
        (is (true?
             (t2/select-one-fn :archived :model/Segment :id id)))))))

(deftest unarchive-test
  (testing "PUT /api/segment/:id"
    (testing "Can we unarchive a Segment with the PUT endpoint?"
      (mt/with-temp [:model/Segment {:keys [id]} {:archived true
                                                  :definition (mbql4-segment-definition 2 "cans")}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "segment/" id)
                                        {:archived false, :revision_message "Unarchive the Segment"})))
        (is (= false
               (t2/select-one-fn :archived :model/Segment :id id)))))))

;; ## DELETE /api/segment/:id

(deftest delete-permissions-test
  (testing "DELETE /api/segment/:id"
    (testing "test security. requires superuser perms"
      (mt/with-temp [:model/Segment {:keys [id]} {:definition (mbql4-segment-definition 2 "cans")}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (str "segment/" id)
                                     :revision_message "yeeeehaw!")))))))

(deftest delete-input-validation-test
  (testing "DELETE /api/segment/:id"
    (is (=? {:errors {:revision_message "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :delete 400 "segment/1" {:name "abc"})))

    (is (=? {:errors {:revision_message "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :delete 400 "segment/1" :revision_message "")))))

(deftest delete-test
  (testing "DELETE /api/segment/:id"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table    {table-id :id} {:db_id database-id}
                   :model/Segment {:keys [id]} {:table_id table-id
                                                :definition (mbql4-segment-definition 2 "cans")}]
      (is (= nil
             (mt/user-http-request :crowberto :delete 204 (format "segment/%d" id) :revision_message "carryon")))
      (testing "should still be able to fetch the archived segment"
        (is (=? {:name                    "Toucans in the rainforest"
                 :description             "Lookin' for a blueberry"
                 :show_in_getting_started false
                 :caveats                 nil
                 :points_of_interest      nil
                 :table_id                table-id
                 :card_id nil
                 :creator_id              (mt/user->id :rasta)
                 :creator                 (user-details (mt/fetch-user :rasta))
                 :created_at              true
                 :updated_at              true
                 :entity_id               true
                 :archived                true
                 :definition true}
                (-> (mt/user-http-request :crowberto :get 200 (format "segment/%d" id))
                    segment-response
                    (update :definition map?))))))))

;; ## GET /api/segment/:id

(deftest fetch-segment-permissions-test
  (testing "GET /api/segment/:id"
    (testing "test security. Requires read perms for the Table it references"
      (mt/with-temp [:model/Database db      {}
                     :model/Table    table   {:db_id (u/the-id db)}
                     :model/Segment segment {:table_id (u/the-id table)
                                             :definition (mbql4-segment-definition 2 "cans")}]
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "segment/" (u/the-id segment))))))))))

(deftest fetch-segment-test
  (testing "GET /api/segment/:id"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table {table-id :id} {:db_id database-id}]
      (doseq [[format-name def-fn] {"MBQL4" mbql4-segment-definition
                                    "pMBQL" (partial pmbql-segment-definition table-id)}]
        (testing format-name
          (mt/with-temp [:model/Segment {:keys [id]} {:creator_id (mt/user->id :crowberto)
                                                      :table_id   table-id
                                                      :definition (def-fn 2 "cans")}]
            (mt/with-full-data-perms-for-all-users!
              (is (= {:name                    "Toucans in the rainforest"
                      :description             "Lookin' for a blueberry"
                      :show_in_getting_started false
                      :caveats                 nil
                      :points_of_interest      nil
                      :table_id                table-id
                      :card_id nil
                      :creator_id              (mt/user->id :crowberto)
                      :creator                 (user-details (mt/fetch-user :crowberto))
                      :created_at              true
                      :updated_at              true
                      :entity_id               true
                      :archived                false
                      :definition true}
                     (-> (mt/user-http-request :rasta :get 200 (format "segment/%d" id))
                         segment-response
                         (dissoc :query_description)
                         (update :definition map?)))))))))))

(deftest list-test
  (testing "GET /api/segment/"
    (mt/with-temp [:model/Segment {id-1 :id} {:name     "Segment 1"
                                              :table_id (mt/id :users)
                                              :definition (mbql4-segment-definition (mt/id :users :name) "cans")}
                   :model/Segment {id-2 :id} {:name       "Segment 2"
                                              :definition (:query (mt/mbql-query venues
                                                                    {:filter
                                                                     [:and
                                                                      [:= $price 4]
                                                                      [:= $category_id->categories.name "BBQ"]]}))}
                   ;; inactive segments shouldn't show up
                   :model/Segment {id-3 :id} {:archived true
                                              :definition (mbql4-segment-definition 2 "cans")}]
      (mt/with-full-data-perms-for-all-users!
        (is (=? [{:id                     id-1
                  :name                   "Segment 1"
                  :creator                {}
                  :definition_description "Filtered by Name is cans"}
                 {:id                     id-2
                  :name                   "Segment 2"
                  :definition             {}
                  :creator                {}
                  :definition_description "Filtered by Price is equal to 4 and Category → Name is BBQ"}]
                (filter (fn [{segment-id :id}]
                          (contains? #{id-1 id-2 id-3} segment-id))
                        (mt/user-http-request :rasta :get 200 "segment/"))))))))

(deftest related-entities-test
  (testing "GET /api/segment/:id/related"
    (testing "related/recommended entities"
      (mt/with-temp [:model/Segment {segment-id :id} {:definition (mbql4-segment-definition 2 "cans")}]
        (is (= #{:table :metrics :segments :linked-from}
               (-> (mt/user-http-request :crowberto :get 200 (format "segment/%s/related" segment-id))
                   keys
                   set)))))))
