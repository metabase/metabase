(ns metabase.api.dashboard-test
  "Tests for /api/dashboard endpoints."
  (:require [expectations :refer :all]
            [metabase.api.card-test :refer [post-card]]
            [metabase.db :as db]
            [metabase.driver.query-processor.expand :as ql]
            [metabase.http-client :as http]
            [metabase.middleware :as middleware]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard retrieve-dashboard-card]]
                             [dashboard-card-series :refer [DashboardCardSeries]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [korma.core :as k]))


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
              {:id $
               :email $
               :date_joined $
               :first_name $
               :last_name $
               :last_login $
               :is_superuser $
               :common_name $}))

(defn dashcard-response [{:keys [card created_at updated_at] :as dashcard}]
  (-> (into {} dashcard)
      (dissoc :id :dashboard_id :card_id)
      (assoc :created_at (not (nil? created_at)))
      (assoc :updated_at (not (nil? updated_at)))
      (assoc :card (-> (into {} card)
                       (dissoc :id :database_id :table_id :created_at :updated_at)))))

(defn dashboard-response [{:keys [creator ordered_cards created_at updated_at] :as dashboard}]
  (let [dash (-> (into {} dashboard)
                 (dissoc :id)
                 (assoc :created_at (not (nil? created_at)))
                 (assoc :updated_at (not (nil? updated_at))))]
    (cond-> dash
            creator (update :creator #(into {} %))
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
  {:name            "Test Create Dashboard"
   :description     nil
   :creator_id      (user->id :rasta)
   :public_perms    0
   :updated_at      true
   :created_at      true
   :organization_id nil}
  (-> ((user->client :rasta) :post 200 "dashboard" {:name         "Test Create Dashboard"
                                                    :public_perms 0})
      dashboard-response))


;; ## GET /api/dashboard/:id
; <<<<<<< HEAD
; (expect
;   {:name            "Test Dashboard"
;    :description     nil
;    :creator_id      (user->id :rasta)
;    :creator         (user-details (fetch-user :rasta))
;    :public_perms    0
;    :can_read        true
;    :can_write       true
;    :updated_at      true
;    :created_at      true
;    :ordered_cards   [{:sizeX        2
;                       :sizeY        2
;                       :col          nil
;                       :row          nil
;                       :updated_at   true
;                       :created_at   true
;                       :card         {:name                   "Dashboard Test Card"
;                                      :description            nil
;                                      :public_perms           0
;                                      :creator_id             (user->id :rasta)
;                                      :creator                (user-details (fetch-user :rasta))
;                                      :organization_id        nil
;                                      :display                "scalar"
;                                      :query_type             nil
;                                      :dataset_query          {:something "simple"}
;                                      :visualization_settings {:global {:title nil}}}
;                       :series       []}]
;    :organization_id nil}
;   ;; fetch a dashboard WITH a dashboard card on it
;   (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
;                                                :public_perms 0
;                                                :creator_id   (user->id :rasta)}]
;     (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
;                                        :creator_id             (user->id :rasta)
;                                        :public_perms           0
;                                        :display                "scalar"
;                                        :dataset_query          {:something "simple"}
;                                        :visualization_settings {:global {:title nil}}}]
;       (tu/with-temp DashboardCard [_ {:dashboard_id dashboard-id
;                                       :card_id      card-id}]
;         (-> ((user->client :rasta) :get 200 (format "dashboard/%d" dashboard-id))
;             dashboard-response)))))
; =======
; ;; Test that we can fetch a Dashboard, and that it comes back wrapped in a "dashboard" dictionary (WHY?!)
; (expect-let [dash (create-dash (random-name))]
;   {:dashboard
;    (match-$ dash
;      {:description     nil
;       :can_read        true
;       :ordered_cards   []
;       :creator         (-> (User (user->id :rasta))
;                            (select-keys [:email :first_name :last_login :is_superuser :is_qbnewb :id :last_name :date_joined :common_name]))
;       :can_write       true
;       :organization_id nil
;       :name            $
;       :creator_id      (user->id :rasta)
;       :updated_at      $
;       :id              $
;       :public_perms    0
;       :created_at      $})}
;   ((user->client :rasta) :get 200 (format "dashboard/%d" (:id dash))))
;
; ;; Check that only the creator of a Dashboard sees it when it isn't public
; (expect [true
;          false]
;   (with-temp Dashboard [{:keys [id]} {:name (random-name)
;                                       :public_perms common/perms-none
;                                       :creator_id (user->id :crowberto)}]
;     (let [can-see-dash? (fn [user]
;                           (contains? (->> ((user->client user) :get 200 "dashboard" :f :all)
;                                           (map :id)
;                                           set)
;                                      id))]
;       [(can-see-dash? :crowberto)
;        (can-see-dash? :rasta)])))
; >>>>>>> e4277aea02fa2f1e4d5e6d2d42546a4c277cefcf


