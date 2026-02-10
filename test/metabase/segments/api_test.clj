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
   [:email :first_name :last_login :is_qbnewb :is_superuser :is_data_analyst :id :last_name :date_joined :common_name :locale :tenant_id]))

(defn- segment-response [segment]
  (-> (into {} segment)
      (dissoc :id :table_id :dependency_analysis_version)
      (update :creator #(into {} %))
      (update :entity_id some?)
      (update :created_at some?)
      (update :updated_at some?)
      (update :definition map?)))

(defn- mbql4-segment-definition
  "Create a legacy MBQL4 segment definition"
  [table-id field-id value]
  {:source-table table-id
   :filter [:= [:field field-id nil] value]})

(defn- pmbql-segment-definition
  "Create an MBQL5 segment definition"
  [table-id field-id value]
  (let [metadata-provider (lib-be/application-database-metadata-provider (t2/select-one-fn :db_id :model/Table :id table-id))
        table (lib.metadata/table metadata-provider table-id)
        query (lib/query metadata-provider table)
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
                                                               :table_id   (mt/id :users)
                                                               :definition {}}))))))

(deftest create-segment-input-validation-test
  (testing "POST /api/segment"
    (is (=? {:errors {:name "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :post 400 "segment" {})))

    (is (=? {:errors {:table_id "value must be an integer greater than zero."}}
            (mt/user-http-request :crowberto :post 400 "segment" {:name "abc"})))

    (is (=? {:errors {:table_id "value must be an integer greater than zero."}}
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
  (doseq [[format-name definition-fn] {"MBQL4" (partial mbql4-segment-definition (mt/id :users))
                                       "pMBQL" (partial pmbql-segment-definition (mt/id :users))}]
    (testing format-name
      (is (= {:name                    "A Segment"
              :description             "I did it!"
              :show_in_getting_started false
              :caveats                 nil
              :points_of_interest      nil
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
                                        :table_id                (mt/id :users)
                                        :definition              (definition-fn (mt/id :users :id) 20)})
                 segment-response))))))

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
    (mt/with-temp [:model/Segment {:keys [id]} {:table_id (mt/id :users)
                                                :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
      (doseq [[format-name eq-fn] [["MBQL4" (partial mbql4-segment-definition (mt/id :users))]
                                   ["pMBQL" (partial pmbql-segment-definition (mt/id :users))]]]
        (testing format-name
          (is (= {:name                    "Costa Rica"
                  :description             nil
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :creator_id              (mt/user->id :rasta)
                  :creator                 (user-details (mt/fetch-user :rasta))
                  :entity_id               true
                  :created_at              true
                  :updated_at              true
                  :archived                false
                  :definition              true}
                 (-> (mt/user-http-request
                      :crowberto :put 200 (format "segment/%d" id)
                      {:id                      id
                       :name                    "Costa Rica"
                       :description             nil
                       :show_in_getting_started false
                       :caveats                 nil
                       :points_of_interest      nil
                       :table_id                (mt/id :users)
                       :revision_message        "I got me some revisions"
                       :definition              (eq-fn (mt/id :users :name) "cans")})
                     segment-response))))))))

(deftest partial-update-test
  (testing "PUT /api/segment/:id"
    (testing "Can I update a segment's name without specifying `:points_of_interest` and `:show_in_getting_started`?"
      (mt/with-temp [:model/Segment segment {:definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
        ;; just make sure API call doesn't barf
        (is (some? (mt/user-http-request :crowberto :put 200 (str "segment/" (u/the-id segment))
                                         {:name             "Cool name"
                                          :revision_message "WOW HOW COOL"
                                          :definition       {}})))))))

(deftest update-with-full-legacy-query-test
  (testing "PUT /api/segment/:id"
    (testing "Can update a segment with a full legacy MBQL query structure (type, database, query keys)"
      (mt/with-temp [:model/Segment {:keys [id]} {:table_id   (mt/id :orders)
                                                  :definition (mbql4-segment-definition (mt/id :orders) (mt/id :orders :total) 50)}]
        (let [legacy-full-query {:type     "query"
                                 :database (mt/id)
                                 :query    {:source-table (mt/id :orders)
                                            :filter       [">" ["field" (mt/id :orders :total) nil] 100]}}]
          (is (=? {:name       "Updated Segment"
                   :definition {:lib/type "mbql/query"
                                :database (mt/id)
                                :stages   [{:lib/type     "mbql.stage/mbql"
                                            :source-table (mt/id :orders)
                                            :filters      some?}]}}
                  (mt/user-http-request :crowberto :put 200 (format "segment/%d" id)
                                        {:name             "Updated Segment"
                                         :revision_message "Updated with full legacy query"
                                         :definition       legacy-full-query}))
              "The definition should be converted to MBQL5"))))))

(deftest archive-test
  (testing "PUT /api/segment/:id"
    (testing "Can we archive a Segment with the PUT endpoint?"
      (mt/with-temp [:model/Segment {:keys [id]} {:definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "segment/" id)
                                        {:archived true, :revision_message "Archive the Segment"})))
        (is (true?
             (t2/select-one-fn :archived :model/Segment :id id)))))))

(deftest unarchive-test
  (testing "PUT /api/segment/:id"
    (testing "Can we unarchive a Segment with the PUT endpoint?"
      (mt/with-temp [:model/Segment {:keys [id]} {:archived true
                                                  :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "segment/" id)
                                        {:archived false, :revision_message "Unarchive the Segment"})))
        (is (= false
               (t2/select-one-fn :archived :model/Segment :id id)))))))

;; ## DELETE /api/segment/:id

(deftest delete-permissions-test
  (testing "DELETE /api/segment/:id"
    (testing "test security. requires superuser perms"
      (mt/with-temp [:model/Segment {:keys [id]} {:definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
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
    (mt/with-temp [:model/Segment {:keys [id]} {:table_id (mt/id :users)
                                                :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
      (is (= nil
             (mt/user-http-request :crowberto :delete 204 (format "segment/%d" id) :revision_message "carryon")))
      (testing "should still be able to fetch the archived segment"
        (is (=? {:name                    "Toucans in the rainforest"
                 :description             "Lookin' for a blueberry"
                 :show_in_getting_started false
                 :caveats                 nil
                 :points_of_interest      nil
                 :creator_id              (mt/user->id :rasta)
                 :creator                 (user-details (mt/fetch-user :rasta))
                 :created_at              true
                 :updated_at              true
                 :entity_id               true
                 :archived                true
                 :definition true}
                (-> (mt/user-http-request :crowberto :get 200 (format "segment/%d" id))
                    segment-response)))))))

;; ## GET /api/segment/:id

(deftest fetch-segment-permissions-test
  (testing "GET /api/segment/:id"
    (testing "test security. Requires read perms for the Table it references"
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :users)
                                             :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "segment/" (u/the-id segment))))))))))

(deftest fetch-segment-test
  (testing "GET /api/segment/:id"
    (doseq [[format-name definition-fn] {"MBQL4" (partial mbql4-segment-definition (mt/id :users))
                                         "pMBQL" (partial pmbql-segment-definition (mt/id :users))}]
      (testing format-name
        (mt/with-temp [:model/Segment {:keys [id]} {:creator_id (mt/user->id :crowberto)
                                                    :table_id   (mt/id :users)
                                                    :definition (definition-fn (mt/id :users :name) "cans")}]
          (mt/with-full-data-perms-for-all-users!
            (is (= {:name                    "Toucans in the rainforest"
                    :description             "Lookin' for a blueberry"
                    :show_in_getting_started false
                    :caveats                 nil
                    :points_of_interest      nil
                    :creator_id              (mt/user->id :crowberto)
                    :creator                 (user-details (mt/fetch-user :crowberto))
                    :created_at              true
                    :updated_at              true
                    :entity_id               true
                    :archived                false
                    :definition              true}
                   (-> (mt/user-http-request :rasta :get 200 (format "segment/%d" id))
                       segment-response
                       (dissoc :query_description))))))))))

(deftest list-test
  (testing "GET /api/segment/"
    (mt/with-temp [:model/Segment {id-1 :id} {:name       "Segment 1"
                                              :table_id   (mt/id :users)
                                              :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}
                   :model/Segment {id-2 :id} {:name       "Segment 2"
                                              :table_id   (mt/id :venues)
                                              :definition (:query (mt/mbql-query venues
                                                                    {:filter
                                                                     [:and
                                                                      [:= $price 4]
                                                                      [:= $category_id->categories.name "BBQ"]]}))}
                   ;; inactive segments shouldn't show up
                   :model/Segment {id-3 :id} {:archived true
                                              :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
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

(deftest list-permissions-test
  (testing "GET /api/segment/"
    (mt/with-temp [:model/Segment {users-seg-id :id}  {:name       "Users Segment"
                                                       :table_id   (mt/id :users)
                                                       :definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}
                   :model/Segment {venues-seg-id :id} {:name       "Venues Segment"
                                                       :table_id   (mt/id :venues)
                                                       :definition (mbql4-segment-definition (mt/id :venues) (mt/id :venues :name) "bar")}]
      (let [segment-ids #{users-seg-id venues-seg-id}
            returned-segment-ids (fn []
                                   (->> (mt/user-http-request :rasta :get 200 "segment/")
                                        (filter #(segment-ids (:id %)))
                                        (map :id)
                                        set))]
        (testing "user with full data perms sees all segments"
          (mt/with-full-data-perms-for-all-users!
            (is (= segment-ids (returned-segment-ids)))))
        (testing "user with no data perms sees no segments"
          (mt/with-no-data-perms-for-all-users!
            (is (= #{} (returned-segment-ids)))))
        (testing "user with perms to one table sees only that table's segment"
          (mt/with-no-data-perms-for-all-users!
            (let [all-users-group-id (:id (perms/all-users-group))]
              (mt/with-perm-for-group-and-table! all-users-group-id (mt/id :users) :perms/view-data :unrestricted
                (mt/with-perm-for-group-and-table! all-users-group-id (mt/id :users) :perms/create-queries :query-builder
                  (is (= #{users-seg-id} (returned-segment-ids))))))))))))

(deftest related-entities-test
  (testing "GET /api/segment/:id/related"
    (testing "related/recommended entities"
      (mt/with-temp [:model/Segment {segment-id :id} {:definition (mbql4-segment-definition (mt/id :users) (mt/id :users :name) "cans")}]
        (is (= #{:table :metrics :segments :linked-from}
               (-> (mt/user-http-request :crowberto :get 200 (format "segment/%s/related" segment-id))
                   keys
                   set)))))))
