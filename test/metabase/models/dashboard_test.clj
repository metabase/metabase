(ns metabase.models.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.automagic-dashboards.core :as magic]
   [metabase.models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries
                            Database Field Pulse PulseCard Table]]
   [metabase.models.collection :as collection]
   [metabase.models.dashboard :as dashboard]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.revision :as revision]
   [metabase.models.revision.diff :refer [build-sentence]]
   [metabase.models.serialization :as serdes]
   [metabase.models.user :as user]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan.util.test :as tt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

;; ## Dashboard Revisions

(deftest serialize-dashboard-test
  (tt/with-temp* [Dashboard           [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    (is (= {:name               "Test Dashboard"
            :auto_apply_filters true
            :collection_id      nil
            :description        nil
            :cache_ttl          nil
            :cards              [{:size_x  4
                                  :size_y  4
                                  :row     0
                                  :col     0
                                  :id      true
                                  :card_id true
                                  :series  true}]}
           (update (revision/serialize-instance Dashboard (:id dashboard) dashboard)
                   :cards
                   (fn [[{:keys [id card_id series], :as card}]]
                     [(assoc card
                             :id      (= dashcard-id id)
                             :card_id (= card-id card_id)
                             :series  (= [series-id-1 series-id-2] series))]))))))


(deftest diff-dashboards-str-test
  (is (= "added a description and renamed it from \"Diff Test\" to \"Diff Test Changed\"."
         (build-sentence
           (revision/diff-strings
             Dashboard
             {:name        "Diff Test"
              :description nil
              :cards       []}
             {:name        "Diff Test Changed"
              :description "foobar"
              :cards       []}))))

  (is (= "added a card."
         (build-sentence
           (revision/diff-strings
             Dashboard
             {:name        "Diff Test"
              :description nil
              :cards       []}
             {:name        "Diff Test"
              :description nil
              :cards       [{:size_x  4
                             :size_y  4
                             :row     0
                             :col     0
                             :id      1
                             :card_id 1
                             :series  []}]}))))

  (is (= "set auto apply filters to false."
         (build-sentence
           (revision/diff-strings
             Dashboard
             {:name               "Diff Test"
              :auto_apply_filters true}
             {:name               "Diff Test"
              :auto_apply_filters false}))))

  (is (= "changed the cache ttl from \"333\" to \"1,227\", rearranged the cards, modified the series on card 1 and added some series to card 2."
         (build-sentence
           (revision/diff-strings
             Dashboard
             {:name        "Diff Test"
              :description nil
              :cache_ttl   333
              :cards       [{:size_x  4
                             :size_y  4
                             :row     0
                             :col     0
                             :id      1
                             :card_id 1
                             :series  [5 6]}
                            {:size_x  4
                             :size_y  4
                             :row     0
                             :col     0
                             :id      2
                             :card_id 2
                             :series  []}]}
             {:name        "Diff Test"
              :description nil
              :cache_ttl   1227
              :cards       [{:size_x  4
                             :size_y  4
                             :row     0
                             :col     0
                             :id      1
                             :card_id 1
                             :series  [4 5]}
                            {:size_x  4
                             :size_y  4
                             :row     2
                             :col     0
                             :id      2
                             :card_id 2
                             :series  [3 4 5]}]}))))

 (is (= "added a card."
        (build-sentence
          (revision/diff-strings
            Dashboard
            {:cards [{:id 1} {:id 2}]}
            {:cards [{:id 1} {:id 2} {:id 3}]}))))

 (is (= "removed a card."
        (build-sentence
          (revision/diff-strings
            Dashboard
            {:cards [{:id 1} {:id 2}]}
            {:cards [{:id 1}]}))))

 (is (= "rearranged the cards."
        (build-sentence
          (revision/diff-strings
            Dashboard
            {:cards [{:id 1 :row 0} {:id 2 :row 1}]}
            {:cards [{:id 1 :row 1} {:id 2 :row 2}]}))))

 (is (= "modified the cards."
        (build-sentence
          (revision/diff-strings
            Dashboard
            {:cards [{:id 1} {:id 2}]}
            {:cards [{:id 1} {:id 3}]}))))

 (is (= "renamed it from \"Apple\" to \"Next\" and modified the cards."
        (build-sentence
          (revision/diff-strings
            Dashboard
            {:name "Apple"
             :cards [{:id 1} {:id 2}]}
            {:name "Next"
             :cards [{:id 1} {:id 3}]}))))
 (t2.with-temp/with-temp
   [Collection {coll-id :id} {:name "New collection"}]
   (is (= "moved this Dashboard to New collection."
          (build-sentence
            (revision/diff-strings
              Dashboard
              {:name "Apple"}
              {:name          "Apple"
               :collection_id coll-id})))))
 (t2.with-temp/with-temp
   [Collection {coll-id-1 :id} {:name "Old collection"}
    Collection {coll-id-2 :id} {:name "New collection"}]
   (is (= "moved this Dashboard from Old collection to New collection."
          (build-sentence
            (revision/diff-strings
              Dashboard
              {:name          "Apple"
               :collection_id coll-id-1}
              {:name          "Apple"
               :collection_id coll-id-2}))))))


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
          empty-dashboard      {:name               "Revert Test"
                                :description        "something"
                                :auto_apply_filters true
                                :collection_id      nil
                                :cache_ttl          nil
                                :cards              []}
          serialized-dashboard (revision/serialize-instance Dashboard (:id dashboard) dashboard)]
      (testing "original state"
        (is (= {:name               "Test Dashboard"
                :description        nil
                :cache_ttl          nil
                :auto_apply_filters true
                :collection_id      nil
                :cards              [{:size_x  4
                                      :size_y  4
                                      :row     0
                                      :col     0
                                      :id      true
                                      :card_id true
                                      :series  true}]}
               (update serialized-dashboard :cards check-ids))))
      (testing "delete the dashcard and modify the dash attributes"
        (dashboard-card/delete-dashboard-cards! [(:id dashboard-card)])
        (t2/update! Dashboard dashboard-id
                    {:name               "Revert Test"
                     :auto_apply_filters false
                     :description        "something"})
        (testing "capture updated Dashboard state"
          (let [dashboard (t2/select-one Dashboard :id dashboard-id)]
            (is (= (assoc empty-dashboard :auto_apply_filters false)
                   (revision/serialize-instance Dashboard (:id dashboard) dashboard))))))
      (testing "now do the reversion; state should return to original"
        (revision/revert-to-revision! Dashboard dashboard-id (test.users/user->id :crowberto) serialized-dashboard)
        (is (= {:name               "Test Dashboard"
                :description        nil
                :cache_ttl          nil
                :auto_apply_filters true
                :collection_id      nil
                :cards              [{:size_x  4
                                      :size_y  4
                                      :row     0
                                      :col     0
                                      :id      false
                                      :card_id true
                                      :series  true}]}
               (update (revision/serialize-instance Dashboard dashboard-id (t2/select-one Dashboard :id dashboard-id))
                       :cards check-ids))))
      (testing "revert back to the empty state"
        (revision/revert-to-revision! Dashboard dashboard-id (test.users/user->id :crowberto) empty-dashboard)
        (is (= empty-dashboard
               (revision/serialize-instance Dashboard dashboard-id (t2/select-one Dashboard :id dashboard-id))))))))

