(ns metabase.api.metric-test
  "Tests for /api/metric endpoints."
  (:require [clojure.test :refer :all]
            [metabase.http-client :as http]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :as metric :refer [Metric]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.models.revision :refer [Revision]]
            [metabase.models.table :refer [Table]]
            [metabase.server.middleware.util :as middleware.u]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

;; ## Helper Fns

(def ^:private metric-defaults
  {:description             nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :how_is_this_calculated  nil
   :created_at              true
   :updated_at              true
   :archived                false
   :definition              nil})

(defn- user-details [user]
  (select-keys
   user
   [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb :common_name :locale]))

(defn- metric-response [{:keys [created_at updated_at], :as metric}]
  (-> (into {} metric)
      (dissoc :id :table_id)
      (update :creator #(into {} %))
      (assoc :created_at (some? created_at)
             :updated_at (some? updated_at))))

(deftest auth-tests
  (testing "AUTHENTICATION"
    ;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
    ;; authentication test on every single individual endpoint
    (is (= (get middleware.u/response-unauthentic :body)
           (http/client :get 401 "metric")))

    (is (= (get middleware.u/response-unauthentic :body)
           (http/client :put 401 "metric/13")))))

(deftest create-test
  (testing "POST /api/metric"
    (testing "test security. Requires superuser perms"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request
              :rasta :post 403 "metric" {:name       "abc"
                                         :table_id   123
                                         :definition {}}))))

    (testing "test validations"
      (is (= {:errors {:name "value must be a non-blank string."}}
             (mt/user-http-request
              :crowberto :post 400 "metric" {})))

      (is (= {:errors {:table_id "value must be an integer greater than zero."}}
             (mt/user-http-request
              :crowberto :post 400 "metric" {:name "abc"})))

      (is (= {:errors {:table_id "value must be an integer greater than zero."}}
             (mt/user-http-request
              :crowberto :post 400 "metric" {:name     "abc"
                                             :table_id "foobar"})))

      (is (= {:errors {:definition "value must be a map."}}
             (mt/user-http-request
              :crowberto :post 400 "metric" {:name     "abc"
                                             :table_id 123})))

      (is (= {:errors {:definition "value must be a map."}}
             (mt/user-http-request
              :crowberto :post 400 "metric" {:name       "abc"
                                             :table_id   123
                                             :definition "foobar"}))))

    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{:keys [id]} {:db_id database-id}]]
      (is (= (merge metric-defaults
                    {:name        "A Metric"
                     :description "I did it!"
                     :creator_id  (mt/user->id :crowberto)
                     :creator     (user-details (mt/fetch-user :crowberto))
                     :definition  {:database 21
                                   :query    {:filter ["abc"]}}})
             (metric-response (mt/user-http-request
                               :crowberto :post 200 "metric" {:name                    "A Metric"
                                                              :description             "I did it!"
                                                              :show_in_getting_started false
                                                              :caveats                 nil
                                                              :points_of_interest      nil
                                                              :how_is_this_calculated  nil
                                                              :table_id                id
                                                              :definition              {:database 21
                                                                                        :query    {:filter ["abc"]}}})))))))

