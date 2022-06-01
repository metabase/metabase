(ns metabase.api.segment-test
  "Tests for /api/segment endpoints."
  (:require [clojure.test :refer :all]
            [metabase.http-client :as client]
            [metabase.models.database :refer [Database]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.revision :refer [Revision]]
            [metabase.models.segment :as segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.server.middleware.util :as mw.util]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

;; ## Helper Fns

(defn- user-details [user]
  (select-keys
   user
   [:email :first_name :last_login :is_qbnewb :is_superuser :id :last_name :date_joined :common_name :locale]))

(defn- segment-response [segment]
  (-> (into {} segment)
      (dissoc :id :table_id)
      (update :creator #(into {} %))
      (update :created_at some?)
      (update :updated_at some?)))

;; ## /api/segment/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest authentication-test
  (is (= (get mw.util/response-unauthentic :body)
         (client/client :get 401 "segment")))

  (is (= (get mw.util/response-unauthentic :body)
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
    (is (= {:errors {:name "value must be a non-blank string."}}
           (mt/user-http-request :crowberto :post 400 "segment" {})))

    (is (= {:errors {:table_id "value must be an integer greater than zero."}}
           (mt/user-http-request :crowberto :post 400 "segment" {:name "abc"})))

    (is (= {:errors {:table_id "value must be an integer greater than zero."}}
           (mt/user-http-request :crowberto :post 400 "segment" {:name     "abc"
                                                                 :table_id "foobar"})))

    (is (= {:errors {:definition "value must be a map."}}
           (mt/user-http-request :crowberto :post 400 "segment" {:name     "abc"
                                                                 :table_id 123})))

    (is (= {:errors {:definition "value must be a map."}}
           (mt/user-http-request :crowberto :post 400 "segment" {:name       "abc"
                                                                 :table_id   123
                                                                 :definition "foobar"})))))

(deftest create-segment-test
  (mt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]]
    (is (= {:name                    "A Segment"
            :description             "I did it!"
            :show_in_getting_started false
            :caveats                 nil
            :points_of_interest      nil
            :creator_id              (mt/user->id :crowberto)
            :creator                 (user-details (mt/fetch-user :crowberto))
            :entity_id               nil
            :created_at              true
            :updated_at              true
            :archived                false
            :definition              {:filter ["=" ["field" 10 nil] 20]}}
           (segment-response (mt/user-http-request :crowberto :post 200 "segment"
                                                   {:name                    "A Segment"
                                                    :description             "I did it!"
                                                    :show_in_getting_started false
                                                    :caveats                 nil
                                                    :points_of_interest      nil
                                                    :table_id                id
                                                    :definition              {:filter [:= [:field-id 10] 20]}}))))))


;; ## PUT /api/segment

(deftest update-permissions-test
  (testing "PUT /api/segment/:id"
    (testing "test security. requires superuser perms"
      (mt/with-temp Segment [segment]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "segment/" (:id segment))
                                     {:name             "abc"
                                      :definition       {}
                                      :revision_message "something different"})))))))

(deftest update-input-validation-test
  (testing "PUT /api/segment/:id"
    (is (= {:errors {:name "value may be nil, or if non-nil, value must be a non-blank string."}}
           (mt/user-http-request :crowberto :put 400 "segment/1" {:name ""})))

    (is (= {:errors {:revision_message "value must be a non-blank string."}}
           (mt/user-http-request :crowberto :put 400 "segment/1" {:name "abc"})))

    (is (= {:errors {:revision_message "value must be a non-blank string."}}
           (mt/user-http-request :crowberto :put 400 "segment/1" {:name             "abc"
                                                                  :revision_message ""})))

    (is (= {:errors {:definition "value may be nil, or if non-nil, value must be a map."}}
           (mt/user-http-request :crowberto :put 400 "segment/1" {:name             "abc"
                                                                  :revision_message "123"
                                                                  :definition       "foobar"})))))

