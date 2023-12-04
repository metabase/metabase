(ns metabase.models.dashboard-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.automagic-dashboards.core :as magic]
   [metabase.models :refer [Action Card Collection Dashboard DashboardCard DashboardCardSeries
                            Database Field Pulse PulseCard Revision Table]]
   [metabase.models.collection :as collection]
   [metabase.models.dashboard :as dashboard]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.models.user :as user]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

;; ## Dashboard Revisions

(deftest serialize-dashboard-test
  (testing "without tabs"
    (t2.with-temp/with-temp [Dashboard           {dashboard-id :id :as dashboard} {:name "Test Dashboard"}
                             Card                {card-id :id}     {}
                             Card                {series-id-1 :id} {}
                             Card                {series-id-2 :id} {}
                             DashboardCard       {dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}
                             DashboardCardSeries _                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}
                             DashboardCardSeries _                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]
      (is (= {:name                "Test Dashboard"
              :auto_apply_filters  true
              :collection_id       nil
              :description         nil
              :cache_ttl           nil
              :cards               [{:size_x                 4
                                     :size_y                 4
                                     :row                    0
                                     :col                    0
                                     :id                     true
                                     :card_id                true
                                     :series                 true
                                     :dashboard_tab_id       nil
                                     :action_id              nil
                                     :parameter_mappings     []
                                     :visualization_settings {}
                                     :dashboard_id           dashboard-id}]
              :tabs                []
              :archived            false
              :collection_position nil
              :enable_embedding    false
              :embedding_params    nil
              :parameters          []}
             (update (revision/serialize-instance Dashboard (:id dashboard) dashboard)
                     :cards
                     (fn [[{:keys [id card_id series], :as card}]]
                       [(assoc card
                               :id      (= dashcard-id id)
                               :card_id (= card-id card_id)
                               :series  (= [series-id-1 series-id-2] series))])))))))

(deftest serialize-dashboard-with-tabs-test
  (testing "with tabs"
    (t2.with-temp/with-temp [Dashboard           {dashboard-id :id :as dashboard} {:name "Test Dashboard"}
                             :model/DashboardTab {tab-id :id}                     {:dashboard_id dashboard-id :name "Test Tab" :position 0}
                             DashboardCard       {dashcard-id :id}                {:dashboard_id dashboard-id :dashboard_tab_id tab-id}]
      (is (=? {:name               "Test Dashboard"
               :auto_apply_filters true
               :collection_id      nil
               :description        nil
               :cache_ttl          nil
               :cards              [{:size_x           4
                                     :size_y           4
                                     :row              0
                                     :col              0
                                     :id               dashcard-id
                                     :dashboard_tab_id tab-id}]
               :tabs               [{:id      tab-id
                                     :name    "Test Tab"
                                     :position 0}]}
              (revision/serialize-instance Dashboard (:id dashboard) dashboard))))))

(deftest ^:parallel diff-dashboards-str-test
  (testing "update general info ---"
    (are [x y expected] (= expected
                           (u/build-sentence (revision/diff-strings Dashboard x y)))
      {:name        "Diff Test"
       :description nil
       :cards       []}
      {:name        "Diff Test Changed"
       :description "foobar"
       :cards       []}
      "added a description and renamed it from \"Diff Test\" to \"Diff Test Changed\"."

      {:name  "Apple"
       :cards [{:id 1} {:id 2}]}
      {:name  "Next"
       :cards [{:id 1} {:id 3}]}
      "renamed this Dashboard from \"Apple\" to \"Next\" and modified the cards."

      {:name               "Diff Test"
       :auto_apply_filters true}
      {:name               "Diff Test"
       :auto_apply_filters false}
      "set auto apply filters to false."

      ;; multiple changes
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
                      :series  [3 4 5]}]}
      (str "changed the cache ttl from \"333\" to \"1,227\", modified the cards, modified the series on card 1 and "
           "added some series to card 2."))))

(deftest ^:parallel diff-dashboards-str-update-cards-test
  (testing "update cards ---"
    (are [x y expected] (= expected
                           (u/build-sentence (revision/diff-strings Dashboard x y)))
      {:cards [{:id 1} {:id 2}]}
      {:cards [{:id 1} {:id 2} {:id 3}]}
      "added a card."

      {:cards [{:id 1} {:id 2}]}
      {:cards [{:id 1}]}
      "removed a card."

      {:cards [{:id 1 :row 0} {:id 2 :row 1}]}
      {:cards [{:id 1 :row 1} {:id 2 :row 2}]}
      "rearranged the cards."

      {:cards [{:id 1} {:id 2}]}
      {:cards [{:id 1} {:id 3}]}
      "modified the cards.")))

