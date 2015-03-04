(ns metabase.api.dash-test
  "Tests for /api/dash endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [dashboard :refer [Dashboard]]
                             [user :refer [User]])
            [metabase.test.util :refer [match-$ expect-eval-actual-first deserialize-dates random-name]]
            [metabase.test-data :refer :all]))

;; # DASHBOARD LIFECYCLE

;; ## Helper Fns
(defn create-dash [dash-name]
  (-> ((user->client :rasta) :post 200 "dash" {:name dash-name
                                               :organization (:id @test-org)
                                               :public_perms 0})
      (deserialize-dates :updated_at :created_at)))

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
     {:description nil
      :can_read true
      :ordered_cards []
      :creator (-> (sel :one User :id (user->id :rasta))
                   (select-keys [:email :first_name :last_login :is_superuser :id :last_name :date_joined :common_name]))
      :can_write true
      :organization_id (:id @test-org)
      :name $
      :organization (-> @test-org
                        (select-keys [:inherits :logo_url :description :name :slug :id]))
      :creator_id (user->id :rasta)
      :updated_at $
      :id $
      :public_perms 0
      :created_at $})}
  (-> ((user->client :rasta) :get 200 (format "dash/%d" (:id dash)))
      (deserialize-dates [:dashboard :created_at]
                         [:dashboard :updated_at]
                         [:dashboard :creator :date_joined]
                         [:dashboard :creator :last_login])))

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

;; ## DELETE /api/dash/:id/cards
