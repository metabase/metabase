(ns metabase.api.revision-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card serialize-instance]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.revision :refer [push-revision! Revision revisions]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(def ^:private rasta-revision-info
  {:id (test-users/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"})

(defn- get-revisions [entity object-id]
  (for [revision (mt/user-http-request :rasta :get "revision" :entity entity, :id object-id)]
    (dissoc revision :timestamp :id)))

(defn- create-card-revision [card is-creation? user]
  (push-revision!
    :object       card
    :entity       Card
    :id           (:id card)
    :user-id      (test-users/user->id user)
    :is-creation? is-creation?))

(defn- create-dashboard-revision! [dash is-creation? user]
  (push-revision!
    :object       (Dashboard (:id dash))
    :entity       Dashboard
    :id           (:id dash)
    :user-id      (test-users/user->id user)
    :is-creation? is-creation?))

;;; # GET /revision

; Things we are testing for:
;  1. ordered by timestamp DESC
;  2. :user is hydrated
;  3. :description is calculated

;; case with no revisions (maintains backwards compatibility with old installs before revisions)
(deftest no-revisions-test
  (testing "Loading revisions, where there are no revisions, should work"
    (is (= [{:user {}, :diff nil, :description nil}]
           (tt/with-temp Card [{:keys [id]}]
             (get-revisions :card id))))))

;; case with single creation revision
(deftest single-revision-test
  (testing "Loading a single revision works"
    (is (= [{:is_reversion false
             :is_creation  true
             :message      nil
             :user         rasta-revision-info
             :diff         nil
             :description  nil}]
           (tt/with-temp Card [{:keys [id] :as card}]
             (create-card-revision card true :rasta)
             (get-revisions :card id))))))

;; case with multiple revisions, including reversion
(deftest multiple-revisions-with-reversion-test
  (testing "Creating multiple revisions, with a reversion, works"
    (tt/with-temp Card [{:keys [id name], :as card}]
      (is (= [{:is_reversion true
               :is_creation  false
               :message      "because i wanted to"
               :user         rasta-revision-info
               :diff         {:before {:name "something else"}
                              :after  {:name name}}
               :description  (format "renamed this Card from \"something else\" to \"%s\"." name)}
              {:is_reversion false
               :is_creation  false
               :message      nil
               :user         rasta-revision-info
               :diff         {:before {:name name}
                              :after  {:name "something else"}}
               :description  (format "renamed this Card from \"%s\" to \"something else\"." name)}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         rasta-revision-info
               :diff         nil
               :description  nil}]
             (do
               (create-card-revision card true :rasta)
               (create-card-revision (assoc card :name "something else") false :rasta)
               (db/insert! Revision
                 :model        (:name Card)
                 :model_id     id
                 :user_id      (test-users/user->id :rasta)
                 :object       (serialize-instance Card (:id card) card)
                 :message      "because i wanted to"
                 :is_creation  false
                 :is_reversion true)
               (get-revisions :card id)))))))

;;; # POST /revision/revert

(defn- strip-ids
  [objects]
  (mapv #(dissoc % :id) objects))

(deftest revert-test
  (testing "Reverting through API works"
    (tt/with-temp* [Dashboard [{:keys [id] :as dash}]
                    Card      [{card-id :id, :as card}]]
      (is (= [{:is_reversion true
               :is_creation  false
               :message      nil
               :user         rasta-revision-info
               :diff         {:before {:cards nil}
                              :after  {:cards [{:sizeX 2, :sizeY 2, :row 0, :col 0, :card_id card-id, :series []}]}}
               :description  "added a card."}
              {:is_reversion false
               :is_creation  false
               :message      nil
               :user         rasta-revision-info
               :diff         {:before {:cards [{:sizeX 2, :sizeY 2, :row 0, :col 0, :card_id card-id, :series []}]}
                              :after  {:cards nil}}
               :description "removed a card."}
              {:is_reversion false
               :is_creation  false
               :message      nil
               :user         rasta-revision-info
               :diff         {:before {:cards nil}
                              :after  {:cards [{:sizeX 2, :sizeY 2, :row 0, :col 0, :card_id card-id, :series []}]}}
               :description "added a card."}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         rasta-revision-info
               :diff         nil
               :description  nil}]
             (do
               (create-dashboard-revision! dash true :rasta)
               (let [dashcard (db/insert! DashboardCard :dashboard_id id :card_id (:id card))]
                 (create-dashboard-revision! dash false :rasta)
                 (db/simple-delete! DashboardCard, :id (:id dashcard)))
               (create-dashboard-revision! dash false :rasta)
               (let [[_ {previous-revision-id :id}] (revisions Dashboard id)]
                 ;; Revert to the previous revision, allowed because rasta has permissions on parent collection
                 (mt/user-http-request :rasta :post "revision/revert" {:entity      :dashboard
                                                                       :id          id
                                                                       :revision_id previous-revision-id}))
               (->> (get-revisions :dashboard id)
                    (mapv (fn [rev]
                            (if-not (:diff rev) rev
                              (if (get-in rev [:diff :before :cards])
                                (update-in rev [:diff :before :cards] strip-ids)
                                (update-in rev [:diff :after :cards] strip-ids))))))))))))

(deftest permission-check-on-revert-test
  (testing "Are permissions enforced by the revert action in the revision api?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection {:name "Personal collection"}]
                      Dashboard  [dashboard {:collection_id (u/the-id collection) :name "Personal dashboard"}]]
        (create-dashboard-revision! dashboard true :crowberto)
        (create-dashboard-revision! dashboard false :crowberto)
        (let [dashboard-id          (u/the-id dashboard)
              [_ {prev-rev-id :id}] (revisions Dashboard dashboard-id)
              update-req            {:entity :dashboard, :id dashboard-id, :revision_id prev-rev-id}]
          ;; rasta should not have permissions to update the dashboard (i.e. revert), because they are not admin and do
          ;; not have any particular permission on the collection where it lives (because of the
          ;; with-non-admin-groups-no-root-collection-perms wrapper)
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post "revision/revert" update-req))))))))
