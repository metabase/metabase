(ns metabase.api.revision-test
  (:require [expectations :refer :all]
            [metabase.api.revision :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card serialize-instance]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [revision :refer [Revision push-revision revert revisions]]
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

(defn- create-card-revision [card is-creation?]
  (push-revision
    :object        card
    :entity        Card
    :id            (:id card)
    :user-id       (user->id :rasta)
    :is-creation?  is-creation?))

(defn- create-test-dashboard []
  (let [rand-name (random-name)]
    (db/ins Dashboard
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :creator_id             (user->id :rasta))))

(defn- create-dashboard-revision [dash is-creation?]
  (push-revision
    :object        (Dashboard (:id dash))
    :entity        Dashboard
    :id            (:id dash)
    :user-id       (user->id :rasta)
    :is-creation?  is-creation?))


;;; # GET /revision

; Things we are testing for:
;  1. ordered by timestamp DESC
;  2. :user is hydrated
;  3. :description is calculated

;; case with no revisions (maintains backwards compatibility with old installs before revisions)
(expect-let [{:keys [id] :as card} (create-test-card)]
  [{:user {}, :diff nil, :description nil}]
  (get-revisions :card id))

;; case with single creation revision
(expect-let [{:keys [id] :as card} (create-test-card)]
  [{:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (do
    (create-card-revision card true)
    (get-revisions :card id)))

;; case with multiple revisions, including reversion
(expect-let [{:keys [id name] :as card} (create-test-card)]
  [{:is_reversion true
    :is_creation  false
    :message      "because i wanted to"
    :user         @rasta-revision-info
    :diff         {:before {:name "something else"}
                   :after  {:name name}}
    :description  (format "renamed this Card from \"something else\" to \"%s\"." name)}
   {:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:name name}
                   :after  {:name "something else"}}
    :description  (format "renamed this Card from \"%s\" to \"something else\"." name)}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (do
    (create-card-revision card true)
    (create-card-revision (assoc card :name "something else") false)
    (db/ins Revision
      :model        (:name Card)
      :model_id     id
      :user_id      (user->id :rasta)
      :object       (serialize-instance Card (:id card) card)
      :message      "because i wanted to"
      :is_creation  false
      :is_reversion true)
    (get-revisions :card id)))

;; dashboard with single revision
(expect-let [{:keys [id] :as dash} (create-test-dashboard)]
  [{:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (do
    (create-dashboard-revision dash true)
    (get-revisions :dashboard id)))

(defn- strip-ids
  [objects]
  (mapv #(dissoc % :id) objects))

;; dashboard with card add then delete
(expect-let [{:keys [id] :as dash}   (create-test-dashboard)
             {card-id :id, :as card} (create-test-card)]
  [{:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards [{:sizeX 2, :sizeY 2, :row nil, :col nil, :card_id card-id}]},
                   :after  {:cards nil}}
    :description  "removed a card."}
   {:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards nil},
                   :after  {:cards [{:sizeX 2, :sizeY 2, :row nil, :col nil, :card_id card-id}]}}
    :description  "added a card."}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (do
    (create-dashboard-revision dash true)
    (let [dashcard (db/ins DashboardCard :dashboard_id id :card_id (:id card))]
      (create-dashboard-revision dash false)
      (db/del DashboardCard :id (:id dashcard)))
    (create-dashboard-revision dash false)
    (->> (get-revisions :dashboard id)
         (mapv (fn [rev]
                 (if-not (:diff rev) rev
                                     (if (get-in rev [:diff :before :cards])
                                       (update-in rev [:diff :before :cards] strip-ids)
                                       (update-in rev [:diff :after :cards] strip-ids))))))))


;;; # POST /revision/revert

(expect-let [{:keys [id] :as dash}   (create-test-dashboard)
             {card-id :id, :as card} (create-test-card)]
  [{:is_reversion true
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards nil}
                   :after  {:cards [{:sizeX 2, :sizeY 2, :row nil, :col nil, :card_id card-id}]}}
    :description  "added a card."}
   {:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards [{:sizeX 2, :sizeY 2, :row nil, :col nil, :card_id card-id}]}
                   :after  {:cards nil}}
    :description "removed a card."}
   {:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards nil}
                   :after  {:cards [{:sizeX 2, :sizeY 2, :row nil, :col nil, :card_id card-id}]}}
    :description "added a card."}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (do
    (create-dashboard-revision dash true)
    (let [dashcard (db/ins DashboardCard :dashboard_id id :card_id (:id card))]
      (create-dashboard-revision dash false)
      (db/del DashboardCard :id (:id dashcard)))
    (create-dashboard-revision dash false)
    (let [[_ {previous-revision-id :id}] (revisions Dashboard id)]
      ;; Revert to the previous revision
      ((user->client :rasta) :post 200 "revision/revert", {:entity :dashboard, :id id, :revision_id previous-revision-id}))
    (->> (get-revisions :dashboard id)
         (mapv (fn [rev]
                 (if-not (:diff rev) rev
                                     (if (get-in rev [:diff :before :cards])
                                       (update-in rev [:diff :before :cards] strip-ids)
                                       (update-in rev [:diff :after :cards] strip-ids))))))))