(deftest update-test
  (testing "PUT /api/metric"
    (testing "test security. Requires superuser perms"
      (mt/with-temp Metric [metric]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request
                :rasta :put 403 (str "metric/" (u/the-id metric))
                {:name             "abc"
                 :definition       {}
                 :revision_message "something different"})))))

    (testing "test validations"
      (is (= {:errors {:revision_message "value must be a non-blank string."}}
             (mt/user-http-request
              :crowberto :put 400 "metric/1" {})))

      (is (= {:errors {:name "value may be nil, or if non-nil, value must be a non-blank string."}}
             (mt/user-http-request
              :crowberto :put 400 "metric/1" {:revision_message "Wow", :name ""})))

      (is (= {:errors {:revision_message "value must be a non-blank string."}}
             (mt/user-http-request
              :crowberto :put 400 "metric/1" {:name             "abc"
                                              :revision_message ""})))

      (is (= {:errors {:definition "value may be nil, or if non-nil, value must be a map."}}
             (mt/user-http-request
              :crowberto :put 400 "metric/1" {:name             "abc"
                                              :revision_message "123"
                                              :definition       "foobar"}))))

    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [{:keys [id]} {:table_id table-id}]]
      (is (= (merge metric-defaults
                    {:name       "Costa Rica"
                     :creator_id (mt/user->id :rasta)
                     :creator    (user-details (mt/fetch-user :rasta))
                     :definition {:database 2
                                  :query    {:filter ["not" ["=" "field" "the toucans you're looking for"]]}}})
             (metric-response
              (mt/user-http-request
               :crowberto :put 200 (format "metric/%d" id)
               {:id                      id
                :name                    "Costa Rica"
                :description             nil
                :show_in_getting_started false
                :caveats                 nil
                :points_of_interest      nil
                :how_is_this_calculated  nil
                :table_id                456
                :revision_message        "I got me some revisions"
                :definition              {:database 2
                                          :query    {:filter ["not" ["=" "field" "the toucans you're looking for"]]}}})))))))

(deftest archive-test
  (testing "Can we archive a Metric with the PUT endpoint?"
    (mt/with-temp Metric [{:keys [id]}]
      (is (some? (mt/user-http-request
                  :crowberto :put 200 (str "metric/" id)
                  {:archived true, :revision_message "Archive the Metric"})))
      (is (= true
             (db/select-one-field :archived Metric :id id))))))

(deftest unarchive-test
  (testing "Can we unarchive a Metric with the PUT endpoint?"
    (mt/with-temp Metric [{:keys [id]} {:archived true}]
      (is (some? (mt/user-http-request
                  :crowberto :put 200 (str "metric/" id)
                  {:archived false, :revision_message "Unarchive the Metric"})))
      (is (= false (db/select-one-field :archived Metric :id id))))))

(deftest delete-test
  (testing "DELETE /api/metric/:id"
    (testing "test security. Requires superuser perms"
      (mt/with-temp Metric [{:keys [id]}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request
                :rasta :delete 403 (str "metric/" id) :revision_message "yeeeehaw!")))))


    (testing "test validations"
      (is (= {:errors {:revision_message "value must be a non-blank string."}}
             (mt/user-http-request
              :crowberto :delete 400 "metric/1" {:name "abc"})))

      (is (= {:errors {:revision_message "value must be a non-blank string."}}
             (mt/user-http-request
              :crowberto :delete 400 "metric/1" :revision_message ""))))))

(deftest fetch-archived-test
  (testing "should still be able to fetch the archived Metric"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [{:keys [id]}   {:table_id table-id}]]
      (mt/user-http-request
       :crowberto :delete 204 (format "metric/%d" id) :revision_message "carryon")
      (is (= (merge
              metric-defaults
              {:name        "Toucans in the rainforest"
               :description "Lookin' for a blueberry"
               :creator_id  (mt/user->id :rasta)
               :creator     (user-details (mt/fetch-user :rasta))
               :archived    true})
             (-> (metric-response
                  (mt/user-http-request
                   :crowberto :get 200 (format "metric/%d" id)))
                 (dissoc :query_description)))))))

(deftest fetch-metric-test
  (testing "GET /api/metric/:id"
    (testing "test security. Requires perms for the Table it references"
      (mt/with-temp* [Database [db]
                      Table    [table  {:db_id (u/the-id db)}]
                      Metric   [metric {:table_id (u/the-id table)}]]
        (perms/revoke-permissions! (group/all-users) db)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (str "metric/" (u/the-id metric)))))))

    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [{:keys [id]}   {:creator_id (mt/user->id :crowberto)
                                              :table_id   table-id}]]
      (is (= (merge
              metric-defaults
              {:name        "Toucans in the rainforest"
               :description "Lookin' for a blueberry"
               :creator_id  (mt/user->id :crowberto)
               :creator     (user-details (mt/fetch-user :crowberto))})
             (-> (metric-response (mt/user-http-request :rasta :get 200 (format "metric/%d" id)))
                 (dissoc :query_description)))))))