(deftest public-sharing-test
  (testing "test that a Dashboard's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (t2.with-temp/with-temp [Dashboard dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
        (is (schema= u/uuid-regex
                     (:public_uuid dashboard)))))

    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (t2.with-temp/with-temp [Dashboard dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
          (is (= nil
                 (:public_uuid dashboard))))))))

(deftest post-update-test
  (tt/with-temp* [Collection          [{collection-id-1 :id}]
                  Collection          [{collection-id-2 :id}]
                  Dashboard           [{dashboard-id :id} {:name "Lucky the Pigeon's Lucky Stuff", :collection_id collection-id-1}]
                  Card                [{card-id :id}]
                  Pulse               [{pulse-id :id} {:dashboard_id dashboard-id, :collection_id collection-id-1}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  PulseCard           [_ {:pulse_id pulse-id, :card_id card-id, :dashboard_card_id dashcard-id}]]
    (testing "Pulse name and collection-id updates"
      (t2/update! Dashboard dashboard-id {:name "Lucky's Close Shaves" :collection_id collection-id-2})
      (is (= "Lucky's Close Shaves"
             (t2/select-one-fn :name Pulse :id pulse-id)))
      (is (= collection-id-2
             (t2/select-one-fn :collection_id Pulse :id pulse-id))))
    (testing "PulseCard syncing"
      (t2.with-temp/with-temp [Card {new-card-id :id}]
        (dashboard/add-dashcards! dashboard-id [{:card_id new-card-id
                                                 :row     0
                                                 :col     0
                                                 :size_x  4
                                                 :size_y  4}])
        (t2/update! Dashboard dashboard-id {:name "Lucky's Close Shaves"})
        (is (not (nil? (t2/select-one PulseCard :card_id new-card-id))))))))

(deftest parameter-card-test
  (let [default-params {:name       "Category Name"
                        :slug       "category_name"
                        :id         "_CATEGORY_NAME_"
                        :type       "category"}]
    (testing "A new dashboard creates a new ParameterCard"
      (tt/with-temp* [Card      [{card-id :id}]
                      Dashboard [{dashboard-id :id}
                                 {:parameters [(merge default-params
                                                      {:values_source_type    "card"
                                                       :values_source_config {:card_id card-id}})]}]]
        (is (=? {:card_id                   card-id
                 :parameterized_object_type :dashboard
                 :parameterized_object_id   dashboard-id
                 :parameter_id              "_CATEGORY_NAME_"}
                (t2/select-one 'ParameterCard :card_id card-id)))))

    (testing "Adding a card_id creates a new ParameterCard"
      (tt/with-temp* [Card      [{card-id :id}]
                      Dashboard [{dashboard-id :id}
                                 {:parameters [default-params]}]]
        (is (nil? (t2/select-one 'ParameterCard :card_id card-id)))
        (t2/update! Dashboard dashboard-id {:parameters [(merge default-params
                                                                {:values_source_type    "card"
                                                                 :values_source_config {:card_id card-id}})]})
        (is (=? {:card_id                   card-id
                 :parameterized_object_type :dashboard
                 :parameterized_object_id   dashboard-id
                 :parameter_id              "_CATEGORY_NAME_"}
                (t2/select-one 'ParameterCard :card_id card-id)))))

    (testing "Removing a card_id deletes old ParameterCards"
      (tt/with-temp* [Card      [{card-id :id}]
                      Dashboard [{dashboard-id :id}
                                 {:parameters [(merge default-params
                                                      {:values_source_type    "card"
                                                       :values_source_config {:card_id card-id}})]}]]
        ;; same setup as earlier test, we know the ParameterCard exists right now
        (t2/delete! Dashboard :id dashboard-id)
        (is (nil? (t2/select-one 'ParameterCard :card_id card-id)))))))

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
  {:style/indent :defn}
  [[db-binding collection-binding dash-binding] & body]
  `(do-with-dash-in-collection
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or dash-binding '_)]
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
          (let [dashboard       (magic/automagic-analysis (t2/select-one Table :id (mt/id :venues)) {})
                saved-dashboard (dashboard/save-transient-dashboard! dashboard (u/the-id rastas-personal-collection))]
            (is (= (t2/count DashboardCard :dashboard_id (u/the-id saved-dashboard))
                   (-> dashboard :ordered_cards count)))))))))

(deftest validate-collection-namespace-test
  (mt/with-temp Collection [{collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Dashboard in a non-normal Collection"
      (let [dashboard-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Dashboard can only go in Collections in the \"default\" namespace"
               (t2/insert! Dashboard (assoc (tt/with-temp-defaults Dashboard) :collection_id collection-id, :name dashboard-name))))
          (finally
            (t2/delete! Dashboard :name dashboard-name)))))

    (testing "Shouldn't be able to move a Dashboard to a non-normal Collection"
      (mt/with-temp Dashboard [{card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Dashboard can only go in Collections in the \"default\" namespace"
             (t2/update! Dashboard card-id {:collection_id collection-id})))))))

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
             (t2/update! Dashboard id {:parameters [{:id 100}]})))))))

(deftest normalize-parameters-test
  (testing ":parameters should get normalized when coming out of the DB"
    (doseq [[target expected] {[:dimension [:field-id 1000]] [:dimension [:field 1000 nil]]
                               [:field-id 1000]              [:field 1000 nil]}]
      (testing (format "target = %s" (pr-str target))
        (mt/with-temp* [Card      [{card-id :id}]
                        Dashboard [{dashboard-id :id} {:parameters [{:name   "Category Name"
                                                                     :slug   "category_name"
                                                                     :id     "_CATEGORY_NAME_"
                                                                     :type   "category"
                                                                     :values_query_type    "list"
                                                                     :values_source_type   "card"
                                                                     :values_source_config {:card_id card-id
                                                                                            :value_field [:field 2 nil]}
                                                                     :target target}]}]]
          (is (= [{:name   "Category Name"
                   :slug   "category_name"
                   :id     "_CATEGORY_NAME_"
                   :type   :category
                   :target expected
                   :values_query_type "list",
                   :values_source_type "card",
                   :values_source_config {:card_id card-id, :value_field [:field 2 nil]}}]
                 (t2/select-one-fn :parameters Dashboard :id dashboard-id))))))))

(deftest should-add-default-values-source-test
  (testing "shoudld add default if not exists"
    (mt/with-temp Dashboard [{dashboard-id :id} {:parameters [{:name   "Category Name"
                                                               :slug   "category_name"
                                                               :id     "_CATEGORY_NAME_"
                                                               :type   "category"}]}]
      (is (=? [{:name                 "Category Name"
                :slug                 "category_name"
                :id                   "_CATEGORY_NAME_"
                :type                 :category}]
              (t2/select-one-fn :parameters Dashboard :id dashboard-id)))))

  (testing "shoudld not override if existsed "
    (mt/with-temp* [Card      [{card-id :id}]
                    Dashboard [{dashboard-id :id} {:parameters [{:name   "Category Name"
                                                                  :slug   "category_name"
                                                                  :id     "_CATEGORY_NAME_"
                                                                  :type   "category"
                                                                  :values_query_type    "list"
                                                                  :values_source_type   "card"
                                                                  :values_source_config {:card_id card-id
                                                                                         :value_field [:field 2 nil]}}]}]]
      (is (=? [{:name                 "Category Name"
                :slug                 "category_name"
                :id                   "_CATEGORY_NAME_"
                :type                 :category
                :values_query_type    "list",
                :values_source_type   "card",
                :values_source_config {:card_id card-id, :value_field [:field 2 nil]}}]
              (t2/select-one-fn :parameters Dashboard :id dashboard-id))))))

(deftest identity-hash-test
  (testing "Dashboard hashes are composed of the name and parent collection's hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp* [Collection [c1   {:name "top level" :location "/" :created_at now}]
                      Dashboard  [dash {:name "my dashboard" :collection_id (:id c1) :created_at now}]]
        (is (= "8cbf93b7"
               (serdes/raw-hash ["my dashboard" (serdes/identity-hash c1) now])
               (serdes/identity-hash dash)))))))

(deftest descendants-test
  (testing "dashboard which have parameter's source is another card"
    (mt/with-temp* [Field     [field     {:name "A field"}]
                    Card      [card      {:name "A card"}]
                    Dashboard [dashboard {:name       "A dashboard"
                                          :parameters [{:id "abc"
                                                        :type "category"
                                                        :values_source_type "card"
                                                        :values_source_config {:card_id     (:id card)
                                                                               :value_field [:field (:id field) nil]}}]}]]
      (is (= #{["Card" (:id card)]}
             (serdes/descendants "Dashboard" (:id dashboard))))))

  (testing "dashboard which has a dashcard with an action"
    (mt/with-actions [{:keys [action-id]} {}]
      (mt/with-temp* [Dashboard [dashboard {:name "A dashboard"}]
                      DashboardCard [_ {:action_id          action-id
                                        :dashboard_id       (:id dashboard)
                                        :parameter_mappings []}]]
        (is (= #{["Action" action-id]}
               (serdes/descendants "Dashboard" (:id dashboard)))))))

  (testing "dashboard in which its dashcards has parameter_mappings to a card"
    (mt/with-temp* [Card          [card1     {:name "Card attached to dashcard"}]
                    Card          [card2     {:name "Card attached to parameters"}]
                    Dashboard     [dashboard {:parameters [{:name "Category Name"
                                                            :slug "category_name"
                                                            :id   "_CATEGORY_NAME_"
                                                            :type "category"}]}]
                    DashboardCard [_         {:card_id            (:id card1)
                                              :dashboard_id       (:id dashboard)
                                              :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                                    :card_id      (:id card2)
                                                                    :target       [:dimension (mt/$ids $categories.name)]}]}]]
      (is (= #{["Card" (:id card1)]
               ["Card" (:id card2)]}
             (serdes/descendants "Dashboard" (:id dashboard)))))))
