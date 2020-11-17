(ns metabase.api.metric-test
  "Tests for /api/metric endpoints."
  (:require [expectations :refer [expect]]
            [metabase
             [http-client :as http]
             [util :as u]]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [database :refer [Database]]
             [metric :as metric :refer [Metric]]
             [permissions :as perms]
             [permissions-group :as group]
             [revision :refer [Revision]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer [fetch-user user->client user->id]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

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


;; ## /api/metric/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware.u/response-unauthentic :body) (http/client :get 401 "metric"))
(expect (get middleware.u/response-unauthentic :body) (http/client :put 401 "metric/13"))


;; ## POST /api/metric

;; test security.  requires superuser perms
(expect "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "metric" {:name       "abc"
                                             :table_id   123
                                             :definition {}}))

;; test validations
(expect {:errors {:name "value must be a non-blank string."}}
  ((user->client :crowberto) :post 400 "metric" {}))

(expect {:errors {:table_id "value must be an integer greater than zero."}}
  ((user->client :crowberto) :post 400 "metric" {:name "abc"}))

(expect {:errors {:table_id "value must be an integer greater than zero."}}
  ((user->client :crowberto) :post 400 "metric" {:name     "abc"
                                                 :table_id "foobar"}))

(expect {:errors {:definition "value must be a map."}}
  ((user->client :crowberto) :post 400 "metric" {:name     "abc"
                                                 :table_id 123}))

(expect {:errors {:definition "value must be a map."}}
  ((user->client :crowberto) :post 400 "metric" {:name       "abc"
                                                 :table_id   123
                                                 :definition "foobar"}))

(expect
  (merge metric-defaults
         {:name        "A Metric"
          :description "I did it!"
          :creator_id  (user->id :crowberto)
          :creator     (user-details (fetch-user :crowberto))
          :definition  {:database 21
                        :query    {:filter ["abc"]}}})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]]
    (metric-response ((user->client :crowberto) :post 200 "metric" {:name                    "A Metric"
                                                                    :description             "I did it!"
                                                                    :show_in_getting_started false
                                                                    :caveats                 nil
                                                                    :points_of_interest      nil
                                                                    :how_is_this_calculated  nil
                                                                    :table_id                id
                                                                    :definition              {:database 21
                                                                                              :query    {:filter ["abc"]}}}))))


;; ## PUT /api/metric

;; test security.  requires superuser perms
(expect
  "You don't have permissions to do that."
  (tt/with-temp Metric [metric]
    ((user->client :rasta) :put 403 (str "metric/" (u/get-id metric))
     {:name             "abc"
      :definition       {}
      :revision_message "something different"})))

;; test validations
(expect
  {:errors {:revision_message "value must be a non-blank string."}}
  ((user->client :crowberto) :put 400 "metric/1" {}))

(expect
  {:errors {:name "value may be nil, or if non-nil, value must be a non-blank string."}}
  ((user->client :crowberto) :put 400 "metric/1" {:revision_message "Wow", :name ""}))

(expect
  {:errors {:revision_message "value must be a non-blank string."}}
  ((user->client :crowberto) :put 400 "metric/1" {:name             "abc"
                                                  :revision_message ""}))

(expect
  {:errors {:definition "value may be nil, or if non-nil, value must be a map."}}
  ((user->client :crowberto) :put 400 "metric/1" {:name             "abc"
                                                  :revision_message "123"
                                                  :definition       "foobar"}))

(expect
  (merge metric-defaults
         {:name       "Costa Rica"
          :creator_id (user->id :rasta)
          :creator    (user-details (fetch-user :rasta))
          :definition {:database 2
                       :query    {:filter ["not" ["=" "field" "the toucans you're looking for"]]}}})
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [{:keys [id]} {:table_id table-id}]]
    (metric-response
     ((user->client :crowberto) :put 200 (format "metric/%d" id)
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
                                 :query    {:filter ["not" ["=" "field" "the toucans you're looking for"]]}}}))))

;; Can we archive a Metric with the PUT endpoint?

(expect
  true
  (tt/with-temp Metric [{:keys [id]}]
    ((user->client :crowberto) :put 200 (str "metric/" id)
     {:archived true, :revision_message "Archive the Metric"})
    (db/select-one-field :archived Metric :id id)))

;; Can we unarchive a Metric with the PUT endpoint?
(expect
  false
  (tt/with-temp Metric [{:keys [id]} {:archived true}]
    ((user->client :crowberto) :put 200 (str "metric/" id)
     {:archived false, :revision_message "Unarchive the Metric"})
    (db/select-one-field :archived Metric :id id)))


;; ## DELETE /api/metric/:id

;; test security.  requires superuser perms
(expect
  "You don't have permissions to do that."
  (tt/with-temp Metric [{:keys [id]}]
    ((user->client :rasta) :delete 403 (str "metric/" id) :revision_message "yeeeehaw!")))