(deftest update-test
  (testing "PUT /api/segment/:id"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Segment  [{:keys [id]}   {:table_id table-id}]]
      (is (= {:name                    "Costa Rica"
              :description             nil
              :show_in_getting_started false
              :caveats                 nil
              :points_of_interest      nil
              :creator_id              (mt/user->id :rasta)
              :creator                 (user-details (mt/fetch-user :rasta))
              :entity_id               nil
              :created_at              true
              :updated_at              true
              :archived                false
              :definition              {:filter ["!=" ["field" 2 nil] "cans"]}}
             (segment-response
              (mt/user-http-request
               :crowberto :put 200 (format "segment/%d" id)
               {:id                      id
                :name                    "Costa Rica"
                :description             nil
                :show_in_getting_started false
                :caveats                 nil
                :points_of_interest      nil
                :table_id                456
                :revision_message        "I got me some revisions"
                :definition              {:filter [:!= [:field-id 2] "cans"]}})))))))

(deftest partial-update-test
  (testing "PUT /api/segment/:id"
    (testing "Can I update a segment's name without specifying `:points_of_interest` and `:show_in_getting_started`?"
      (mt/with-temp Segment [segment]
        ;; just make sure API call doesn't barf
        (is (some? (mt/user-http-request :crowberto :put 200 (str "segment/" (u/the-id segment))
                                         {:name             "Cool name"
                                          :revision_message "WOW HOW COOL"
                                          :definition       {}})))))))

(deftest archive-test
  (testing "PUT /api/segment/:id"
    (testing "Can we archive a Segment with the PUT endpoint?"
      (mt/with-temp Segment [{:keys [id]}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "segment/" id)
                                        {:archived true, :revision_message "Archive the Segment"})))
        (is (= true
               (db/select-one-field :archived Segment :id id)))))))

(deftest unarchive-test
  (testing "PUT /api/segment/:id"
    (testing "Can we unarchive a Segment with the PUT endpoint?"
      (mt/with-temp Segment [{:keys [id]} {:archived true}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "segment/" id)
                                        {:archived false, :revision_message "Unarchive the Segment"})))
        (is (= false
               (db/select-one-field :archived Segment :id id)))))))


;; ## DELETE /api/segment/:id

(deftest delete-permissions-test
  (testing "DELETE /api/segment/:id"
    (testing "test security. requires superuser perms"
      (mt/with-temp Segment [{:keys [id]}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (str "segment/" id)
                                     :revision_message "yeeeehaw!")))))))

(deftest delete-input-validation-test
  (testing "DELETE /api/segment/:id"
    (is (= {:errors {:revision_message "value must be a non-blank string."}}
           (mt/user-http-request :crowberto :delete 400 "segment/1" {:name "abc"})))

    (is (= {:errors {:revision_message "value must be a non-blank string."}}
           (mt/user-http-request :crowberto :delete 400 "segment/1" :revision_message "")))))

(deftest delete-test
  (testing "DELETE /api/segment/:id"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Segment  [{:keys [id]} {:table_id table-id}]]
      (is (= nil
             (mt/user-http-request :crowberto :delete 204 (format "segment/%d" id) :revision_message "carryon")))
      (testing "should still be able to fetch the archived segment"
        (is (= {:name                    "Toucans in the rainforest"
                :description             "Lookin' for a blueberry"
                :show_in_getting_started false
                :caveats                 nil
                :points_of_interest      nil
                :creator_id              (mt/user->id :rasta)
                :creator                 (user-details (mt/fetch-user :rasta))
                :created_at              true
                :updated_at              true
                :entity_id               nil
                :archived                true
                :definition              nil}
               (-> (mt/user-http-request :crowberto :get 200 (format "segment/%d" id))
                   segment-response
                   (dissoc :query_description))))))))


;; ## GET /api/segment/:id

(deftest fetch-segment-permissions-test
  (testing "GET /api/segment/:id"
    (testing "test security. Requires read perms for the Table it references"
      (mt/with-temp* [Database [db]
                      Table    [table   {:db_id (u/the-id db)}]
                      Segment  [segment {:table_id (u/the-id table)}]]
        (perms/revoke-data-perms! (perms-group/all-users) db)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (str "segment/" (u/the-id segment)))))))))