(deftest diff-dashboards-str-update-collection-test
  (testing "update collection ---"
    (is (= "moved this Dashboard to Our analytics."
           (u/build-sentence
             (revision/diff-strings
               Dashboard
               {:name "Apple"}
               {:name          "Apple"
                :collection_id nil}))))

    (t2.with-temp/with-temp
      [Collection {coll-id :id} {:name "New collection"}]
      (is (= "moved this Dashboard to New collection."
             (u/build-sentence
              (revision/diff-strings
               Dashboard
               {:name "Apple"}
               {:name          "Apple"
                :collection_id coll-id})))))
    (t2.with-temp/with-temp
      [Collection {coll-id-1 :id} {:name "Old collection"}
       Collection {coll-id-2 :id} {:name "New collection"}]
      (is (= "moved this Dashboard from Old collection to New collection."
             (u/build-sentence
              (revision/diff-strings
               Dashboard
               {:name          "Apple"
                :collection_id coll-id-1}
               {:name          "Apple"
                :collection_id coll-id-2})))))))

(deftest ^:parallel diff-dashboards-str-update-tabs-test
  (testing "update tabs"
    (are [x y expected] (= expected
                           (u/build-sentence (revision/diff-strings Dashboard x y)))
      {:tabs [{:id 0 :name "First tab" :position 0}]}
      {:tabs [{:id 0 :name "First tab" :position 0}
              {:id 1 :name "Second tab" :position 1}]}
      "added a tab."

      {:tabs [{:id 0 :name "First tab" :position 0}
              {:id 1 :name "Second tab" :position 1}
              {:id 2 :name "Third tab" :position 2}]}
      {:tabs [{:id 0 :name "First tab" :position 0}]}
      "removed 2 tabs."

      {:tabs [{:id 0 :name "First tab" :position 0}
              {:id 1 :name "Second tab" :position 1}]}
      {:tabs [{:id 1 :name "Second tab" :position 0}
              {:id 0 :name "First tab" :position 1}]}
      "rearranged the tabs."

      {:tabs [{:id 0 :name "Tab A" :position 0}
              {:id 1 :name "Tab B" :position 1}]}
      {:tabs [{:id 1 :name "Tab B new name and position" :position 0}
              {:id 0 :name "Tab A new name and position" :position 1}]}
      "modified the tabs.")))

(declare create-dashboard-revision!)