;; test validations
(expect {:errors {:revision_message "value must be a non-blank string."}}
  ((user->client :crowberto) :delete 400 "metric/1" {:name "abc"}))

(expect {:errors {:revision_message "value must be a non-blank string."}}
  ((user->client :crowberto) :delete 400 "metric/1" :revision_message ""))

(expect
  (merge
   metric-defaults
   {:name        "Toucans in the rainforest"
    :description "Lookin' for a blueberry"
    :creator_id  (user->id :rasta)
    :creator     (user-details (fetch-user :rasta))
    :archived    true})
  (-> (tt/with-temp* [Database [{database-id :id}]
                      Table    [{table-id :id} {:db_id database-id}]
                      Metric   [{:keys [id]}   {:table_id table-id}]]
        ((user->client :crowberto) :delete 204 (format "metric/%d" id) :revision_message "carryon")
        ;; should still be able to fetch the archived Metric
        (metric-response
         ((user->client :crowberto) :get 200 (format "metric/%d" id))))
      (dissoc :query_description)))


;; ## GET /api/metric/:id

;; test security. Requires perms for the Table it references
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Database [db]
                  Table    [table  {:db_id (u/get-id db)}]
                  Metric   [metric {:table_id (u/get-id table)}]]
    (perms/revoke-permissions! (group/all-users) db)
    ((user->client :rasta) :get 403 (str "metric/" (u/get-id metric)))))


(expect
  (merge
   metric-defaults
   {:name        "Toucans in the rainforest"
    :description "Lookin' for a blueberry"
    :creator_id  (user->id :crowberto)
    :creator     (user-details (fetch-user :crowberto))})
  (-> (tt/with-temp* [Database [{database-id :id}]
                      Table    [{table-id :id} {:db_id database-id}]
                      Metric   [{:keys [id]}   {:creator_id  (user->id :crowberto)
                                                :table_id    table-id}]]
        (metric-response ((user->client :rasta) :get 200 (format "metric/%d" id))))
      (dissoc :query_description)))


;; ## GET /api/metric/:id/revisions

;; test security. Requires read perms for Table it references
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Database [db]
                  Table    [table  {:db_id (u/get-id db)}]
                  Metric   [metric {:table_id (u/get-id table)}]]
    (perms/revoke-permissions! (group/all-users) db)
    ((user->client :rasta) :get 403 (format "metric/%d/revisions" (u/get-id metric)))))


(expect
  [{:is_reversion false
    :is_creation  false
    :message      "updated"
    :user         (-> (user-details (fetch-user :crowberto))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         {:name {:before "b" :after "c"}}
    :description  "renamed this Metric from \"b\" to \"c\"."}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         (-> (user-details (fetch-user :rasta))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         {:name       {:after "b"}
                   :definition {:after {:filter [">" ["field-id" 1] 25]}}}
    :description  nil}]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [{:keys [id]}   {:creator_id              (user->id :crowberto)
                                            :table_id                table-id
                                            :name                    "One Metric to rule them all, one metric to define them"
                                            :description             "One metric to bring them all, and in the DataModel bind them"
                                            :show_in_getting_started false
                                            :caveats                 nil
                                            :points_of_interest      nil
                                            :how_is_this_calculated  nil
                                            :definition              {:database 123
                                                                      :query    {:filter [:= [:field-id 10] 20]}}}]
                  Revision [_              {:model       "Metric"
                                            :model_id    id
                                            :object      {:name "b"
                                                          :definition {:filter [:and [:> 1 25]]}}
                                            :is_creation true}]
                  Revision [_              {:model    "Metric"
                                            :model_id id
                                            :user_id  (user->id :crowberto)
                                            :object   {:name "c"
                                                       :definition {:filter [:and [:> 1 25]]}}
                                            :message  "updated"}]]
    (vec
     (for [revision ((user->client :rasta) :get 200 (format "metric/%d/revisions" id))]
       (dissoc revision :timestamp :id)))))


;; ## POST /api/metric/:id/revert

;; test security.  requires superuser perms
(expect
  "You don't have permissions to do that."
  (tt/with-temp Metric [{:keys [id]}]
    ((user->client :rasta) :post 403 (format "metric/%d/revert" id)
     {:revision_id 56})))


(expect {:errors {:revision_id "value must be an integer greater than zero."}}
  ((user->client :crowberto) :post 400 "metric/1/revert" {}))

(expect {:errors {:revision_id "value must be an integer greater than zero."}}
  ((user->client :crowberto) :post 400 "metric/1/revert" {:revision_id "foobar"}))