(deftest metric-revisions-test
  (testing "GET /api/metric/:id/revisions"
    (testing "test security. Requires read perms for Table it references"
      (mt/with-temp* [Database [db]
                      Table    [table  {:db_id (u/the-id db)}]
                      Metric   [metric {:table_id (u/the-id table)}]]
        (perms/revoke-permissions! (group/all-users) db)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "metric/%d/revisions" (u/the-id metric)))))))

    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [{:keys [id]}   {:creator_id              (mt/user->id :crowberto)
                                              :table_id                table-id
                                              :name                    "One Metric to rule them all, one metric to define them"
                                              :description             "One metric to bring them all, and in the DataModel bind them"
                                              :show_in_getting_started false
                                              :caveats                 nil
                                              :points_of_interest      nil
                                              :how_is_this_calculated  nil
                                              :definition              {:database 123
                                                                        :query    {:filter [:= [:field 10 nil] 20]}}}]
                    Revision [_              {:model       "Metric"
                                              :model_id    id
                                              :object      {:name       "b"
                                                            :definition {:filter [:and [:> 1 25]]}}
                                              :is_creation true}]
                    Revision [_              {:model    "Metric"
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
               :description  "renamed this Metric from \"b\" to \"c\"."}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         (-> (user-details (mt/fetch-user :rasta))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:name       {:after "b"}
                              :definition {:after {:filter [">" ["field" 1 nil] 25]}}}
               :description  nil}]
             (for [revision (mt/user-http-request :rasta :get 200 (format "metric/%d/revisions" id))]
               (dissoc revision :timestamp :id)))))))

(deftest revert-metric-test
  (testing "POST /api/metric/:id/revert"
    (testing "test security. Requires superuser perms"
      (mt/with-temp Metric [{:keys [id]}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request
                :rasta :post 403 (format "metric/%d/revert" id)
                {:revision_id 56})))))

    (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
           (mt/user-http-request :crowberto :post 400 "metric/1/revert" {})))

    (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
           (mt/user-http-request :crowberto :post 400 "metric/1/revert" {:revision_id "foobar"})))))

