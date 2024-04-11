(ns metabase.api.metric-test
  "Tests for /api/legacy-metric endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.http-client :as client]
   [metabase.models :refer [Database Segment Table]]
   [metabase.models.metric :as metric :refer [LegacyMetric]]
   [metabase.server.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
   :entity_id               true
   :definition              nil})

(defn- user-details [user]
  (select-keys
   user
   [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb :common_name :locale]))

(defn- metric-response [{:keys [created_at updated_at], :as metric}]
  (-> (into {} metric)
      (dissoc :id :table_id)
      (update :creator #(into {} %))
      (update :entity_id boolean)
      (assoc :created_at (some? created_at)
             :updated_at (some? updated_at))))

(deftest auth-tests
  (testing "AUTHENTICATION"
    ;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
    ;; authentication test on every single individual endpoint
    (is (= (get req.util/response-unauthentic :body)
           (client/client :get 401 "legacy-metric")))

    (is (= (get req.util/response-unauthentic :body)
           (client/client :put 401 "legacy-metric/13")))))

(deftest create-test
  (testing "POST /api/legacy-metric"
    (testing "test security. Requires superuser perms"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request
              :rasta :post 403 "legacy-metric" {:name       "abc"
                                                :table_id   123
                                                :definition {}}))))

    (testing "test validations"
      (is (=? {:errors {:name "value must be a non-blank string."}}
              (mt/user-http-request
               :crowberto :post 400 "legacy-metric" {})))

      (is (=? {:errors {:table_id "value must be an integer greater than zero."}}
              (mt/user-http-request
               :crowberto :post 400 "legacy-metric" {:name "abc"})))

      (is (=? {:errors {:table_id "value must be an integer greater than zero."}}
              (mt/user-http-request
               :crowberto :post 400 "legacy-metric" {:name     "abc"
                                                     :table_id "foobar"})))

      (is (=? {:errors {:definition "map"}}
              (mt/user-http-request
               :crowberto :post 400 "legacy-metric" {:name     "abc"
                                                     :table_id 123})))

      (is (=? {:errors {:definition "map"}}
              (mt/user-http-request
               :crowberto :post 400 "legacy-metric" {:name       "abc"
                                                     :table_id   123
                                                     :definition "foobar"}))))

    (mt/with-temp [Database {database-id :id} {}
                   Table    {:keys [id]} {:db_id database-id}]
      (is (= (merge metric-defaults
                    {:name        "A Metric"
                     :description "I did it!"
                     :creator_id  (mt/user->id :crowberto)
                     :creator     (user-details (mt/fetch-user :crowberto))
                     :definition  {:database 21
                                   :query    {:filter ["abc"]}}})
             (metric-response (mt/user-http-request
                               :crowberto :post 200 "legacy-metric" {:name                    "A Metric"
                                                                     :description             "I did it!"
                                                                     :show_in_getting_started false
                                                                     :caveats                 nil
                                                                     :points_of_interest      nil
                                                                     :how_is_this_calculated  nil
                                                                     :table_id                id
                                                                     :definition              {:database 21
                                                                                               :query    {:filter ["abc"]}}})))))))