(deftest fetch-segment-test
  (testing "GET /api/segment/:id"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Segment  [{:keys [id]}   {:creator_id (mt/user->id :crowberto)
                                              :table_id   table-id
                                              :definition {:filter [:= [:field-id 2] "cans"]}}]]
      (is (= {:name                    "Toucans in the rainforest"
              :description             "Lookin' for a blueberry"
              :show_in_getting_started false
              :caveats                 nil
              :points_of_interest      nil
              :creator_id              (mt/user->id :crowberto)
              :creator                 (user-details (mt/fetch-user :crowberto))
              :created_at              true
              :updated_at              true
              :entity_id               nil
              :archived                false
              :definition              {:filter ["=" ["field" 2 nil] "cans"]}}
             (-> (mt/user-http-request :rasta :get 200 (format "segment/%d" id))
                 segment-response
                 (dissoc :query_description)))))))


;; ## GET /api/segment/:id/revisions

(deftest revisions-permissions-test
  (testing "GET /api/segment/:id/revisions"
    (testing "test security. Requires read perms for the Table it references"
      (mt/with-temp* [Database [db]
                      Table    [table   {:db_id (u/the-id db)}]
                      Segment  [segment {:table_id (u/the-id table)}]]
        (perms/revoke-data-perms! (perms-group/all-users) db)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "segment/%d/revisions" (u/the-id segment)))))))))


(deftest revisions-test
  (testing "GET /api/segment/:id/revisions"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Segment  [{:keys [id]} {:creator_id (mt/user->id :crowberto)
                                            :table_id   table-id
                                            :definition {:database 123
                                                         :query    {:filter [:= [:field-id 2] "cans"]}}}]
                    Revision [_ {:model       "Segment"
                                 :model_id    id
                                 :object      {:name       "b"
                                               :definition {:filter [:and [:> 1 25]]}}
                                 :is_creation true}]
                    Revision [_ {:model    "Segment"
                                 :model_id id
                                 :user_id  (mt/user->id :crowberto)
                                 :object   {:name       "c"
                                            :definition {:filter [:and [:> 1 25]]}}
                                 :message  "updated"}]]
      (is (= [{:is_reversion false
               :is_creation  false
               :message      "updated"
               :user         (-> (user-details (mt/fetch-user :crowberto))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:name {:before "b" :after "c"}}
               :description  "renamed this Segment from \"b\" to \"c\"."}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         (-> (user-details (mt/fetch-user :rasta))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:name       {:after "b"}
                              :definition {:after {:filter [">" ["field" 1 nil] 25]}}}
               :description  nil}]
             (for [revision (mt/user-http-request :rasta :get 200 (format "segment/%d/revisions" id))]
               (dissoc revision :timestamp :id)))))))


;; ## POST /api/segment/:id/revert

(deftest revert-permissions-test
  (testing "POST /api/segment/:id/revert"
    (testing "test security.  requires superuser perms"
      (mt/with-temp Segment [{:keys [id]}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (format "segment/%d/revert" id) {:revision_id 56})))))))

(deftest revert-input-validation-test
  (testing "POST /api/segment/:id/revert"
    (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
           (mt/user-http-request :crowberto :post 400 "segment/1/revert" {})))

    (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
           (mt/user-http-request :crowberto :post 400 "segment/1/revert" {:revision_id "foobar"})))))