(expect
  [ ;; the api response
   {:is_reversion true
    :is_creation  false
    :message      nil
    :user         (dissoc (user-details (fetch-user :crowberto)) :email :date_joined :last_login :is_superuser :is_qbnewb)
    :diff         {:name {:before "Changed Metric Name"
                          :after  "One Metric to rule them all, one metric to define them"}}
    :description  "renamed this Metric from \"Changed Metric Name\" to \"One Metric to rule them all, one metric to define them\"."}
   ;; full list of final revisions, first one should be same as the revision returned by the endpoint
   [{:is_reversion true
     :is_creation  false
     :message      nil
     :user         (dissoc (user-details (fetch-user :crowberto)) :email :date_joined :last_login :is_superuser :is_qbnewb)
     :diff         {:name {:before "Changed Metric Name"
                           :after  "One Metric to rule them all, one metric to define them"}}
     :description  "renamed this Metric from \"Changed Metric Name\" to \"One Metric to rule them all, one metric to define them\"."}
    {:is_reversion false
     :is_creation  false
     :message      "updated"
     :user         (dissoc (user-details (fetch-user :crowberto)) :email :date_joined :last_login :is_superuser :is_qbnewb)
     :diff         {:name {:after  "Changed Metric Name"
                           :before "One Metric to rule them all, one metric to define them"}}
     :description  "renamed this Metric from \"One Metric to rule them all, one metric to define them\" to \"Changed Metric Name\"."}
    {:is_reversion false
     :is_creation  true
     :message      nil
     :user         (dissoc (user-details (fetch-user :rasta)) :email :date_joined :last_login :is_superuser :is_qbnewb)
     :diff         {:name        {:after "One Metric to rule them all, one metric to define them"}
                    :description {:after "One metric to bring them all, and in the DataModel bind them"}
                    :definition  {:after {:database 123
                                          :query    {:filter ["=" ["field-id" 10] 20]}}}}
     :description  nil}]]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Metric   [{:keys [id]}      {:creator_id              (user->id :crowberto)
                                               :table_id                table-id
                                               :name                    "One Metric to rule them all, one metric to define them"
                                               :description             "One metric to bring them all, and in the DataModel bind them"
                                               :show_in_getting_started false
                                               :caveats                 nil
                                               :points_of_interest      nil
                                               :how_is_this_calculated  nil
                                               :definition              {:creator_id              (user->id :crowberto)
                                                                         :table_id                table-id
                                                                         :name                    "Reverted Metric Name"
                                                                         :description             nil
                                                                         :show_in_getting_started false
                                                                         :caveats                 nil
                                                                         :points_of_interest      nil
                                                                         :how_is_this_calculated  nil
                                                                         :definition              {:database 123
                                                                                                   :query    {:filter [:= [:field-id 10] 20]}}}}]
                  Revision [{revision-id :id} {:model       "Metric"
                                               :model_id    id
                                               :object      {:creator_id              (user->id :crowberto)
                                                             :table_id                table-id
                                                             :name                    "One Metric to rule them all, one metric to define them"
                                                             :description             "One metric to bring them all, and in the DataModel bind them"
                                                             :show_in_getting_started false
                                                             :caveats                 nil
                                                             :points_of_interest      nil
                                                             :how_is_this_calculated  nil
                                                             :definition              {:database 123
                                                                                       :query    {:filter [:= [:field-id 10] 20]}}}
                                               :is_creation true}]
                  Revision [_                 {:model    "Metric"
                                               :model_id id
                                               :user_id  (user->id :crowberto)
                                               :object   {:creator_id              (user->id :crowberto)
                                                          :table_id                table-id
                                                          :name                    "Changed Metric Name"
                                                          :description             "One metric to bring them all, and in the DataModel bind them"
                                                          :show_in_getting_started false
                                                          :caveats                 nil
                                                          :points_of_interest      nil
                                                          :how_is_this_calculated  nil
                                                          :definition              {:database 123
                                                                                    :query    {:filter [:= [:field-id 10] 20]}}}
                                               :message  "updated"}]]
    [(dissoc ((user->client :crowberto) :post 200 (format "metric/%d/revert" id) {:revision_id revision-id}) :id :timestamp)
     (doall (for [revision ((user->client :crowberto) :get 200 (format "metric/%d/revisions" id))]
              (dissoc revision :timestamp :id)))]))


;;; GET /api/metric/

(tt/expect-with-temp [Metric [metric-1 {:name "Metric A"}]
                      Metric [metric-2 {:name "Metric B"}]
                      Metric [_        {:archived true}]] ; inactive metrics shouldn't show up
  (tu/mappify (hydrate [(assoc metric-1 :database_id (data/id))
                        (assoc metric-2 :database_id (data/id))]
                       :creator))
  (map #(dissoc % :query_description) ((user->client :rasta) :get 200 "metric/")))

(expect
  []
  ((user->client :rasta) :get 200 "metric/"))

;; Test related/recommended entities
(expect
  #{:table :metrics :segments}
  (tt/with-temp* [Metric [{metric-id :id}]]
    (-> ((user->client :crowberto) :get 200 (format "metric/%s/related" metric-id)) keys set)))