(deftest record-revision-and-description-completeness-test
  (let [clean-revisions-for-dashboard (fn [dashboard-id]
                                        ;; we'll automatically delete old revisions if we have more than [[revision/max-revisions]]
                                        ;; revisions for an instance, so let's clear everything to make it easier to test
                                        (t2/delete! Revision :model "Dashboard" :model_id dashboard-id)
                                        ;; create one before the update
                                        (create-dashboard-revision! dashboard-id true))]


    (testing "dashboard ---"
      (t2.with-temp/with-temp
        [:model/Dashboard dashboard {:name               "A Dashboard"
                                     :description        "An insightful Dashboard"
                                     :collection_position 0
                                     :position            10
                                     :cache_ttl           1000
                                     :parameters          [{:name       "Category Name"
                                                            :slug       "category_name"
                                                            :id         "_CATEGORY_NAME_"
                                                            :type       "category"}]}
         Collection       coll      {:name "A collection"}]
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (let [columns    (set/difference (set (keys dashboard)) (set @#'dashboard/excluded-columns-for-dashboard-revision))
                update-col (fn [col value]
                             (cond
                               (= col :collection_id)     (:id coll)
                               (= col :parameters)        (cons {:name "Category ID"
                                                                 :slug "category_id"
                                                                 :id   "_CATEGORY_ID_"
                                                                 :type "number"}
                                                                value)
                               (= col :made_public_by_id) (mt/user->id :crowberto)
                               (= col :embedding_params)  {:category_name "locked"}
                               (= col :public_uuid)       (str (random-uuid))
                               (int? value)               (inc value)
                               (boolean? value)           (not value)
                               (string? value)            (str value "_changed")))]
            (doseq [col columns]
              (let [before  (select-keys dashboard [col])
                    changes {col (update-col col (get dashboard col))}]
                (clean-revisions-for-dashboard (:id dashboard))
                ;; do the update
                (t2/update! Dashboard (:id dashboard) changes)
                (create-dashboard-revision! (:id dashboard) false)

                (testing (format "we should track when %s changes" col)
                  (is (= 2 (t2/count Revision :model "Dashboard" :model_id (:id dashboard)))))

                ;; we don't need a description for made_public_by_id because whenever this field changes
                ;; public_uuid will changes and we had a description for it.
                (when-not (#{:made_public_by_id} col)
                  (testing (format "we should have a revision description for %s" col)
                    (is (some? (u/build-sentence
                                 (revision/diff-strings
                                   Dashboard
                                   before
                                   changes))))))))))))

   (testing "dashboardcard ---"
     (t2.with-temp/with-temp
       [:model/Dashboard     dashboard {:name "A Dashboard"}
        :model/DashboardCard dashcard  {:dashboard_id (:id dashboard)}
        :model/DashboardTab  dashtab   {:dashboard_id (:id dashboard)}
        :model/Card          card      {:name "A Card" :dataset true}
        Action               action    {:model_id (:id card)
                                        :type     :implicit
                                        :name     "An action"}]
       (let [columns    (disj (set/difference (set (keys dashcard)) (set @#'dashboard/excluded-columns-for-dashcard-revision))
                              :dashboard_id :id)
             update-col (fn [col value]
                          (cond
                            (= col :action_id)          (:id action)
                            (= col :card_id)            (:id card)
                            (= col :dashboard_tab_id)   (:id dashtab)
                            (= col :parameter_mappings) [{:parameter_id "_CATEGORY_NAME_"
                                                          :target       [:dimension (mt/$ids $categories.name)]}]
                            (= col :visualization_settings) {:text "now it's a text card"}
                            (int? value)                (inc value)
                            (boolean? value)            (not value)
                            (string? value)             (str value "_changed")))]
         (doseq [col columns]
           (clean-revisions-for-dashboard (:id dashboard))
           ;; do the update
           (t2/update! :model/DashboardCard (:id dashcard) {col (update-col col (get dashcard col))})
           (create-dashboard-revision! (:id dashboard) false)

           (testing (format "we should track when %s changes" col)
             (is (= 2 (t2/count Revision :model "Dashboard" :model_id (:id dashboard)))))))))

   (testing "dashboardtab ---"
     (t2.with-temp/with-temp
       [:model/Dashboard     dashboard {:name "A Dashboard"}
        :model/DashboardTab  dashtab   {:dashboard_id (:id dashboard)}]
       (let [columns    (disj (set/difference (set (keys dashtab)) (set @#'dashboard/excluded-columns-for-dashboard-tab-revision))
                              :dashboard_id :id)
             update-col (fn [_col value]
                          (cond
                            (int? value)                (inc value)
                            (string? value)             (str value "_changed")))]
         (doseq [col columns]
           (clean-revisions-for-dashboard (:id dashboard))
           ;; do the update
           (t2/update! :model/DashboardTab (:id dashtab) {col (update-col col (get dashtab col))})
           (create-dashboard-revision! (:id dashboard) false)

           (testing (format "we should track when %s changes" col)
             (is (= 2 (t2/count Revision :model "Dashboard" :model_id (:id dashboard)))))))))))

(deftest revert-dashboard!-test
  (t2.with-temp/with-temp [Dashboard           {dashboard-id :id, :as dashboard}    {:name "Test Dashboard"}
                           Card                {card-id :id}                        {}
                           Card                {series-id-1 :id}                    {}
                           Card                {series-id-2 :id}                    {}
                           DashboardCard       {dashcard-id :id :as dashboard-card} {:dashboard_id dashboard-id, :card_id card-id}
                           DashboardCardSeries _                                    {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}
                           DashboardCardSeries _                                    {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]
    (let [check-ids            (fn [[{:keys [id card_id series] :as card}]]
                                 [(assoc card
                                         :id      (= dashcard-id id)
                                         :card_id (= card-id card_id)
                                         :series  (= [series-id-1 series-id-2] series))])
          empty-dashboard      {:name                "Revert Test"
                                :description         "something"
                                :auto_apply_filters  true
                                :collection_id       nil
                                :cache_ttl           nil
                                :cards               []
                                :tabs                []
                                :archived            false
                                :collection_position nil
                                :enable_embedding    false
                                :embedding_params    nil
                                :parameters          []}
          serialized-dashboard (revision/serialize-instance Dashboard (:id dashboard) dashboard)]
      (testing "original state"
        (is (= {:name                "Test Dashboard"
                :description         nil
                :cache_ttl           nil
                :auto_apply_filters  true
                :collection_id       nil
                :cards               [{:size_x                 4
                                       :size_y                 4
                                       :row                    0
                                       :col                    0
                                       :id                     true
                                       :card_id                true
                                       :series                 true
                                       :dashboard_tab_id       nil
                                       :action_id              nil
                                       :parameter_mappings     []
                                       :visualization_settings {}
                                       :dashboard_id           dashboard-id}]
                :tabs                []
                :archived            false
                :collection_position nil
                :enable_embedding    false
                :embedding_params    nil
                :parameters          []}
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
        (is (= {:name                "Test Dashboard"
                :description         nil
                :cache_ttl           nil
                :auto_apply_filters  true
                :collection_id       nil
                :cards               [{:size_x                 4
                                       :size_y                 4
                                       :row                    0
                                       :col                    0
                                       :id                     false
                                       :card_id                true
                                       :series                 true
                                       :dashboard_tab_id       nil
                                       :action_id              nil
                                       :parameter_mappings     []
                                       :visualization_settings {}
                                       :dashboard_id           dashboard-id}]
                :tabs                []
                :archived            false
                :collection_position nil
                :enable_embedding    false
                :embedding_params    nil
                :parameters          []}
               (update (revision/serialize-instance Dashboard dashboard-id (t2/select-one Dashboard :id dashboard-id))
                       :cards check-ids))))
      (testing "revert back to the empty state"
        (revision/revert-to-revision! Dashboard dashboard-id (test.users/user->id :crowberto) empty-dashboard)
        (is (= empty-dashboard
               (revision/serialize-instance Dashboard dashboard-id (t2/select-one Dashboard :id dashboard-id))))))))

(defn- create-dashboard-revision!
  "Fetch the latest version of a Dashboard and save a revision entry for it. Returns the fetched Dashboard."
  [dash-id is-creation?]
  (revision/push-revision!
   {:object       (t2/select-one Dashboard :id dash-id)
    :entity       Dashboard
    :id           dash-id
    :user-id      (mt/user->id :crowberto)
    :is-creation? is-creation?}))

(defn- revert-to-previous-revision
  "Revert to a previous revision for a model.
  `n` is the number of revisions to revert back to.
  `n=1` means do nothing (i.e. revert to the current revision).

  To revert 1 action, you should have n=2."
  [model model-id n]
  (assert (> n 1), "n = 1 means revert to the current revision, which is a no-op.")
  (let [ids (t2/select-pks-vec Revision :model (name model) :model_id model-id {:order-by [[:id :desc]]
                                                                                :limit    n})]
   (assert (= n (count ids)), "There are less revisions than required to revert")
   (revision/revert! {:entity model :id model-id :user-id (mt/user->id :crowberto) :revision-id (last ids)})))

(deftest revert-dashboard-with-tabs-basic-test
  (testing "revert adding tabs"
    (t2.with-temp/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
      ;; 0. create a dashboard
      (create-dashboard-revision! dashboard-id true)


      ;; 1. add 2 tabs
      (let [[tab-1-id tab-2-id] (t2/insert-returning-pks! :model/DashboardTab [{:name         "Tab 1"
                                                                                :position     0
                                                                                :dashboard_id dashboard-id}
                                                                               {:name         "Tab 2"
                                                                                :position     1
                                                                                :dashboard_id dashboard-id}])
            _                   (create-dashboard-revision! dashboard-id false)

            ;; 2. add another tab for revision
            tab-3-id            (first (t2/insert-returning-pks! :model/DashboardTab [{:name         "Tab 3"
                                                                                       :position     2
                                                                                       :dashboard_id dashboard-id}]))]
        (create-dashboard-revision! dashboard-id false)

        ;; check to make sure we have everything setup before testing
        (is (=? [{:id tab-1-id :name "Tab 1" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}
                 {:id tab-3-id :name "Tab 3" :position 2}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})))
        ;; revert
        (revert-to-previous-revision Dashboard dashboard-id 2)
        (is (=? [{:id tab-1-id :name "Tab 1" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))))))

  (testing "revert renaming tabs"
    (t2.with-temp/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
      ;; 0. create a dashboard
      (create-dashboard-revision! dashboard-id true)


      ;; 1. add 2 tabs
      (let [[tab-1-id tab-2-id] (t2/insert-returning-pks! :model/DashboardTab [{:name         "Tab 1"
                                                                                :position     0
                                                                                :dashboard_id dashboard-id}
                                                                               {:name         "Tab 2"
                                                                                :position     1
                                                                                :dashboard_id dashboard-id}])]
        (create-dashboard-revision! dashboard-id false)

        ;; 2. update a tab name
        (t2/update! :model/DashboardTab tab-1-id {:name "Tab 1 with new name"})
        (create-dashboard-revision! dashboard-id false)

        ;; check to make sure we have everything setup before testing
        (is (=? [{:id tab-1-id :name "Tab 1 with new name" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})))
        ;; revert
        (revert-to-previous-revision Dashboard dashboard-id 2)
        (is (=? [{:id tab-1-id :name "Tab 1" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))))))

 (testing "revert deleting tabs"
   (t2.with-temp/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
     ;; 0. create a dashboard
     (create-dashboard-revision! dashboard-id true)


     ;; 1. add 2 tabs
     (let [[tab-1-id tab-2-id] (t2/insert-returning-pks! :model/DashboardTab [{:name         "Tab 1"
                                                                               :position     0
                                                                               :dashboard_id dashboard-id}
                                                                              {:name         "Tab 2"
                                                                               :position     1
                                                                               :dashboard_id dashboard-id}])]
       (create-dashboard-revision! dashboard-id false)

       ;; 2. delete the 1st tab and re-position the second tab
       (t2/delete! :model/DashboardTab tab-1-id)
       (t2/update! :model/DashboardTab tab-2-id {:position 0})
       (create-dashboard-revision! dashboard-id false)

       ;; check to make sure we have everything setup before testing
       (is (=? [{:id tab-2-id :name "Tab 2" :position 0}]
               (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})))
       ;; revert
       (revert-to-previous-revision Dashboard dashboard-id 2)
       (is (=? [{:id (mt/malli=? [:fn pos-int?]) :name "Tab 1" :position 0}
                {:id tab-2-id :name "Tab 2" :position 1}]
               (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})))))))

(deftest revert-dashboard-with-tabs-advanced-test
  (t2.with-temp/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
    ;; 0. create a dashboard
    (create-dashboard-revision! dashboard-id true)

    ;; 1. add 2 tabs, each with 2 cards
    (let [[tab-1-id tab-2-id] (t2/insert-returning-pks! :model/DashboardTab [{:name         "Tab 1"
                                                                              :position     0
                                                                              :dashboard_id dashboard-id}
                                                                             {:name         "Tab 2"
                                                                              :position     1
                                                                              :dashboard_id dashboard-id}])
          [card-1-tab-1 card-2-tab-1] (t2/insert-returning-pks! :model/DashboardCard
                                                                [{:dashboard_id     dashboard-id
                                                                  :dashboard_tab_id tab-1-id
                                                                  :row              0
                                                                  :col              0
                                                                  :size_x           4
                                                                  :size_y           4}
                                                                 {:dashboard_id     dashboard-id
                                                                  :dashboard_tab_id tab-1-id
                                                                  :row              4
                                                                  :col              4
                                                                  :size_x           4
                                                                  :size_y           4}
                                                                 {:dashboard_id     dashboard-id
                                                                  :dashboard_tab_id tab-2-id
                                                                  :row              0
                                                                  :col              0
                                                                  :size_x           4
                                                                  :size_y           4}
                                                                 {:dashboard_id     dashboard-id
                                                                  :dashboard_tab_id tab-2-id
                                                                  :row              4
                                                                  :col              4
                                                                  :size_x           4
                                                                  :size_y           4}])]
      (create-dashboard-revision! dashboard-id false)

      ;; 2.a: tab 1: delete the 2nd card, add 2 cards and update position of one card,
      (t2/insert! :model/DashboardCard [{:dashboard_id     dashboard-id
                                         :dashboard_tab_id tab-1-id
                                         :row              0
                                         :col              0
                                         :size_x           4
                                         :size_y           4}
                                        {:dashboard_id     dashboard-id
                                         :dashboard_tab_id tab-1-id
                                         :row              0
                                         :col              0
                                         :size_x           4
                                         :size_y           4}])
      (t2/delete! :model/DashboardCard card-2-tab-1)
      (t2/update! :model/DashboardCard card-1-tab-1 {:row 10 :col 10})

      ;; 2.b: delete tab 2
      (t2/delete! :model/DashboardTab tab-2-id)

      ;; 2.c: create a new tab with 1 card
      (let [new-tab-id (t2/insert-returning-pks! :model/DashboardTab {:name         "Tab 3"
                                                                      :position     1
                                                                      :dashboard_id dashboard-id})]
        (t2/insert! :model/DashboardCard {:dashboard_id     dashboard-id
                                          :dashboard_tab_id new-tab-id
                                          :row              0
                                          :col              0
                                          :size_x           4
                                          :size_y           4}))
      (create-dashboard-revision! dashboard-id false)

     ;; revert
     (revert-to-previous-revision Dashboard dashboard-id 2)
     (testing "tab 1 should have 2 cards"
       (is (= 2 (t2/count :model/DashboardCard :dashboard_tab_id tab-1-id)))
       (testing "and position of first card is (0,0)"
         (is (=? {:row 0
                  :col 0}
                 (t2/select-one :model/DashboardCard card-1-tab-1)))))

     (testing "tab \"Tab 2\" is restored"
       (let [new-tab-2 (t2/select-one :model/DashboardTab :dashboard_id dashboard-id :name "Tab 2")]
        (is (= 1 (:position new-tab-2)))

        (testing "with its cards"
          (is (= 2 (t2/count :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id (:id new-tab-2)))))))

     (testing "there are no \"Tab 3\""
       (is (false? (t2/exists? :model/DashboardTab :dashboard_id dashboard-id :name "Tab 3")))))))

(deftest revert-dashboard-skip-archived-or-deleted-card-test
  (t2.with-temp/with-temp [:model/Dashboard {dashboard-id :id}          {:name "A dashboard"}
                           :model/Card      {will-be-archived-card :id} {}
                           :model/Card      {will-be-deleted-card :id}  {}
                           :model/Card      {unchanged-card       :id}  {}]
    ;; 0. create a dashboard
    (create-dashboard-revision! dashboard-id true)
    ;; 1. add 3 cards and 1 text card
    (t2/insert! :model/DashboardCard
                [{:dashboard_id     dashboard-id
                  :dashboard_tab_id nil
                  :card_id          will-be-archived-card
                  :row              0
                  :col              0
                  :size_x           4
                  :size_y           4}
                 {:dashboard_id     dashboard-id
                  :dashboard_tab_id nil
                  :card_id          will-be-deleted-card
                  :row              4
                  :col              4
                  :size_x           4
                  :size_y           4}
                 {:dashboard_id     dashboard-id
                  :dashboard_tab_id nil
                  :card_id          unchanged-card
                  :row              0
                  :col              0
                  :size_x           4
                  :size_y           4}
                 {:dashboard_id           dashboard-id
                  :dashboard_tab_id       nil
                  :row                    4
                  :col                    4
                  :size_x                 4
                  :size_y                 4
                  :visualization_settings {:text "Metabase"}}])
    (create-dashboard-revision! dashboard-id false)

    ;; 2. delete all the dashcards
    (t2/delete! :model/DashboardCard :dashboard_id dashboard-id)
    (create-dashboard-revision! dashboard-id false)

    (t2/delete! :model/Card will-be-deleted-card)
    (t2/update! :model/Card :id will-be-archived-card {:archived true})

    (testing "revert should not include archived or deleted card ids (#34884)"
      (revert-to-previous-revision Dashboard dashboard-id 2)
      (is (=? #{{:card_id                unchanged-card
                 :visualization_settings {}}
                {:card_id                nil
                 :visualization_settings {:text "Metabase"}}}
              (t2/select-fn-set #(select-keys % [:card_id :visualization_settings])
                                :model/DashboardCard :dashboard_id dashboard-id))))))

(deftest public-sharing-test
  (testing "test that a Dashboard's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (t2.with-temp/with-temp [Dashboard dashboard {:public_uuid (str (random-uuid))}]
        (is (=? u/uuid-regex
                (:public_uuid dashboard)))))

    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (t2.with-temp/with-temp [Dashboard dashboard {:public_uuid (str (random-uuid))}]
          (is (= nil
                 (:public_uuid dashboard))))))))

(def default-parameter
  {:id   "_CATEGORY_NAME_"
   :type "category"
   :name "Category Name"
   :slug "category_name"})

(deftest migrate-parameters-with-linked-filters-and-values-source-type-test
  (testing "test that a Dashboard's :parameters filterParameters are cleared if the :values_source_type is not nil"
    (doseq [[values_source_type
             keep-filtering-parameters?] {"card"        false
                                          "static-list" false
                                          nil           true}]
      (testing (format "\nvalues_source_type=%s" values_source_type)
       (mt/with-temp [:model/Dashboard dashboard {:parameters [(merge
                                                                default-parameter
                                                                {:filteringParameters ["other-param-id"]
                                                                 :values_source_type  values_source_type})]}]
         (let [parameter (first (:parameters dashboard))]
           (if keep-filtering-parameters?
             (is (= ["other-param-id"]
                    (:filteringParameters parameter)))
             (is (not (contains? parameter :filteringParameters))))))))))

(deftest migrate-parameters-with-linked-filters-and-values-query-type-test
  (testing "test that a Dashboard's :parameters filterParameters are cleared if the :values_query_type is 'none'"
    (doseq [[values_query_type
             keep-filtering-parameters?] {"none" false
                                          "list" true}]
      (testing (format "\nvalues_query_type=%s" values_query_type)
       (mt/with-temp [:model/Dashboard dashboard {:parameters [(merge
                                                                default-parameter
                                                                {:filteringParameters ["other-param-id"]
                                                                 :values_query_type   values_query_type})]}]
         (let [parameter (first (:parameters dashboard))]
           (if keep-filtering-parameters?
             (is (= ["other-param-id"]
                    (:filteringParameters parameter)))
             (is (not (contains? parameter :filteringParameters))))))))))

(deftest migrate-parameters-empty-name-test
  (testing "test that a Dashboard's :parameters is selected with a non-nil name and slug"
    (doseq [[name slug] [["" ""] ["" "slug"] ["name" ""]]]
      (mt/with-temp [:model/Dashboard dashboard {:parameters [(merge
                                                               default-parameter
                                                               {:name name
                                                                :slug slug})]}]
        (is (=? {:name "unnamed"
                 :slug "unnamed"}
                (first (:parameters dashboard))))))))

(deftest post-update-test
  (t2.with-temp/with-temp [Collection    {collection-id-1 :id} {}
                           Collection    {collection-id-2 :id} {}
                           Dashboard     {dashboard-id :id}    {:name "Lucky the Pigeon's Lucky Stuff", :collection_id collection-id-1}
                           Card          {card-id :id}         {}
                           Pulse         {pulse-id :id}        {:dashboard_id dashboard-id, :collection_id collection-id-1}
                           DashboardCard {dashcard-id :id}     {:dashboard_id dashboard-id, :card_id card-id}
                           PulseCard     _                     {:pulse_id pulse-id, :card_id card-id, :dashboard_card_id dashcard-id}]
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
  (testing "A new dashboard creates a new ParameterCard"
    (t2.with-temp/with-temp [Card      {card-id :id}      {}
                             Dashboard {dashboard-id :id} {:parameters [(merge default-parameter
                                                                               {:values_source_type    "card"
                                                                                :values_source_config {:card_id card-id}})]}]
      (is (=? {:card_id                   card-id
               :parameterized_object_type :dashboard
               :parameterized_object_id   dashboard-id
               :parameter_id              "_CATEGORY_NAME_"}
              (t2/select-one 'ParameterCard :card_id card-id)))))

  (testing "Adding a card_id creates a new ParameterCard"
    (t2.with-temp/with-temp [Card      {card-id :id}      {}
                             Dashboard {dashboard-id :id} {:parameters [default-parameter]}]
      (is (nil? (t2/select-one 'ParameterCard :card_id card-id)))
      (t2/update! Dashboard dashboard-id {:parameters [(merge default-parameter
                                                              {:values_source_type    "card"
                                                               :values_source_config {:card_id card-id}})]})
      (is (=? {:card_id                   card-id
               :parameterized_object_type :dashboard
               :parameterized_object_id   dashboard-id
               :parameter_id              "_CATEGORY_NAME_"}
              (t2/select-one 'ParameterCard :card_id card-id)))))

  (testing "Removing a card_id deletes old ParameterCards"
    (t2.with-temp/with-temp [Card      {card-id :id}      {}
                             Dashboard {dashboard-id :id} {:parameters [(merge default-parameter
                                                                               {:values_source_type    "card"
                                                                                :values_source_config {:card_id card-id}})]}]
        ;; same setup as earlier test, we know the ParameterCard exists right now
      (t2/delete! Dashboard :id dashboard-id)
      (is (nil? (t2/select-one 'ParameterCard :card_id card-id))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-dash-in-collection [f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (t2.with-temp/with-temp [Collection    collection {}
                             Dashboard     dash       {:collection_id (u/the-id collection)}
                             Database      db         {:engine :h2}
                             Table         table      {:db_id (u/the-id db)}
                             Card          card       {:dataset_query {:database (u/the-id db)
                                                                       :type     :query
                                                                       :query    {:source-table (u/the-id table)}}}
                             DashboardCard _          {:dashboard_id (u/the-id dash), :card_id (u/the-id card)}]
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
                   (-> dashboard :dashcards count)))))))))

(deftest validate-collection-namespace-test
  (t2.with-temp/with-temp [Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Dashboard in a non-normal Collection"
      (let [dashboard-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Dashboard can only go in Collections in the \"default\" or :analytics namespace."
               (t2/insert! Dashboard (assoc (t2.with-temp/with-temp-defaults Dashboard) :collection_id collection-id, :name dashboard-name))))
          (finally
            (t2/delete! Dashboard :name dashboard-name)))))

    (testing "Shouldn't be able to move a Dashboard to a non-normal Collection"
      (t2.with-temp/with-temp [Dashboard {card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Dashboard can only go in Collections in the \"default\" or :analytics namespace."
             (t2/update! Dashboard card-id {:collection_id collection-id})))))))

(deftest validate-parameters-test
  (testing "Should validate Dashboard :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with :id and :type keys"
           (t2.with-temp/with-temp [Dashboard _ {:parameters {:a :b}}]))))
    (testing "updating"
      (t2.with-temp/with-temp [Dashboard {:keys [id]} {:parameters []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameters must be a sequence of maps with :id and :type keys"
             (t2/update! Dashboard id {:parameters [{:id 100}]})))))))

(deftest normalize-parameters-test
  (testing ":parameters should get normalized when coming out of the DB"
    (doseq [[target expected] {[:dimension [:field-id 1000]] [:dimension [:field 1000 nil]]
                               [:field-id 1000]              [:field 1000 nil]}]
      (testing (format "target = %s" (pr-str target))
        (mt/with-temp [Card      {card-id :id} {}
                       Dashboard {dashboard-id :id} {:parameters [{:name   "Category Name"
                                                                   :slug   "category_name"
                                                                   :id     "_CATEGORY_NAME_"
                                                                   :type   "category"
                                                                   :values_query_type    "list"
                                                                   :values_source_type   "card"
                                                                   :values_source_config {:card_id card-id
                                                                                          :value_field [:field 2 nil]}
                                                                   :target target}]}]
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
    (t2.with-temp/with-temp [Dashboard {dashboard-id :id} {:parameters [{:name   "Category Name"
                                                                         :slug   "category_name"
                                                                         :id     "_CATEGORY_NAME_"
                                                                         :type   "category"}]}]
      (is (=? [{:name                 "Category Name"
                :slug                 "category_name"
                :id                   "_CATEGORY_NAME_"
                :type                 :category}]
              (t2/select-one-fn :parameters Dashboard :id dashboard-id)))))

  (testing "shoudld not override if existsed "
    (mt/with-temp [Card      {card-id :id} {}
                   Dashboard {dashboard-id :id} {:parameters [{:name   "Category Name"
                                                               :slug   "category_name"
                                                               :id     "_CATEGORY_NAME_"
                                                               :type   "category"
                                                               :values_query_type    "list"
                                                               :values_source_type   "card"
                                                               :values_source_config {:card_id card-id
                                                                                      :value_field [:field 2 nil]}}]}]
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
      (t2.with-temp/with-temp [Collection c1   {:name "top level" :location "/" :created_at now}
                               Dashboard  dash {:name "my dashboard" :collection_id (:id c1) :created_at now}]
        (is (= "8cbf93b7"
               (serdes/raw-hash ["my dashboard" (serdes/identity-hash c1) now])
               (serdes/identity-hash dash)))))))

(deftest descendants-test
  (testing "dashboard which have parameter's source is another card"
    (t2.with-temp/with-temp [Field     field     {:name "A field"}
                             Card      card      {:name "A card"}
                             Dashboard dashboard {:name       "A dashboard"
                                                  :parameters [{:id "abc"
                                                                :type "category"
                                                                :values_source_type "card"
                                                                :values_source_config {:card_id     (:id card)
                                                                                       :value_field [:field (:id field) nil]}}]}]
      (is (= #{["Card" (:id card)]}
             (serdes/descendants "Dashboard" (:id dashboard))))))

  (testing "dashboard which has a dashcard with an action"
    (mt/with-actions [{:keys [action-id]} {}]
      (mt/with-temp [Dashboard dashboard {:name "A dashboard"}
                     DashboardCard _ {:action_id          action-id
                                      :dashboard_id       (:id dashboard)
                                      :parameter_mappings []}]
        (is (= #{["Action" action-id]}
               (serdes/descendants "Dashboard" (:id dashboard)))))))

  (testing "dashboard in which its dashcards has parameter_mappings to a card"
    (t2.with-temp/with-temp [Card          card1     {:name "Card attached to dashcard"}
                             Card          card2     {:name "Card attached to parameters"}
                             Dashboard     dashboard {:parameters [{:name "Category Name"
                                                                    :slug "category_name"
                                                                    :id   "_CATEGORY_NAME_"
                                                                    :type "category"}]}
                             DashboardCard _         {:card_id            (:id card1)
                                                      :dashboard_id       (:id dashboard)
                                                      :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                                            :card_id      (:id card2)
                                                                            :target       [:dimension (mt/$ids $categories.name)]}]}]
      (is (= #{["Card" (:id card1)]
               ["Card" (:id card2)]}
             (serdes/descendants "Dashboard" (:id dashboard)))))))