(deftest update-test
  (testing "PUT /api/legacy-metric"
    (testing "test security. Requires superuser perms"
      (t2.with-temp/with-temp [LegacyMetric metric {:table_id (mt/id :checkins)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request
                :rasta :put 403 (str "legacy-metric/" (u/the-id metric))
                {:name             "abc"
                 :definition       {}
                 :revision_message "something different"})))))

    (testing "test validations"
      (is (=? {:errors {:revision_message "value must be a non-blank string."}}
              (mt/user-http-request
               :crowberto :put 400 "legacy-metric/1" {})))

      (is (=? {:errors {:name "nullable value must be a non-blank string."}}
              (mt/user-http-request
               :crowberto :put 400 "legacy-metric/1" {:revision_message "Wow", :name ""})))

      (is (=? {:errors {:revision_message "value must be a non-blank string."}}
              (mt/user-http-request
               :crowberto :put 400 "legacy-metric/1" {:name             "abc"
                                                      :revision_message ""})))

      (is (=? {:errors {:definition "nullable map"}}
              (mt/user-http-request
               :crowberto :put 400 "legacy-metric/1" {:name             "abc"
                                                      :revision_message "123"
                                                      :definition       "foobar"}))))

    (mt/with-temp [Database {database-id :id} {}
                   Table    {table-id :id} {:db_id database-id}
                   LegacyMetric   {:keys [id]} {:table_id table-id}]
      (is (= (merge metric-defaults
                    {:name       "Costa Rica"
                     :creator_id (mt/user->id :rasta)
                     :creator    (user-details (mt/fetch-user :rasta))
                     :definition {:database 2
                                  :query    {:filter ["not" ["=" "field" "the toucans you're looking for"]]}}})
             (metric-response
              (mt/user-http-request
               :crowberto :put 200 (format "legacy-metric/%d" id)
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
    (t2.with-temp/with-temp [LegacyMetric {:keys [id]} {:table_id (mt/id :checkins)}]
      (is (some? (mt/user-http-request
                  :crowberto :put 200 (str "legacy-metric/" id)
                  {:archived true, :revision_message "Archive the Metric"})))
      (is (= true
             (t2/select-one-fn :archived LegacyMetric :id id))))))

(deftest unarchive-test
  (testing "Can we unarchive a Metric with the PUT endpoint?"
    (t2.with-temp/with-temp [LegacyMetric {:keys [id]} {:archived true
                                                        :table_id (mt/id :venues)}]
      (is (some? (mt/user-http-request
                  :crowberto :put 200 (str "legacy-metric/" id)
                  {:archived false, :revision_message "Unarchive the Metric"})))
      (is (= false (t2/select-one-fn :archived LegacyMetric :id id))))))

(deftest delete-test
  (testing "DELETE /api/legacy-metric/:id"
    (testing "test security. Requires superuser perms"
      (t2.with-temp/with-temp [LegacyMetric {:keys [id]} {:table_id (mt/id :checkins)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request
                :rasta :delete 403 (str "legacy-metric/" id) :revision_message "yeeeehaw!")))))

    (testing "test validations"
      (is (= {:errors {:revision_message "value must be a non-blank string."}
              :specific-errors {:revision_message ["should be a string, received: nil" "non-blank string, received: nil"]}}
             (mt/user-http-request
              :crowberto :delete 400 "legacy-metric/1" {:name "abc"})))

      (is (= {:errors {:revision_message "value must be a non-blank string."},
              :specific-errors
              {:revision_message ["should be at least 1 characters, received: \"\"" "non-blank string, received: \"\""]}}
             (mt/user-http-request
              :crowberto :delete 400 "legacy-metric/1" :revision_message ""))))))

(deftest fetch-archived-test
  (testing "should still be able to fetch the archived Metric"
    (mt/with-temp [Database {database-id :id} {}
                   Table    {table-id :id} {:db_id database-id}
                   LegacyMetric   {:keys [id]}   {:table_id table-id}]
      (mt/user-http-request
       :crowberto :delete 204 (format "legacy-metric/%d" id) :revision_message "carryon")
      (is (= (merge
              metric-defaults
              {:name        "Toucans in the rainforest"
               :description "Lookin' for a blueberry"
               :creator_id  (mt/user->id :rasta)
               :creator     (user-details (mt/fetch-user :rasta))
               :archived    true})
             (-> (metric-response
                  (mt/user-http-request
                   :crowberto :get 200 (format "legacy-metric/%d" id)))
                 (dissoc :query_description)))))))

(deftest fetch-metric-test
  (testing "GET /api/legacy-metric/:id"
    (testing "test security. Requires perms for the Table it references"
      (mt/with-temp [Database db {}
                     Table    table  {:db_id (u/the-id db)}
                     LegacyMetric   metric {:table_id (u/the-id table)}]
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "legacy-metric/" (u/the-id metric))))))))

    (mt/with-temp [Database {database-id :id} {}
                   Table    {table-id :id} {:db_id database-id}
                   LegacyMetric   {:keys [id]}   {:creator_id (mt/user->id :crowberto)
                                                  :table_id   table-id}]
      (mt/with-full-data-perms-for-all-users!
        (is (= (merge
                metric-defaults
                {:name        "Toucans in the rainforest"
                 :description "Lookin' for a blueberry"
                 :creator_id  (mt/user->id :crowberto)
                 :creator     (user-details (mt/fetch-user :crowberto))})
               (-> (metric-response (mt/user-http-request :rasta :get 200 (format "legacy-metric/%d" id)))
                   (dissoc :query_description))))))))

(deftest list-metrics-test
  (testing "GET /api/legacy-metric/"
    (t2.with-temp/with-temp [Segment {segment-id :id} {:name       "Segment"
                                                       :table_id   (mt/id :checkins)
                                                       :definition (:query (mt/mbql-query checkins
                                                                             {:filter [:= $id 1]}))}
                             LegacyMetric {id-1 :id} {:name     "Metric A"
                                                      :table_id (mt/id :users)}
                             LegacyMetric {id-2 :id} {:name       "Metric B"
                                                      :definition (:query (mt/mbql-query venues
                                                                            {:aggregation [[:sum $category_id->categories.id]]
                                                                             :filter      [:and
                                                                                           [:= $price 4]
                                                                                           [:segment segment-id]]}))
                                                      :table_id   (mt/id :venues)}
                             ;; inactive metrics shouldn't show up
                             LegacyMetric {id-3 :id} {:archived true
                                                      :table_id (mt/id :venues)}]
      (mt/with-full-data-perms-for-all-users!
        (is (=? [{:name                   "Metric A"
                  :id                     id-1
                  :creator                {}
                  :definition_description nil}
                 {:name                   "Metric B"
                  :id                     id-2
                  :creator                {}
                  :definition_description "Venues, Sum of Category → ID, Filtered by Price is equal to 4 and Segment"}]
                (filter (fn [{metric-id :id}]
                          (contains? #{id-1 id-2 id-3} metric-id))
                        (mt/user-http-request :rasta :get 200 "legacy-metric/"))))))))
