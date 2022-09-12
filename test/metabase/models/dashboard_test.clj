(ns metabase.models.dashboard-test
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.dashboard :as dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.database :refer [Database]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :as user]
            [metabase.test :as mt]
            [metabase.test.data.users :as test.users]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## Dashboard Revisions

(deftest serialize-dashboard-test
  (tt/with-temp* [Dashboard           [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    (is (= {:name         "Test Dashboard"
            :description  nil
            :cache_ttl    nil
            :cards        [{:size_x   2
                            :size_y   2
                            :row     0
                            :col     0
                            :id      true
                            :card_id true
                            :series  true}]}
           (update (dashboard/serialize-dashboard dashboard) :cards (fn [[{:keys [id card_id series], :as card}]]
                                                                      [(assoc card
                                                                              :id      (= dashcard-id id)
                                                                              :card_id (= card-id card_id)
                                                                              :series  (= [series-id-1 series-id-2] series))]))))))


(deftest diff-dashboards-str-test
  (is (= "renamed it from \"Diff Test\" to \"Diff Test Changed\" and added a description."
         (#'dashboard/diff-dashboards-str
          nil
          {:name        "Diff Test"
           :description nil
           :cards       []}
          {:name        "Diff Test Changed"
           :description "foobar"
           :cards       []})))

  (is (= "added a card."
         (#'dashboard/diff-dashboards-str
          nil
          {:name        "Diff Test"
           :description nil
           :cards       []}
          {:name        "Diff Test"
           :description nil
           :cards       [{:size_x   2
                          :size_y   2
                          :row     0
                          :col     0
                          :id      1
                          :card_id 1
                          :series  []}]})))

  (is (= "changed the cache ttl from \"333\" to \"1227\", rearranged the cards, modified the series on card 1 and added some series to card 2."
         (#'dashboard/diff-dashboards-str
          nil
          {:name        "Diff Test"
           :description nil
           :cache_ttl   333
           :cards       [{:size_x   2
                          :size_y   2
                          :row     0
                          :col     0
                          :id      1
                          :card_id 1
                          :series  [5 6]}
                         {:size_x   2
                          :size_y   2
                          :row     0
                          :col     0
                          :id      2
                          :card_id 2
                          :series  []}]}
          {:name        "Diff Test"
           :description nil
           :cache_ttl   1227
           :cards       [{:size_x   2
                          :size_y   2
                          :row     0
                          :col     0
                          :id      1
                          :card_id 1
                          :series  [4 5]}
                         {:size_x   2
                          :size_y   2
                          :row     2
                          :col     0
                          :id      2
                          :card_id 2
                          :series  [3 4 5]}]}))))

(deftest revert-dashboard!-test
  (tt/with-temp* [Dashboard           [{dashboard-id :id, :as dashboard}    {:name "Test Dashboard"}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id :as dashboard-card} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                                    {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                                    {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    (let [check-ids            (fn [[{:keys [id card_id series] :as card}]]
                                 [(assoc card
                                         :id      (= dashcard-id id)
                                         :card_id (= card-id card_id)
                                         :series  (= [series-id-1 series-id-2] series))])
          empty-dashboard      {:name        "Revert Test"
                                :description "something"
                                :cache_ttl   nil
                                :cards       []}
          serialized-dashboard (dashboard/serialize-dashboard dashboard)]
      (testing "original state"
        (is (= {:name        "Test Dashboard"
                :description nil
                :cache_ttl   nil
                :cards       [{:size_x  2
                               :size_y  2
                               :row     0
                               :col     0
                               :id      true
                               :card_id true
                               :series  true}]}
               (update serialized-dashboard :cards check-ids))))
      (testing "delete the dashcard and modify the dash attributes"
        (dashboard-card/delete-dashboard-card! dashboard-card (test.users/user->id :rasta))
        (db/update! Dashboard dashboard-id
          :name        "Revert Test"
          :description "something")
        (testing "capture updated Dashboard state"
          (is (= empty-dashboard
                 (dashboard/serialize-dashboard (db/select-one Dashboard :id dashboard-id))))))
      (testing "now do the reversion; state should return to original"
        (#'dashboard/revert-dashboard! nil dashboard-id (test.users/user->id :crowberto) serialized-dashboard)
        (is (= {:name        "Test Dashboard"
                :description nil
                :cache_ttl   nil
                :cards       [{:size_x  2
                               :size_y  2
                               :row     0
                               :col     0
                               :id      false
                               :card_id true
                               :series  true}]}
               (update (dashboard/serialize-dashboard (db/select-one Dashboard :id dashboard-id)) :cards check-ids))))
      (testing "revert back to the empty state"
        (#'dashboard/revert-dashboard! nil dashboard-id (test.users/user->id :crowberto) empty-dashboard)
        (is (= empty-dashboard
               (dashboard/serialize-dashboard (db/select-one Dashboard :id dashboard-id))))))))

(deftest public-sharing-test
  (testing "test that a Dashboard's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (tt/with-temp Dashboard [dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
        (is (schema= u/uuid-regex
                     (:public_uuid dashboard)))))

    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (tt/with-temp Dashboard [dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
          (is (= nil
                 (:public_uuid dashboard))))))))

(deftest post-update-test
  (tt/with-temp* [Collection          [{collection-id-1 :id}]
                  Collection          [{collection-id-2 :id}]
                  Dashboard           [{dashboard-id :id} {:name "Lucky the Pigeon's Lucky Stuff", :collection_id collection-id-1}]
                  Card                [{card-id :id}]
                  Pulse               [{pulse-id :id} {:dashboard_id dashboard-id, :collection_id collection-id-1}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  PulseCard           [{pulse-card-id :id} {:pulse_id pulse-id, :card_id card-id, :dashboard_card_id dashcard-id}]]
    (testing "Pulse name and collection-id updates"
      (db/update! Dashboard dashboard-id :name "Lucky's Close Shaves" :collection_id collection-id-2)
      (is (= "Lucky's Close Shaves"
             (db/select-one-field :name Pulse :id pulse-id)))
      (is (= collection-id-2
             (db/select-one-field :collection_id Pulse :id pulse-id))))
    (testing "PulseCard syncing"
      (tt/with-temp Card [{new-card-id :id}]
        (dashboard/add-dashcard! dashboard-id new-card-id)
        (db/update! Dashboard dashboard-id :name "Lucky's Close Shaves")
        (is (not (nil? (db/select-one PulseCard :card_id new-card-id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-dash-in-collection [f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection    [collection]
                    Dashboard     [dash  {:collection_id (u/the-id collection)}]
                    Database      [db    {:engine :h2}]
                    Table         [table {:db_id (u/the-id db)}]
                    Card          [card  {:dataset_query {:database (u/the-id db)
                                                          :type     :query
                                                          :query    {:source-table (u/the-id table)}}}]
                    DashboardCard [_ {:dashboard_id (u/the-id dash), :card_id (u/the-id card)}]]
      (f db collection dash))))

(defmacro with-dash-in-collection
  "Execute `body` with a Dashboard in a Collection. Dashboard will contain one Card in a Database."
  {:style/indent 1}
  [[db-binding collection-binding dash-binding] & body]
  `(do-with-dash-in-collection
    (fn [~db-binding ~collection-binding ~dash-binding]
      ~@body)))

(deftest perms-test
  (with-dash-in-collection [db collection dash]
    (testing (str "Check that if a Dashboard is in a Collection, someone who would not be able to see it under the old "
                  "artifact-permissions regime will be able to see it if they have permissions for that Collection")
      (binding [api/*current-user-permissions-set* (atom #{(perms/collection-read-path collection)})]
        (is (= true
               (mi/can-read? dash)))))

    (testing (str "Check that if a Dashboard is in a Collection, someone who would otherwise be able to see it under "
                  "the old artifact-permissions regime will *NOT* be able to see it if they don't have permissions for "
                  "that Collection"))
    (binding [api/*current-user-permissions-set* (atom #{(perms/data-perms-path (u/the-id db))})]
      (is (= false
             (mi/can-read? dash))))

    (testing "Do we have *write* Permissions for a Dashboard if we have *write* Permissions for the Collection its in?"
      (binding [api/*current-user-permissions-set* (atom #{(perms/collection-readwrite-path collection)})]
        (mi/can-write? dash)))))

(deftest transient-dashboards-test
  (testing "test that we save a transient dashboard"
    (tu/with-model-cleanup [Card Dashboard DashboardCard Collection]
      (let [rastas-personal-collection (collection/user->personal-collection (test.users/user->id :rasta))]
        (binding [api/*current-user-id*              (test.users/user->id :rasta)
                  api/*current-user-permissions-set* (-> :rasta test.users/user->id user/permissions-set atom)]
          (let [dashboard       (magic/automagic-analysis (db/select-one Table :id (mt/id :venues)) {})
                saved-dashboard (dashboard/save-transient-dashboard! dashboard (u/the-id rastas-personal-collection))]
            (is (= (db/count DashboardCard :dashboard_id (u/the-id saved-dashboard))
                   (-> dashboard :ordered_cards count)))))))))

(deftest validate-collection-namespace-test
  (mt/with-temp Collection [{collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Dashboard in a non-normal Collection"
      (let [dashboard-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Dashboard can only go in Collections in the \"default\" namespace"
               (db/insert! Dashboard (assoc (tt/with-temp-defaults Dashboard) :collection_id collection-id, :name dashboard-name))))
          (finally
            (db/delete! Dashboard :name dashboard-name)))))

    (testing "Shouldn't be able to move a Dashboard to a non-normal Collection"
      (mt/with-temp Dashboard [{card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Dashboard can only go in Collections in the \"default\" namespace"
             (db/update! Dashboard card-id {:collection_id collection-id})))))))

(deftest validate-parameters-test
  (testing "Should validate Dashboard :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with :id and :type keys"
           (mt/with-temp Dashboard [_ {:parameters {:a :b}}]))))
    (testing "updating"
      (mt/with-temp Dashboard [{:keys [id]} {:parameters []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameters must be a sequence of maps with :id and :type keys"
             (db/update! Dashboard id :parameters [{:id 100}])))))))

(deftest normalize-parameters-test
  (testing ":parameters should get normalized when coming out of the DB"
    (doseq [[target expected] {[:dimension [:field-id 1000]] [:dimension [:field 1000 nil]]
                               [:field-id 1000]              [:field 1000 nil]}]
      (testing (format "target = %s" (pr-str target))
        (mt/with-temp Dashboard [{dashboard-id :id} {:parameters [{:name   "Category Name"
                                                                   :slug   "category_name"
                                                                   :id     "_CATEGORY_NAME_"
                                                                   :type   "category"
                                                                   :target target}]}]
          (is (= [{:name   "Category Name"
                   :slug   "category_name"
                   :id     "_CATEGORY_NAME_"
                   :type   :category
                   :target expected}]
                 (db/select-one-field :parameters Dashboard :id dashboard-id))))))))

(deftest identity-hash-test
  (testing "Dashboard hashes are composed of the name and parent collection's hash"
    (mt/with-temp* [Collection [c1   {:name "top level" :location "/"}]
                    Dashboard  [dash {:name "my dashboard" :collection_id (:id c1)}]]
      (is (= "38c0adf9"
             (serdes.hash/raw-hash ["my dashboard" (serdes.hash/identity-hash c1)])
             (serdes.hash/identity-hash dash))))))