(deftest revert-test
  (testing "POST /api/segment/:id/revert"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]
                    Segment  [{:keys [id]}      {:creator_id              (mt/user->id :crowberto)
                                                 :table_id                table-id
                                                 :name                    "One Segment to rule them all, one segment to define them"
                                                 :description             "One segment to bring them all, and in the DataModel bind them"
                                                 :show_in_getting_started false
                                                 :caveats                 nil
                                                 :points_of_interest      nil
                                                 :definition              {:filter [:= [:field-id 2] "cans"]}}]
                    Revision [{revision-id :id} {:model       "Segment"
                                                 :model_id    id
                                                 :object      {:creator_id              (mt/user->id :crowberto)
                                                               :table_id                table-id
                                                               :name                    "One Segment to rule them all, one segment to define them"
                                                               :description             "One segment to bring them all, and in the DataModel bind them"
                                                               :show_in_getting_started false
                                                               :caveats                 nil
                                                               :points_of_interest      nil
                                                               :definition              {:filter [:= [:field-id 2] "cans"]}}
                                                 :is_creation true}]
                    Revision [_                 {:model    "Segment"
                                                 :model_id id
                                                 :user_id  (mt/user->id :crowberto)
                                                 :object   {:creator_id              (mt/user->id :crowberto)
                                                            :table_id                table-id
                                                            :name                    "Changed Segment Name"
                                                            :description             "One segment to bring them all, and in the DataModel bind them"
                                                            :show_in_getting_started false
                                                            :caveats                 nil
                                                            :points_of_interest      nil
                                                            :definition              {:filter [:= [:field-id 2] "cans"]}}
                                                 :message  "updated"}]]
      (testing "the api response"
        (is (= {:is_reversion true
                :is_creation  false
                :message      nil
                :user         (-> (user-details (mt/fetch-user :crowberto))
                                  (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
                :diff         {:name {:before "Changed Segment Name"
                                      :after  "One Segment to rule them all, one segment to define them"}}
                :description  "renamed this Segment from \"Changed Segment Name\" to \"One Segment to rule them all, one segment to define them\"."}
               (-> (mt/user-http-request :crowberto :post 200 (format "segment/%d/revert" id) {:revision_id revision-id})
                   (dissoc :id :timestamp)))))

      (testing "full list of final revisions, first one should be same as the revision returned by the endpoint"
        (is (= [{:is_reversion true
                 :is_creation  false
                 :message      nil
                 :user         (-> (user-details (mt/fetch-user :crowberto))
                                   (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
                 :diff         {:name {:before "Changed Segment Name"
                                       :after  "One Segment to rule them all, one segment to define them"}}
                 :description  "renamed this Segment from \"Changed Segment Name\" to \"One Segment to rule them all, one segment to define them\"."}
                {:is_reversion false
                 :is_creation  false
                 :message      "updated"
                 :user         (-> (user-details (mt/fetch-user :crowberto))
                                   (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
                 :diff         {:name {:after  "Changed Segment Name"
                                       :before "One Segment to rule them all, one segment to define them"}}
                 :description  "renamed this Segment from \"One Segment to rule them all, one segment to define them\" to \"Changed Segment Name\"."}
                {:is_reversion false
                 :is_creation  true
                 :message      nil
                 :user         (-> (user-details (mt/fetch-user :rasta))
                                   (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
                 :diff         {:name        {:after "One Segment to rule them all, one segment to define them"}
                                :description {:after "One segment to bring them all, and in the DataModel bind them"}
                                :definition  {:after {:filter ["=" ["field" 2 nil] "cans"]}}}
                 :description  nil}]
               (for [revision (mt/user-http-request :crowberto :get 200 (format "segment/%d/revisions" id))]
                 (dissoc revision :timestamp :id))))))))


;;; GET /api/segement/

(deftest list-test
  (testing "GET /api/segement/"
    (mt/with-temp* [Segment [segment-1 {:name "Segment 1"}]
                    Segment [segment-2 {:name "Segment 2"}]
                    ;; inactive segments shouldn't show up
                    Segment [_         {:archived true}]]
      (is (= (mt/derecordize (hydrate [segment-1
                                       segment-2] :creator))
             (map #(dissoc % :query_description) (mt/user-http-request :rasta :get 200 "segment/")))))

    (is (= []
           (mt/user-http-request :rasta :get 200 "segment/")))))

(deftest related-entities-test
  (testing "GET /api/segment/:id/related"
    (testing "related/recommended entities"
      (mt/with-temp Segment [{segment-id :id}]
        (is (= #{:table :metrics :segments :linked-from}
               (-> (mt/user-http-request :crowberto :get 200 (format "segment/%s/related" segment-id))
                   keys
                   set)))))))
