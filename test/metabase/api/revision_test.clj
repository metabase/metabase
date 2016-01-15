(ns metabase.api.revision-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.api.revision :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [revision :refer [push-revision revisions]]
                             [revision-test :refer [with-fake-card]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first with-temp random-name]]))

(def ^:private rasta-revision-info
  (delay {:id (user->id :rasta) :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}))

(defn- get-revisions [entity object-id]
  (->> ((user->client :rasta) :get 200 "revision", :entity entity, :id object-id)
       (mapv #(dissoc % :timestamp :id))))

(defn- create-test-card []
  (let [rand-name (random-name)]
    (db/ins Card
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :display                "table"
      :dataset_query          {:database (id)
                               :type     "query"
                               :query    {:source_table (id :categories)}}
      :visualization_settings {}
      :creator_id             (user->id :rasta))))

(defn- create-card-revision [card is-creation? is-reversion?]
  (push-revision
    :object        card
    :entity        Card
    :id            (:id card)
    :user-id       (user->id :rasta)
    :is-creation?  is-creation?
    :is-reversion? is-reversion?))

(defn- create-test-dashboard []
  (let [rand-name (random-name)]
    (db/ins Dashboard
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :creator_id             (user->id :rasta))))

(defn- create-dashboard-revision [dash is-creation? is-reversion?]
  (push-revision
    :object        (Dashboard (:id dash))
    :entity        Dashboard
    :id            (:id dash)
    :user-id       (user->id :rasta)
    :is-creation?  is-creation?
    :is-reversion? is-reversion?))


;;; # GET /revision

; Things we are testing for:
;  1. ordered by timestamp DESC
;  2. :user is hydrated
;  3. :description is calculated

;; case with no revisions
(expect-let [{:keys [id] :as card} (create-test-card)]
  [{:user {}, :description "First revision."}]
  (get-revisions :card id))

;; case with single creation revision
(expect-let [{:keys [id] :as card} (create-test-card)]
  [{:is_reversion false, :is_creation true, :user @rasta-revision-info, :description "First revision."}]
  (do
    (create-card-revision card true false)
    (get-revisions :card id)))

;; case with multiple revisions, including reversion
(expect-let [{:keys [id name] :as card} (create-test-card)]
  [{:is_reversion true, :is_creation false, :user @rasta-revision-info, :description (format "reverted to an earlier revision and renamed this Card from \"something else\" to \"%s\"." name)}
   {:is_reversion false, :is_creation false, :user @rasta-revision-info, :description (format "renamed this Card from \"%s\" to \"something else\"." name)}
   {:is_reversion false, :is_creation true, :user @rasta-revision-info, :description "First revision."}]
  (do
    (create-card-revision card true false)
    (create-card-revision (assoc card :name "something else") false false)
    (create-card-revision card false true)
    (get-revisions :card id)))

;; dashboard with single revision
(expect-let [{:keys [id] :as dash} (create-test-dashboard)]
  [{:is_reversion false, :is_creation true, :user @rasta-revision-info, :description "First revision."}]
  (do
    (create-dashboard-revision dash true false)
    (get-revisions :dashboard id)))

;; dashboard with card add then delete
(expect-let [{:keys [id] :as dash} (create-test-dashboard)
             card                  (create-test-card)]
  [{:is_reversion false, :is_creation false, :user @rasta-revision-info, :description "removed a card."}
   {:is_reversion false, :is_creation false, :user @rasta-revision-info, :description "added a card."}
   {:is_reversion false, :is_creation true, :user @rasta-revision-info, :description "First revision."}]
  (do
    (create-dashboard-revision dash true false)
    (let [dashcard (db/ins DashboardCard :dashboard_id id :card_id (:id card))]
      (create-dashboard-revision dash false false)
      (db/del DashboardCard :id (:id dashcard)))
    (create-dashboard-revision dash false false)
    (get-revisions :dashboard id)))


;;; # POST /revision/revert

(expect-let [{:keys [id] :as dash} (create-test-dashboard)
             card                  (create-test-card)]
  [{:is_reversion true,  :is_creation false, :user @rasta-revision-info, :description "reverted to an earlier revision and added a card."}
   {:is_reversion false, :is_creation false, :user @rasta-revision-info, :description "removed a card."}
   {:is_reversion false, :is_creation false, :user @rasta-revision-info, :description "added a card."}
   {:is_reversion false, :is_creation true, :user @rasta-revision-info, :description "First revision."}]
  (do
    (create-dashboard-revision dash true false)
    (let [dashcard (db/ins DashboardCard :dashboard_id id :card_id (:id card))]
      (create-dashboard-revision dash false false)
      (db/del DashboardCard :id (:id dashcard)))
    (create-dashboard-revision dash false false)
    (let [[_ {previous-revision-id :id}] (revisions Dashboard id)]
      ;; Revert to the previous revision
      ((user->client :rasta) :post 200 "revision/revert", {:entity :dashboard, :id id, :revision_id previous-revision-id}))
    (get-revisions :dashboard id)))