(deftest metric-revisions-test-2
  (mt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{:keys [id]}      {:creator_id              (mt/user->id :crowberto)
                                               :table_id                table-id
                                               :name                    "One Metric to rule them all, one metric to define them"
                                               :description             "One metric to bring them all, and in the DataModel bind them"
                                               :show_in_getting_started false
                                               :caveats                 nil
                                               :points_of_interest      nil
                                               :how_is_this_calculated  nil
                                               :definition              {:creator_id              (mt/user->id :crowberto)
                                                                         :table_id                table-id
                                                                         :name                    "Reverted Metric Name"
                                                                         :description             nil
                                                                         :show_in_getting_started false
                                                                         :caveats                 nil
                                                                         :points_of_interest      nil
                                                                         :how_is_this_calculated  nil
                                                                         :definition              {:database 123
                                                                                                   :query    {:filter [:= [:field 10 nil] 20]}}}}]
                  Revision [{revision-id :id} {:model       "Metric"
                                               :model_id    id
                                               :object      {:creator_id              (mt/user->id :crowberto)
                                                             :table_id                table-id
                                                             :name                    "One Metric to rule them all, one metric to define them"
                                                             :description             "One metric to bring them all, and in the DataModel bind them"
                                                             :show_in_getting_started false
                                                             :caveats                 nil
                                                             :points_of_interest      nil
                                                             :how_is_this_calculated  nil
                                                             :definition              {:database 123
                                                                                       :query    {:filter [:= [:field 10 nil] 20]}}}
                                               :is_creation true}]
                  Revision [_                 {:model    "Metric"
                                               :model_id id
                                               :user_id  (mt/user->id :crowberto)
                                               :object   {:creator_id              (mt/user->id :crowberto)
                                                          :table_id                table-id
                                                          :name                    "Changed Metric Name"
                                                          :description             "One metric to bring them all, and in the DataModel bind them"
                                                          :show_in_getting_started false
                                                          :caveats                 nil
                                                          :points_of_interest      nil
                                                          :how_is_this_calculated  nil
                                                          :definition              {:database 123
                                                                                    :query    {:filter [:= [:field 10 nil] 20]}}}
                                               :message  "updated"}]]
    (testing "API response"
      (is (= {:is_reversion true
              :is_creation  false
              :message      nil
              :user         (dissoc (user-details (mt/fetch-user :crowberto)) :email :date_joined :last_login :is_superuser :is_qbnewb)
              :diff         {:name {:before "Changed Metric Name"
                                    :after  "One Metric to rule them all, one metric to define them"}}
              :description  "renamed this Metric from \"Changed Metric Name\" to \"One Metric to rule them all, one metric to define them\"."}
             (dissoc (mt/user-http-request
                      :crowberto :post 200 (format "metric/%d/revert" id) {:revision_id revision-id}) :id :timestamp))))
    (testing "full list of final revisions, first one should be same as the revision returned by the endpoint"
      (is (= [{:is_reversion true
               :is_creation  false
               :message      nil
               :user         (dissoc (user-details (mt/fetch-user :crowberto)) :email :date_joined :last_login :is_superuser :is_qbnewb)
               :diff         {:name {:before "Changed Metric Name"
                                     :after  "One Metric to rule them all, one metric to define them"}}
               :description  "renamed this Metric from \"Changed Metric Name\" to \"One Metric to rule them all, one metric to define them\"."}
              {:is_reversion false
               :is_creation  false
               :message      "updated"
               :user         (dissoc (user-details (mt/fetch-user :crowberto)) :email :date_joined :last_login :is_superuser :is_qbnewb)
               :diff         {:name {:after  "Changed Metric Name"
                                     :before "One Metric to rule them all, one metric to define them"}}
               :description  "renamed this Metric from \"One Metric to rule them all, one metric to define them\" to \"Changed Metric Name\"."}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         (dissoc (user-details (mt/fetch-user :rasta)) :email :date_joined :last_login :is_superuser :is_qbnewb)
               :diff         {:name        {:after "One Metric to rule them all, one metric to define them"}
                              :description {:after "One metric to bring them all, and in the DataModel bind them"}
                              :definition  {:after {:database 123
                                                    :query    {:filter ["=" ["field" 10 nil] 20]}}}}
               :description  nil}]
             (for [revision (mt/user-http-request
                             :crowberto :get 200 (format "metric/%d/revisions" id))]
               (dissoc revision :timestamp :id)))))))

(deftest list-metrics-test
  (testing "GET /api/metric/"
    (mt/with-temp* [Metric [metric-1 {:name "Metric A"}]
                    Metric [metric-2 {:name "Metric B"}]
                    ;; inactive metrics shouldn't show up
                    Metric [_        {:archived true}]]
      (is (= (mt/derecordize (hydrate [(assoc metric-1 :database_id (data/id))
                                       (assoc metric-2 :database_id (data/id))]
                                      :creator))
             (map #(dissoc % :query_description) (mt/user-http-request
                                                  :rasta :get 200 "metric/"))))))

  (is (= []
         (mt/user-http-request :rasta :get 200 "metric/"))))

(deftest metric-related-entities-test
  (testing "Test related/recommended entities"
    (mt/with-temp Metric [{metric-id :id}]
      (is (= #{:table :metrics :segments}
             (-> (mt/user-http-request :crowberto :get 200 (format "metric/%s/related" metric-id)) keys set))))))
