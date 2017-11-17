(ns metabase.api.revision-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card serialize-instance]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [revision :refer [push-revision! Revision revisions]]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private rasta-revision-info
  (delay {:id (user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}))

(defn- get-revisions [entity object-id]
  (for [revision ((user->client :rasta) :get 200 "revision", :entity entity, :id object-id)]
    (dissoc revision :timestamp :id)))

(defn- create-card-revision [card is-creation?]
  (push-revision!
    :object       card
    :entity       Card
    :id           (:id card)
    :user-id      (user->id :rasta)
    :is-creation? is-creation?))

(defn- create-dashboard-revision! [dash is-creation?]
  (push-revision!
    :object       (Dashboard (:id dash))
    :entity       Dashboard
    :id           (:id dash)
    :user-id      (user->id :rasta)
    :is-creation? is-creation?))


;;; # GET /revision

; Things we are testing for:
;  1. ordered by timestamp DESC
;  2. :user is hydrated
;  3. :description is calculated

;; case with no revisions (maintains backwards compatibility with old installs before revisions)
(expect
  [{:user {}, :diff nil, :description nil}]
  (tt/with-temp Card [{:keys [id]}]
    (get-revisions :card id)))

;; case with single creation revision
(expect
  [{:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (tt/with-temp Card [{:keys [id] :as card}]
    (create-card-revision card true)
    (get-revisions :card id)))

;; case with multiple revisions, including reversion
(tt/expect-with-temp [Card [{:keys [id name], :as card}]]
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
    (db/insert! Revision
      :model        (:name Card)
      :model_id     id
      :user_id      (user->id :rasta)
      :object       (serialize-instance Card (:id card) card)
      :message      "because i wanted to"
      :is_creation  false
      :is_reversion true)
    (get-revisions :card id)))


;;; # POST /revision/revert

(defn- strip-ids
  [objects]
  (mapv #(dissoc % :id) objects))

(tt/expect-with-temp [Dashboard [{:keys [id] :as dash}]
                      Card      [{card-id :id, :as card}]]
  [{:is_reversion true
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards nil}
                   :after  {:cards [{:sizeX 2, :sizeY 2, :row 0, :col 0, :card_id card-id, :series []}]}}
    :description  "added a card."}
   {:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards [{:sizeX 2, :sizeY 2, :row 0, :col 0, :card_id card-id, :series []}]}
                   :after  {:cards nil}}
    :description "removed a card."}
   {:is_reversion false
    :is_creation  false
    :message      nil
    :user         @rasta-revision-info
    :diff         {:before {:cards nil}
                   :after  {:cards [{:sizeX 2, :sizeY 2, :row 0, :col 0, :card_id card-id, :series []}]}}
    :description "added a card."}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         @rasta-revision-info
    :diff         nil
    :description  nil}]
  (do
    (create-dashboard-revision! dash true)
    (let [dashcard (db/insert! DashboardCard :dashboard_id id :card_id (:id card))]
      (create-dashboard-revision! dash false)
      (db/simple-delete! DashboardCard, :id (:id dashcard)))
    (create-dashboard-revision! dash false)
    (let [[_ {previous-revision-id :id}] (revisions Dashboard id)]
      ;; Revert to the previous revision
      ((user->client :rasta) :post 200 "revision/revert", {:entity :dashboard, :id id, :revision_id previous-revision-id}))
    (->> (get-revisions :dashboard id)
         (mapv (fn [rev]
                 (if-not (:diff rev) rev
                         (if (get-in rev [:diff :before :cards])
                           (update-in rev [:diff :before :cards] strip-ids)
                           (update-in rev [:diff :after :cards] strip-ids))))))))