;; ## PUT /api/dashboard/:id
(expect
  [{:name            "Test Dashboard"
    :description     nil
    :creator_id      (user->id :rasta)
    :public_perms    0
    :updated_at      true
    :created_at      true
    :organization_id nil}
   {:name            "My Cool Dashboard"
    :description     "Some awesome description"
    :actor_id        (user->id :rasta)
    :creator_id      (user->id :rasta)
    :public_perms    0
    :updated_at      true
    :created_at      true
    :organization_id nil}
   {:name            "My Cool Dashboard"
    :description     "Some awesome description"
    :creator_id      (user->id :rasta)
    :public_perms    0
    :updated_at      true
    :created_at      true
    :organization_id nil}]
  (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
                                               :public_perms 0
                                               :creator_id   (user->id :rasta)}]
    (->> [(Dashboard dashboard-id)
          ((user->client :rasta) :put 200 (format "dashboard/%d" dashboard-id) {:name         "My Cool Dashboard"
                                                                                :description  "Some awesome description"
                                                                                ;; these things should fail to update
                                                                                :public_perms 2
                                                                                :creator_id   (user->id :trashbird)})
          (Dashboard dashboard-id)]
         (mapv dashboard-response))))


;; ## DELETE /api/dashboard/:id
(expect
  [nil nil]
  (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
                                               :public_perms 0
                                               :creator_id   (user->id :rasta)}]
    [((user->client :rasta) :delete 204 (format "dashboard/%d" dashboard-id))
     (Dashboard dashboard-id)]))


;; # DASHBOARD CARD ENDPOINTS

;; ## POST /api/dashboard/:id/cards
; <<<<<<< HEAD
; ;; simple creation with no additional series
; (expect
;   [{:sizeX        2
;     :sizeY        2
;     :col          4
;     :row          4
;     :series       []
;     :created_at   true
;     :updated_at   true}
;    [{:sizeX        2
;      :sizeY        2
;      :col          4
;      :row          4}]]
;   (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
;                                                :public_perms 0
;                                                :creator_id   (user->id :rasta)}]
;     (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
;                                        :creator_id             (user->id :rasta)
;                                        :public_perms           0
;                                        :display                "scalar"
;                                        :dataset_query          {:something "simple"}
;                                        :visualization_settings {:global {:title nil}}}]
;       [(-> ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id) {:cardId card-id
;                                                                                         :row    4
;                                                                                         :col    4})
;            (dissoc :id :dashboard_id :card_id)
;            (update :created_at #(not (nil? %)))
;            (update :updated_at #(not (nil? %))))
;        (db/sel :many :fields [DashboardCard :sizeX :sizeY :col :row] :dashboard_id dashboard-id)])))
;
; ;; new dashboard card w/ additional series
; (expect
;   [{:sizeX        2
;     :sizeY        2
;     :col          4
;     :row          4
;     :series       [{:name                   "Series Card"
;                     :description            nil
;                     :display                "scalar"
;                     :dataset_query          {:something "simple"}
;                     :visualization_settings {}}]
;     :created_at   true
;     :updated_at   true}
;    [{:sizeX        2
;      :sizeY        2
;      :col          4
;      :row          4}]
;    [0]]
;   (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
;                                                :public_perms 0
;                                                :creator_id   (user->id :rasta)}]
;     (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
;                                        :creator_id             (user->id :rasta)
;                                        :public_perms           0
;                                        :display                "scalar"
;                                        :dataset_query          {:something "simple"}
;                                        :visualization_settings {}}]
;       (tu/with-temp Card [{series-id1 :id} {:name                   "Series Card"
;                                             :creator_id             (user->id :rasta)
;                                             :public_perms           0
;                                             :display                "scalar"
;                                             :dataset_query          {:something "simple"}
;                                             :visualization_settings {}}]
;         (let [dashboard-card ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id) {:cardId card-id
;                                                                                                           :row    4
;                                                                                                           :col    4
;                                                                                                           :series [{:id series-id1}]})]
;           [(remove-ids-and-boolean-timestamps dashboard-card)
;            (db/sel :many :fields [DashboardCard :sizeX :sizeY :col :row] :dashboard_id dashboard-id)
;            (db/sel :many :field [DashboardCardSeries :position] :dashboardcard_id (:id dashboard-card))])))))
;
; =======
; ;; Can we add a Card to a Dashboard?
; (let [card-name (random-name)
;       dash-name (random-name)]
;   (expect-eval-actual-first
;       (let [{card-id :id :as card} (sel :one Card :name card-name)
;             dash-id (sel :one :id Dashboard :name dash-name)]
;         [(match-$ (sel :one DashboardCard :dashboard_id dash-id :card_id card-id)
;            {:sizeX        2
;             :card         (match-$ card
;                             {:description            nil
;                              :creator                (-> (User (user->id :rasta))
;                                                          (select-keys [:date_joined :last_name :id :is_superuser :is_qbnewb :last_login :first_name :email :common_name]))
;                              :organization_id        nil
;                              :name                   $
;                              :creator_id             (user->id :rasta)
;                              :updated_at             $
;                              :dataset_query          (obj->json->obj (ql/wrap-inner-query
;                                                                        (query categories
;                                                                          (ql/aggregation (ql/count)))))
;                              :id                     card-id
;                              :display                "scalar"
;                              :visualization_settings {:global {:title nil}}
;                              :public_perms           0
;                              :created_at             $
;                              :database_id            (id)
;                              :table_id               (id :categories)
;                              :query_type             "query"})
;             :updated_at   $
;             :col          nil
;             :id           $
;             :card_id      card-id
;             :dashboard_id dash-id
;             :created_at   $
;             :sizeY        2
;             :row          nil})])
;       (let [{card-id :id} (post-card card-name)
;             {dash-id :id} (create-dash dash-name)]
;         ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dash-id) {:cardId card-id})
;         (->> ((user->client :rasta) :get 200 (format "dashboard/%d" dash-id))
;              :dashboard
;              :ordered_cards))))
; >>>>>>> e4277aea02fa2f1e4d5e6d2d42546a4c277cefcf

