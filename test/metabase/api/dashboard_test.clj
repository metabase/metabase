(ns metabase.api.dashboard-test
  "Tests for /api/dashboard endpoints."
  (:require [expectations :refer :all]
            (metabase [db :as db]
                      [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard retrieve-dashboard-card]]
                             [dashboard-card-series :refer [DashboardCardSeries]]
                             [revision :refer [Revision]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))


;; ## Helper Fns

(defn remove-ids-and-boolean-timestamps [m]
  (let [f (fn [v]
            (cond
              (map? v) (remove-ids-and-boolean-timestamps v)
              (coll? v) (mapv remove-ids-and-boolean-timestamps v)
              :else v))]
    (into {} (for [[k v] m]
               (when-not (or (= :id k)
                             (.endsWith (name k) "_id"))
                 (if (or (= :created_at k)
                         (= :updated_at k))
                   [k (not (nil? v))]
                   [k (f v)]))))))

(defn user-details [user]
  (tu/match-$ user
    {:id           $
     :email        $
     :date_joined  $
     :first_name   $
     :last_name    $
     :last_login   $
     :is_superuser $
     :is_qbnewb    $
     :common_name  $}))

(defn dashcard-response [{:keys [card created_at updated_at] :as dashcard}]
  (-> (into {} dashcard)
      (dissoc :id :dashboard_id :card_id)
      (assoc :created_at (not (nil? created_at))
             :updated_at (not (nil? updated_at))
             :card       (-> (into {} card)
                             (dissoc :id :database_id :table_id :created_at :updated_at)))))

(defn dashboard-response [{:keys [creator ordered_cards created_at updated_at] :as dashboard}]
  (let [dash (-> (into {} dashboard)
                 (dissoc :id)
                 (assoc :created_at (not (nil? created_at))
                        :updated_at (not (nil? updated_at))))]
    (cond-> dash
      creator       (update :creator #(into {} %))
      ordered_cards (update :ordered_cards #(mapv dashcard-response %)))))


;; ## /api/dashboard/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "dashboard"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "dashboard/13"))


;; ## POST /api/dash

;; test validations
(expect {:errors {:name "field is a required param."}}
  ((user->client :rasta) :post 400 "dashboard" {}))

(expect
  {:errors {:parameters "Invalid value 'abc' for 'parameters': value must be an array."}}
  ((user->client :crowberto) :post 400 "dashboard" {:name       "Test"
                                                    :parameters "abc"}))

(expect
  {:name                    "Test Create Dashboard"
   :description             nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :creator_id              (user->id :rasta)
   :parameters              [{:hash "abc123", :name "test", :type "date"}]
   :updated_at              true
   :created_at              true}
  (-> ((user->client :rasta) :post 200 "dashboard" {:name       "Test Create Dashboard"
                                                    :parameters [{:hash "abc123", :name "test", :type "date"}]})
      dashboard-response))


;; ## GET /api/dashboard/:id
(expect
  {:name                    "Test Dashboard"
   :description             nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :creator_id              (user->id :rasta)
   :creator                 (user-details (fetch-user :rasta))
   :updated_at              true
   :created_at              true
   :parameters              []
   :ordered_cards           [{:sizeX                  2
                              :sizeY                  2
                              :col                    0
                              :row                    0
                              :updated_at             true
                              :created_at             true
                              :parameter_mappings     []
                              :visualization_settings {}
                              :card                   {:name                   "Dashboard Test Card"
                                                       :description            nil
                                                       :creator_id             (user->id :rasta)
                                                       :creator                (user-details (fetch-user :rasta))
                                                       :display                "table"
                                                       :query_type             nil
                                                       :dataset_query          {}
                                                       :visualization_settings {}
                                                       :archived               false}
                              :series                 []}]}
  ;; fetch a dashboard WITH a dashboard card on it
  (tu/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                  Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                  DashboardCard [_                  {:dashboard_id dashboard-id, :card_id card-id}]]
    (dashboard-response ((user->client :rasta) :get 200 (format "dashboard/%d" dashboard-id)))))


;; ## PUT /api/dashboard/:id
(expect
  [{:name                    "Test Dashboard"
    :description             nil
    :show_in_getting_started false
    :caveats                 nil
    :points_of_interest      nil
    :creator_id              (user->id :rasta)
    :updated_at              true
    :created_at              true
    :parameters              []}
   {:name                    "My Cool Dashboard"
    :description             "Some awesome description"
    :show_in_getting_started false
    :caveats                 nil
    :points_of_interest      nil
    :creator_id              (user->id :rasta)
    :updated_at              true
    :created_at              true
    :parameters              []}
   {:name                    "My Cool Dashboard"
    :description             "Some awesome description"
    :show_in_getting_started false
    :caveats                 nil
    :points_of_interest      nil
    :creator_id              (user->id :rasta)
    :updated_at              true
    :created_at              true
    :parameters              []}]
  (tu/with-temp Dashboard [{dashboard-id :id} {:name "Test Dashboard"}]
    (mapv dashboard-response [(Dashboard dashboard-id)
                              ((user->client :rasta) :put 200 (str "dashboard/" dashboard-id) {:name         "My Cool Dashboard"
                                                                                               :description  "Some awesome description"
                                                                                               ;; these things should fail to update
                                                                                               :creator_id   (user->id :trashbird)})
                              (Dashboard dashboard-id)])))


;; ## DELETE /api/dashboard/:id
(expect
  [nil nil]
  (tu/with-temp Dashboard [{dashboard-id :id}]
    [((user->client :rasta) :delete 204 (format "dashboard/%d" dashboard-id))
     (Dashboard dashboard-id)]))


;; # DASHBOARD CARD ENDPOINTS

;; ## POST /api/dashboard/:id/cards
;; simple creation with no additional series
(expect
  [{:sizeX                  2
    :sizeY                  2
    :col                    4
    :row                    4
    :series                 []
    :parameter_mappings     [{:card-id 123, :hash "abc", :target "foo"}]
    :visualization_settings {}
    :created_at             true
    :updated_at             true}
   [{:sizeX                  2
     :sizeY                  2
     :col                    4
     :row                    4
     :parameter_mappings     [{:card-id 123, :hash "abc", :target "foo"}]
     :visualization_settings {}}]]
  (tu/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]]
    [(-> ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id) {:cardId                 card-id
                                                                                      :row                    4
                                                                                      :col                    4
                                                                                      :parameter_mappings     [{:card-id 123, :hash "abc", :target "foo"}]
                                                                                      :visualization_settings {}})
         (dissoc :id :dashboard_id :card_id)
         (update :created_at #(not (nil? %)))
         (update :updated_at #(not (nil? %))))
     (map (partial into {})
          (db/select [DashboardCard :sizeX :sizeY :col :row :parameter_mappings :visualization_settings], :dashboard_id dashboard-id))]))

;; new dashboard card w/ additional series
(expect
  [{:sizeX                  2
    :sizeY                  2
    :col                    4
    :row                    4
    :parameter_mappings     []
    :visualization_settings {}
    :series                 [{:name                   "Series Card"
                              :description            nil
                              :display                "table"
                              :dataset_query          {}
                              :visualization_settings {}}]
    :created_at             true
    :updated_at             true}
   [{:sizeX 2
     :sizeY 2
     :col   4
     :row   4}]
   #{0}]
  (tu/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]
                  Card      [{series-id-1 :id} {:name "Series Card"}]]
    (let [dashboard-card ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id) {:cardId card-id
                                                                                                      :row    4
                                                                                                      :col    4
                                                                                                      :series [{:id series-id-1}]})]
      [(remove-ids-and-boolean-timestamps dashboard-card)
       (map (partial into {})
            (db/select [DashboardCard :sizeX :sizeY :col :row], :dashboard_id dashboard-id))
       (db/select-field :position DashboardCardSeries, :dashboardcard_id (:id dashboard-card))])))


;; ## DELETE /api/dashboard/:id/cards
(expect
  [1
   {:success true}
   0]
  ;; fetch a dashboard WITH a dashboard card on it
  (tu/with-temp* [Dashboard           [{dashboard-id :id}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    [(count (db/select-ids DashboardCard, :dashboard_id dashboard-id))
     ((user->client :rasta) :delete 200 (format "dashboard/%d/cards" dashboard-id) :dashcardId dashcard-id)
     (count (db/select-ids DashboardCard, :dashboard_id dashboard-id))]))


;; ## PUT /api/dashboard/:id/cards
(expect
  [[{:sizeX                  2
     :sizeY                  2
     :col                    0
     :row                    0
     :series                 []
     :parameter_mappings     []
     :visualization_settings {}
     :created_at             true
     :updated_at             true}
    {:sizeX                  2
     :sizeY                  2
     :col                    0
     :row                    0
     :parameter_mappings     []
     :visualization_settings {}
     :series                 []
     :created_at             true
     :updated_at             true}]
   {:status "ok"}
   [{:sizeX                  4
     :sizeY                  2
     :col                    0
     :row                    0
     :parameter_mappings     []
     :visualization_settings {}
     :series                 [{:name                   "Series Card"
                               :description            nil
                               :display                :table
                               :dataset_query          {}
                               :visualization_settings {}}]
     :created_at             true
     :updated_at             true}
    {:sizeX                  1
     :sizeY                  1
     :col                    1
     :row                    3
     :parameter_mappings     []
     :visualization_settings {}
     :series                 []
     :created_at             true
     :updated_at             true}]]
  ;; fetch a dashboard WITH a dashboard card on it
  (tu/with-temp* [Dashboard     [{dashboard-id :id}]
                  Card          [{card-id :id}]
                  DashboardCard [{dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCard [{dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  Card          [{series-id-1 :id}   {:name "Series Card"}]]
    [[(remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id-1))
      (remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id-2))]
     ((user->client :rasta) :put 200 (format "dashboard/%d/cards" dashboard-id) {:cards [{:id     dashcard-id-1
                                                                                          :sizeX  4
                                                                                          :sizeY  2
                                                                                          :col    0
                                                                                          :row    0
                                                                                          :series [{:id series-id-1}]}
                                                                                         {:id    dashcard-id-2
                                                                                          :sizeX 1
                                                                                          :sizeY 1
                                                                                          :col   1
                                                                                          :row   3}]})
     [(remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id-1))
      (remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id-2))]]))



;; ## GET /api/dashboard/:id/revisions

(expect
  [{:is_reversion false
    :is_creation  false
    :message      "updated"
    :user         (-> (user-details (fetch-user :crowberto))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         {:before {:name        "b"
                            :description nil
                            :cards       [{:series nil, :sizeY 2, :sizeX 2}]}
                   :after  {:name        "c"
                            :description "something"
                            :cards       [{:series [8 9], :sizeY 3, :sizeX 4}]}}
    :description  "renamed it from \"b\" to \"c\", added a description, rearranged the cards and added some series to card 123."}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         (-> (user-details (fetch-user :rasta))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         nil
    :description  nil}]
  (tu/with-temp* [Dashboard [{dashboard-id :id}]
                  Revision  [_ {:model        "Dashboard"
                                :model_id     dashboard-id
                                :object       {:name         "b"
                                               :description  nil
                                               :cards        [{:sizeX   2
                                                               :sizeY   2
                                                               :row     0
                                                               :col     0
                                                               :card_id 123
                                                               :series  []}]}
                                :is_creation  true}]
                  Revision  [_ {:model    "Dashboard"
                                :model_id dashboard-id
                                :user_id  (user->id :crowberto)
                                :object   {:name         "c"
                                           :description  "something"
                                           :cards        [{:sizeX   4
                                                           :sizeY   3
                                                           :row     0
                                                           :col     0
                                                           :card_id 123
                                                           :series  [8 9]}]}
                                :message  "updated"}]]
    (doall (for [revision ((user->client :crowberto) :get 200 (format "dashboard/%d/revisions" dashboard-id))]
             (dissoc revision :timestamp :id)))))


;; ## POST /api/dashboard/:id/revert

(expect {:errors {:revision_id "field is a required param."}}
  ((user->client :crowberto) :post 400 "dashboard/1/revert" {}))

(expect {:errors {:revision_id "Invalid value 'foobar' for 'revision_id': value must be an integer."}}
  ((user->client :crowberto) :post 400 "dashboard/1/revert" {:revision_id "foobar"}))


(expect
  [ ;; the api response
   {:is_reversion true
    :is_creation  false
    :message      nil
    :user         (-> (user-details (fetch-user :crowberto))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         {:before {:name "b"}
                   :after  {:name "a"}}
    :description  "renamed it from \"b\" to \"a\"."}
   ;; full list of final revisions, first one should be same as the revision returned by the endpoint
   [{:is_reversion true
     :is_creation  false
     :message      nil
     :user         (-> (user-details (fetch-user :crowberto))
                       (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
     :diff         {:before {:name "b"}
                    :after  {:name "a"}}
     :description  "renamed it from \"b\" to \"a\"."}
    {:is_reversion false
     :is_creation  false
     :message      "updated"
     :user         (-> (user-details (fetch-user :crowberto))
                       (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
     :diff         {:before {:name "a"}
                    :after  {:name "b"}}
     :description  "renamed it from \"a\" to \"b\"."}
    {:is_reversion false
     :is_creation  true
     :message      nil
     :user         (-> (user-details (fetch-user :rasta))
                       (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
     :diff         nil
     :description  nil}]]
  (tu/with-temp* [Dashboard [{dashboard-id :id}]
                  Revision  [{revision-id :id} {:model        "Dashboard"
                                                :model_id     dashboard-id
                                                :object       {:name         "a"
                                                               :description  nil
                                                               :cards        []}
                                                :is_creation  true}]
                  Revision  [_                 {:model        "Dashboard"
                                                :model_id     dashboard-id
                                                :user_id      (user->id :crowberto)
                                                :object       {:name         "b"
                                                               :description  nil
                                                               :cards        []}
                                                :message      "updated"}]]
    [(dissoc ((user->client :crowberto) :post 200 (format "dashboard/%d/revert" dashboard-id) {:revision_id revision-id}) :id :timestamp)
     (doall (for [revision ((user->client :crowberto) :get 200 (format "dashboard/%d/revisions" dashboard-id))]
              (dissoc revision :timestamp :id)))]))
