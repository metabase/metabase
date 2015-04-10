(ns metabase.api.dash-test
  "Tests for /api/dash endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.api.card-test :refer [post-card]]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [user :refer [User]])
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name with-temp]]
            [metabase.test-data :refer :all]))

;; # DASHBOARD LIFECYCLE

;; ## Helper Fns
(defn create-dash [dash-name]
  ((user->client :rasta) :post 200 "dash" {:name dash-name
                                           :organization @org-id
                                           :public_perms 0}))

;; ## POST /api/dash
;; Test that we can create a new Dashboard
(let [dash-name (random-name)]
  (expect-eval-actual-first
      (match-$ (sel :one Dashboard :name dash-name)
        {:description nil
         :organization_id 1
         :name dash-name
         :creator_id (user->id :rasta)
         :updated_at $
         :id $
         :public_perms 0
         :created_at $})
    (create-dash dash-name)))

;; ## GET /api/dash/:id
;; Test that we can fetch a Dashboard, and that it comes back wrapped in a "dashboard" dictionary (WHY?!)
(expect-let [dash (create-dash (random-name))]
  {:dashboard
   (match-$ dash
     {:description     nil
      :can_read        true
      :ordered_cards   []
      :creator         (-> (sel :one User :id (user->id :rasta))
                         (select-keys [:email :first_name :last_login :is_superuser :id :last_name :date_joined :common_name]))
      :can_write       true
      :organization_id @org-id
      :name            $
      :organization    (-> @test-org
                         (select-keys [:inherits :report_timezone :logo_url :description :name :slug :id
                                       ]))
      :creator_id      (user->id :rasta)
      :updated_at      $
      :id              $
      :public_perms    0
      :created_at      $})}
  ((user->client :rasta) :get 200 (format "dash/%d" (:id dash))))

;; Check that only the creator of a Dashboard sees it when it isn't public
(expect [true
         false]
  (with-temp Dashboard [{:keys [id]} {:name (random-name)
                                      :public_perms common/perms-none
                                      :organization_id @org-id
                                      :creator_id (user->id :crowberto)}]
    (let [can-see-dash? (fn [user]
                          (contains? (->> ((user->client user) :get 200 "dash" :org @org-id :f :all)
                                          (map :id)
                                          set)
                                     id))]
      [(can-see-dash? :crowberto)
       (can-see-dash? :rasta)])))


;; ## PUT /api/dash/:id
;; Test that we can change a Dashboard
(expect-let [[old-name new-name] (repeatedly 2 random-name)
             {:keys [id]} (create-dash old-name)
             get-dash (fn []
                        (sel :one :fields [Dashboard :name :description :public_perms] :id id))]
  [{:name old-name
    :description nil
    :public_perms 0}
   {:name new-name
    :description "My Cool Dashboard"
    :public_perms 2}
   {:name old-name
    :description "My Cool Dashboard"
    :public_perms 2}]
  [(get-dash)
   (do ((user->client :rasta) :put 200 (format "dash/%d" id) {:description "My Cool Dashboard"
                                                              :public_perms 2
                                                              :name new-name})
       (get-dash))
   ;; See if we can change just the name without affecting other fields
   (do ((user->client :rasta) :put 200 (format "dash/%d" id) {:name old-name})
       (get-dash))])

;; ## DELETE /api/dash/:id
(expect-let [{:keys [id]} (create-dash (random-name))]
  nil
  (do ((user->client :rasta) :delete 204 (format "dash/%d" id))
      (sel :one Dashboard :id id)))


;; # DASHBOARD CARD ENDPOINTS

;; ## POST /api/dash/:id/cards
;; Can we add a Card to a Dashboard?
(let [card-name (random-name)
      dash-name (random-name)]
  (expect-eval-actual-first
      (let [{card-id :id :as card} (sel :one Card :name card-name)
            dash-id (sel :one :id Dashboard :name dash-name)]
        [(match-$ (sel :one DashboardCard :dashboard_id dash-id :card_id card-id)
           {:sizeX 2
            :card (match-$ card
                    {:description nil
                     :creator (-> (sel :one User :id (user->id :rasta))
                                  (select-keys [:date_joined :last_name :id :is_superuser :last_login :first_name :email :common_name]))
                     :organization_id @org-id
                     :name $
                     :creator_id (user->id :rasta)
                     :updated_at $
                     :dataset_query {:database (:id @test-db)
                                     :query {:limit nil
                                             :breakout [nil]
                                             :aggregation ["count"]
                                             :filter [nil nil]
                                             :source_table (table->id :categories)}
                                     :type "query"}
                     :id card-id
                     :display "scalar"
                     :visualization_settings {:global {:title nil}}
                     :public_perms 0
                     :created_at $})
            :updated_at $
            :col nil
            :id $
            :card_id card-id
            :dashboard_id dash-id
            :created_at $
            :sizeY 2
            :row nil})])
    (let [{card-id :id} (post-card card-name)
          {dash-id :id} (create-dash dash-name)]
      ((user->client :rasta) :post 200 (format "dash/%d/cards" dash-id) {:cardId card-id})
      (->> ((user->client :rasta) :get 200 (format "dash/%d" dash-id))
           :dashboard
           :ordered_cards))))

;; ## DELETE /api/dash/:id/cards
(let [card-name (random-name)
      dash-name (random-name)]
  (expect-eval-actual-first
      []
    (let [{card-id :id} (post-card card-name)
          {dash-id :id} (create-dash dash-name)
          {dashcard-id :id} ((user->client :rasta) :post 200 (format "dash/%d/cards" dash-id) {:cardId card-id})]

      ((user->client :rasta) :delete 204 (format "dash/%d/cards" dash-id) :dashcardId dashcard-id)
      (->> ((user->client :rasta) :get 200 (format "dash/%d" dash-id))
           :dashboard
           :ordered_cards))))