;; ## DELETE /api/dashboard/:id/cards
(expect
  [1
   nil
   0]
  ;; fetch a dashboard WITH a dashboard card on it
  (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
                                               :public_perms 0
                                               :creator_id   (user->id :rasta)}]
    (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
                                       :creator_id             (user->id :rasta)
                                       :public_perms           0
                                       :display                "scalar"
                                       :dataset_query          {:something "simple"}
                                       :visualization_settings {:global {:title nil}}}]
      (tu/with-temp DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                      :card_id      card-id}]
        [(count (db/sel :many :field [DashboardCard :id] :dashboard_id dashboard-id))
         ((user->client :rasta) :delete 204 (format "dashboard/%d/cards" dashboard-id) :dashcardId dashcard-id)
         (count (db/sel :many :field [DashboardCard :id] :dashboard_id dashboard-id))]))))


;; ## PUT /api/dashboard/:id/cards
(expect
  [[{:sizeX        2
     :sizeY        2
     :col          nil
     :row          nil
     :series       []
     :created_at   true
     :updated_at   true}
    {:sizeX        2
     :sizeY        2
     :col          nil
     :row          nil
     :series       []
     :created_at   true
     :updated_at   true}]
   {:status "ok"}
   [{:sizeX        4
     :sizeY        2
     :col          0
     :row          0
     :series       [{:name                   "Series Card"
                     :description            nil
                     :display                :scalar
                     :dataset_query          {:something "simple"}
                     :visualization_settings {}}]
     :created_at   true
     :updated_at   true}
    {:sizeX        1
     :sizeY        1
     :col          1
     :row          3
     :series       []
     :created_at   true
     :updated_at   true}]]
  ;; fetch a dashboard WITH a dashboard card on it
  (tu/with-temp Dashboard [{dashboard-id :id} {:name         "Test Dashboard"
                                               :public_perms 0
                                               :creator_id   (user->id :rasta)}]
    (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
                                       :creator_id             (user->id :rasta)
                                       :public_perms           0
                                       :display                "scalar"
                                       :dataset_query          {:something "simple"}
                                       :visualization_settings {:global {:title nil}}}]
      (tu/with-temp DashboardCard [{dashcard-id1 :id} {:dashboard_id dashboard-id
                                                       :card_id      card-id}]
        (tu/with-temp DashboardCard [{dashcard-id2 :id} {:dashboard_id dashboard-id
                                                         :card_id      card-id}]
          (tu/with-temp Card [{series-id1 :id} {:name                   "Series Card"
                                                :creator_id             (user->id :rasta)
                                                :public_perms           0
                                                :display                "scalar"
                                                :dataset_query          {:something "simple"}
                                                :visualization_settings {}}]
            [[(remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id1))
              (remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id2))]
             ((user->client :rasta) :put 200 (format "dashboard/%d/cards" dashboard-id) {:cards [{:id    dashcard-id1
                                                                                                  :sizeX 4
                                                                                                  :sizeY 2
                                                                                                  :col   0
                                                                                                  :row   0
                                                                                                  :series [{:id series-id1}]}
                                                                                                 {:id    dashcard-id2
                                                                                                  :sizeX 1
                                                                                                  :sizeY 1
                                                                                                  :col   1
                                                                                                  :row   3}]})
             [(remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id1))
              (remove-ids-and-boolean-timestamps (retrieve-dashboard-card dashcard-id2))]]))))))
