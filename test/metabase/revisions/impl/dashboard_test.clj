(ns metabase.revisions.impl.dashboard-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.revisions.impl.dashboard :as impl.dashboard]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ^:parallel serialize-dashboard-test
  (testing "without tabs"
    (mt/with-temp [:model/Dashboard           {dashboard-id :id :as dashboard} {:name "Test Dashboard"}
                   :model/Card                {card-id :id}     {}
                   :model/Card                {series-id-1 :id} {}
                   :model/Card                {series-id-2 :id} {}
                   :model/DashboardCard       {dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}
                   :model/DashboardCardSeries _                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}
                   :model/DashboardCardSeries _                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]
      (is (= {:name                "Test Dashboard"
              :archived_directly   false
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
                                     :inline_parameters      []
                                     :visualization_settings {}
                                     :dashboard_id           dashboard-id}]
              :tabs                []
              :archived            false
              :collection_position nil
              :enable_embedding    false
              :embedding_type      nil
              :embedding_params    nil
              :parameters          []
              :width               "fixed"}
             (update (revision/serialize-instance :model/Dashboard (:id dashboard) dashboard)
                     :cards
                     (fn [[{:keys [id card_id series], :as card}]]
                       [(assoc card
                               :id      (= dashcard-id id)
                               :card_id (= card-id card_id)
                               :series  (= [series-id-1 series-id-2] series))])))))))

(deftest ^:parallel serialize-dashboard-with-tabs-test
  (testing "with tabs"
    (mt/with-temp [:model/Dashboard           {dashboard-id :id :as dashboard} {:name "Test Dashboard"}
                   :model/DashboardTab {tab-id :id}                     {:dashboard_id dashboard-id :name "Test Tab" :position 0}
                   :model/DashboardCard       {dashcard-id :id}                {:dashboard_id dashboard-id :dashboard_tab_id tab-id}]
      (is (=? {:name                       "Test Dashboard"
               :auto_apply_filters         true
               :collection_id              nil
               :description                nil
               :cache_ttl                  nil
               :cards                      [{:size_x           4
                                             :size_y           4
                                             :row              0
                                             :col              0
                                             :id               dashcard-id
                                             :dashboard_tab_id tab-id}]
               :tabs                       [{:id       tab-id
                                             :name     "Test Tab"
                                             :position 0}]}
              (revision/serialize-instance :model/Dashboard (:id dashboard) dashboard))))))

(deftest ^:parallel diff-dashboards-str-test
  (testing "update general info ---"
    (are [x y expected] (= expected
                           (u/build-sentence (revision/diff-strings :model/Dashboard x y)))
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
                           (u/build-sentence (revision/diff-strings :model/Dashboard x y)))
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
             :model/Dashboard
             {:name "Apple"}
             {:name          "Apple"
              :collection_id nil}))))

    (mt/with-temp
      [:model/Collection {coll-id :id} {:name "New collection"}]
      (is (= "moved this Dashboard to New collection."
             (u/build-sentence
              (revision/diff-strings
               :model/Dashboard
               {:name "Apple"}
               {:name          "Apple"
                :collection_id coll-id})))))
    (mt/with-temp
      [:model/Collection {coll-id-1 :id} {:name "Old collection"}
       :model/Collection {coll-id-2 :id} {:name "New collection"}]
      (is (= "moved this Dashboard from Old collection to New collection."
             (u/build-sentence
              (revision/diff-strings
               :model/Dashboard
               {:name          "Apple"
                :collection_id coll-id-1}
               {:name          "Apple"
                :collection_id coll-id-2})))))))

(deftest ^:parallel diff-dashboards-str-update-tabs-test
  (testing "update tabs"
    (are [x y expected] (= expected
                           (u/build-sentence (revision/diff-strings :model/Dashboard x y)))
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
                                        (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id)
                                        ;; create one before the update
                                        (create-dashboard-revision! dashboard-id true))]
    (testing "dashboard ---"
      (mt/with-temp
        [:model/Dashboard dashboard {:name                "A Dashboard"
                                     :description         "An insightful Dashboard"
                                     :collection_position 0
                                     :position            10
                                     :cache_ttl           1000
                                     :parameters          [{:name "Category Name"
                                                            :slug "category_name"
                                                            :id   "_CATEGORY_NAME_"
                                                            :type "category"}]}
         :model/Collection       coll      {:name "A collection"}]
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (let [columns    (set/difference (set (keys dashboard)) @#'impl.dashboard/excluded-columns-for-dashboard-revision)
                update-col (fn [col value]
                             (cond
                               (= col :collection_id)              (:id coll)
                               (= col :parameters)                 (cons {:name "Category ID"
                                                                          :slug "category_id"
                                                                          :id   "_CATEGORY_ID_"
                                                                          :type "number"}
                                                                         value)
                               (= col :made_public_by_id)          (mt/user->id :crowberto)
                               (= col :embedding_params)           {:category_name "locked"}
                               (= col :embedding_type)             "static-legacy"
                               (= col :public_uuid)                (str (random-uuid))
                               (int? value)                        (inc value)
                               (boolean? value)                    (not value)
                               (string? value)                     (str value "_changed")))]
            (doseq [col columns]
              (let [before  (select-keys dashboard [col])
                    changes {col (update-col col (get dashboard col))}]
                (clean-revisions-for-dashboard (:id dashboard))
                ;; do the update
                (t2/update! :model/Dashboard (:id dashboard) changes)
                (create-dashboard-revision! (:id dashboard) false)

                (testing (format "we should track when %s changes" col)
                  (is (= 2 (t2/count :model/Revision :model "Dashboard" :model_id (:id dashboard)))))

                ;; we don't need a description for made_public_by_id because whenever this field changes public_uuid
                ;; will changes and we had a description for it. Same is true for `archived_directly` -
                ;; `archived` will always change with it.
                (when-not (#{:made_public_by_id :archived_directly} col)
                  (testing (format "we should have a revision description for %s" col)
                    (is (some? (u/build-sentence
                                (revision/diff-strings
                                 :model/Dashboard
                                 before
                                 changes))))))))))))))

(deftest record-revision-and-description-completeness-test-2
  (let [clean-revisions-for-dashboard (fn [dashboard-id]
                                        ;; we'll automatically delete old revisions if we have more than [[revision/max-revisions]]
                                        ;; revisions for an instance, so let's clear everything to make it easier to test
                                        (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id)
                                        ;; create one before the update
                                        (create-dashboard-revision! dashboard-id true))]
    (testing "dashboardcard ---"
      (mt/with-temp
        [:model/Dashboard     dashboard {:name "A Dashboard"}
         :model/DashboardCard dashcard  {:dashboard_id (:id dashboard)}
         :model/DashboardTab  dashtab   {:dashboard_id (:id dashboard)}
         :model/Card          card      {:name "A Card" :type :model}
         :model/Action               action    {:model_id (:id card)
                                                :type     :implicit
                                                :name     "An action"}]
        (let [columns    (disj (set/difference (set (keys dashcard)) (set @#'impl.dashboard/excluded-columns-for-dashcard-revision))
                               :dashboard_id :id)
              update-col (fn [col value]
                           (cond
                             (= col :action_id)              (:id action)
                             (= col :card_id)                (:id card)
                             (= col :dashboard_tab_id)       (:id dashtab)
                             (= col :parameter_mappings)     [{:parameter_id "_CATEGORY_NAME_"
                                                               :target       [:dimension (mt/$ids $categories.name)]}]
                             (= col :visualization_settings) {:text "now it's a text card"}
                             (int? value)                    (inc value)
                             (boolean? value)                (not value)
                             (string? value)                 (str value "_changed")))]
          (doseq [col columns]
            (clean-revisions-for-dashboard (:id dashboard))
           ;; do the update
            (t2/update! :model/DashboardCard (:id dashcard) {col (update-col col (get dashcard col))})
            (create-dashboard-revision! (:id dashboard) false)

            (testing (format "we should track when %s changes" col)
              (is (= 2 (t2/count :model/Revision :model "Dashboard" :model_id (:id dashboard)))))))))))

(deftest record-revision-and-description-completeness-test-3
  (let [clean-revisions-for-dashboard (fn [dashboard-id]
                                        ;; we'll automatically delete old revisions if we have more than [[revision/max-revisions]]
                                        ;; revisions for an instance, so let's clear everything to make it easier to test
                                        (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id)
                                        ;; create one before the update
                                        (create-dashboard-revision! dashboard-id true))]
    (testing "dashboardtab ---"
      (mt/with-temp
        [:model/Dashboard     dashboard {:name "A Dashboard"}
         :model/DashboardTab  dashtab   {:dashboard_id (:id dashboard)}]
        (let [columns    (disj (set/difference (set (keys dashtab)) (set @#'impl.dashboard/excluded-columns-for-dashboard-tab-revision))
                               :dashboard_id :id)
              update-col (fn [_col value]
                           (cond
                             (int? value)    (inc value)
                             (string? value) (str value "_changed")))]
          (doseq [col columns]
            (clean-revisions-for-dashboard (:id dashboard))
           ;; do the update
            (t2/update! :model/DashboardTab (:id dashtab) {col (update-col col (get dashtab col))})
            (create-dashboard-revision! (:id dashboard) false)

            (testing (format "we should track when %s changes" col)
              (is (= 2 (t2/count :model/Revision :model "Dashboard" :model_id (:id dashboard)))))))))))

(deftest revert-dashboard!-test
  (mt/with-temp [:model/Dashboard           {dashboard-id :id, :as dashboard}    {:name "Test Dashboard"}
                 :model/Card                {card-id :id}                        {}
                 :model/Card                {series-id-1 :id}                    {}
                 :model/Card                {series-id-2 :id}                    {}
                 :model/DashboardCard       {dashcard-id :id :as dashboard-card} {:dashboard_id dashboard-id, :card_id card-id}
                 :model/DashboardCardSeries _                                    {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}
                 :model/DashboardCardSeries _                                    {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]
    (let [check-ids            (fn [[{:keys [id card_id series] :as card}]]
                                 [(assoc card
                                         :id      (= dashcard-id id)
                                         :card_id (= card-id card_id)
                                         :series  (= [series-id-1 series-id-2] series))])
          empty-dashboard      {:name                "Revert Test"
                                :archived_directly   false
                                :description         "something"
                                :auto_apply_filters  true
                                :collection_id       nil
                                :cache_ttl           nil
                                :cards               []
                                :tabs                []
                                :archived            false
                                :collection_position nil
                                :enable_embedding    false
                                :embedding_type      nil
                                :embedding_params    nil
                                :parameters          []
                                :width               "fixed"}
          serialized-dashboard (revision/serialize-instance :model/Dashboard (:id dashboard) dashboard)]
      (testing "original state"
        (is (= {:name                "Test Dashboard"
                :archived_directly   false
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
                                       :inline_parameters      []
                                       :visualization_settings {}
                                       :dashboard_id           dashboard-id}]
                :tabs                []
                :archived            false
                :collection_position nil
                :enable_embedding    false
                :embedding_type      nil
                :embedding_params    nil
                :parameters          []
                :width               "fixed"}
               (update serialized-dashboard :cards check-ids))))
      (testing "delete the dashcard and modify the dash attributes"
        (dashboard-card/delete-dashboard-cards! [(:id dashboard-card)])
        (t2/update! :model/Dashboard dashboard-id
                    {:name               "Revert Test"
                     :auto_apply_filters false
                     :description        "something"})
        (testing "capture updated Dashboard state"
          (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)]
            (is (= (assoc empty-dashboard :auto_apply_filters false)
                   (revision/serialize-instance :model/Dashboard (:id dashboard) dashboard))))))
      (testing "now do the reversion; state should return to original"
        (revision/revert-to-revision! :model/Dashboard dashboard-id (test.users/user->id :crowberto) serialized-dashboard)
        (is (= {:name                "Test Dashboard"
                :archived_directly   false
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
                                       :inline_parameters      []
                                       :visualization_settings {}
                                       :dashboard_id           dashboard-id}]
                :tabs                []
                :archived            false
                :collection_position nil
                :enable_embedding    false
                :embedding_type      nil
                :embedding_params    nil
                :parameters          []
                :width               "fixed"}
               (update (revision/serialize-instance :model/Dashboard dashboard-id (t2/select-one :model/Dashboard :id dashboard-id))
                       :cards check-ids))))
      (testing "revert back to the empty state"
        (revision/revert-to-revision! :model/Dashboard dashboard-id (test.users/user->id :crowberto) empty-dashboard)
        (is (= empty-dashboard
               (revision/serialize-instance :model/Dashboard dashboard-id (t2/select-one :model/Dashboard :id dashboard-id))))))))

(defn- create-dashboard-revision!
  "Fetch the latest version of a Dashboard and save a revision entry for it. Returns the fetched Dashboard."
  [dash-id is-creation?]
  (revision/push-revision!
   {:object       (t2/select-one :model/Dashboard :id dash-id)
    :entity       :model/Dashboard
    :id           dash-id
    :user-id      (mt/user->id :crowberto)
    :is-creation? is-creation?}))

(defn- revert-to-previous-revision!
  "Revert to a previous revision for a model.
  `n` is the number of revisions to revert back to.
  `n=1` means do nothing (i.e. revert to the current revision).

  To revert 1 action, you should have n=2."
  [model model-id n]
  (assert (> n 1), "n = 1 means revert to the current revision, which is a no-op.")
  (let [ids (t2/select-pks-vec :model/Revision :model (name model) :model_id model-id {:order-by [[:id :desc]]
                                                                                       :limit    n})]
    (assert (= n (count ids)), "There are less revisions than required to revert")
    (revision/revert! {:entity model :id model-id :user-id (mt/user->id :crowberto) :revision-id (last ids)})))

(deftest revert-dashboard-with-tabs-basic-test
  (testing "revert adding tabs"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
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
        (revert-to-previous-revision! :model/Dashboard dashboard-id 2)
        (is (=? [{:id tab-1-id :name "Tab 1" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))))))

  (testing "revert renaming tabs"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
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
        (revert-to-previous-revision! :model/Dashboard dashboard-id 2)
        (is (=? [{:id tab-1-id :name "Tab 1" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))))))

  (testing "revert deleting tabs"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
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
        (revert-to-previous-revision! :model/Dashboard dashboard-id 2)
        (is (=? [{:id (mt/malli=? [:fn pos-int?]) :name "Tab 1" :position 0}
                 {:id tab-2-id :name "Tab 2" :position 1}]
                (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})))))))

(deftest revert-dashboard-with-tabs-advanced-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
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
      (revert-to-previous-revision! :model/Dashboard dashboard-id 2)
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
  (mt/with-temp [:model/Dashboard {dashboard-id :id}          {:name "A dashboard"}
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
      (revert-to-previous-revision! :model/Dashboard dashboard-id 2)
      (is (=? #{{:card_id                unchanged-card
                 :visualization_settings {}}
                {:card_id                nil
                 :visualization_settings {:text "Metabase"}}}
              (t2/select-fn-set #(select-keys % [:card_id :visualization_settings])
                                :model/DashboardCard :dashboard_id dashboard-id))))))

(deftest revert-dashboard-with-deleted-parameter-card-source-test
  (testing "revert should clean up parameters that reference deleted or archived cards (metabase#UXW-2494)"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name       "A dashboard"
                                                        :parameters []}
                   :model/Card      {value-source-card :id} {:name "Value source question"}
                   :model/Card      {will-remain-card :id}  {:name "Will remain question"}]
      ;; 0. create initial dashboard revision
      (create-dashboard-revision! dashboard-id true)

      ;; 1. add two parameters - one with a card that will be deleted, one with a card that stays
      (t2/update! :model/Dashboard dashboard-id
                  {:parameters [{:id                    "deleted-source"
                                 :name                  "Filter with deleted source"
                                 :slug                  "deleted_source"
                                 :type                  "category"
                                 :values_source_type    "card"
                                 :values_source_config  {:card_id     value-source-card
                                                         :value_field [:field 1 nil]}}
                                {:id                    "valid-source"
                                 :name                  "Filter with valid source"
                                 :slug                  "valid_source"
                                 :type                  "category"
                                 :values_source_type    "card"
                                 :values_source_config  {:card_id     will-remain-card
                                                         :value_field [:field 2 nil]}}
                                {:id   "no-source"
                                 :name "Filter without card source"
                                 :slug "no_source"
                                 :type "category"}]})
      (create-dashboard-revision! dashboard-id false)

      ;; 2. remove the parameters (simulating user changing the filter settings)
      (t2/update! :model/Dashboard dashboard-id {:parameters []})
      (create-dashboard-revision! dashboard-id false)

      ;; 3. delete one card and archive another scenario - here we just delete
      (t2/delete! :model/Card value-source-card)

      ;; 4. revert to the revision that had parameters referencing the now-deleted card
      (revert-to-previous-revision! :model/Dashboard dashboard-id 2)

      (let [reverted-params (:parameters (t2/select-one :model/Dashboard :id dashboard-id))]
        (testing "parameter with deleted card source should have its source config removed"
          (let [deleted-source-param (first (filter #(= "deleted-source" (:id %)) reverted-params))]
            (is (some? deleted-source-param) "Parameter should still exist")
            (is (nil? (:values_source_type deleted-source-param)) "values_source_type should be removed")
            (is (nil? (:values_source_config deleted-source-param)) "values_source_config should be removed")))

        (testing "parameter with valid card source should remain unchanged"
          (let [valid-source-param (first (filter #(= "valid-source" (:id %)) reverted-params))]
            (is (some? valid-source-param) "Parameter should exist")
            (is (= :card (:values_source_type valid-source-param)) "values_source_type should be preserved")
            (is (= will-remain-card (get-in valid-source-param [:values_source_config :card_id]))
                "card_id should be preserved")))

        (testing "parameter without card source should remain unchanged"
          (let [no-source-param (first (filter #(= "no-source" (:id %)) reverted-params))]
            (is (some? no-source-param) "Parameter should exist")
            (is (nil? (:values_source_type no-source-param)) "values_source_type should remain nil")))))))

(deftest revert-dashboard-with-archived-parameter-card-source-test
  (testing "revert should also clean up parameters that reference archived cards"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name       "A dashboard"
                                                        :parameters []}
                   :model/Card      {will-be-archived-card :id} {:name "Will be archived"}]
      ;; 0. create initial dashboard revision
      (create-dashboard-revision! dashboard-id true)

      ;; 1. add a parameter with a card source
      (t2/update! :model/Dashboard dashboard-id
                  {:parameters [{:id                    "archived-source"
                                 :name                  "Filter with archived source"
                                 :slug                  "archived_source"
                                 :type                  "category"
                                 :values_source_type    "card"
                                 :values_source_config  {:card_id     will-be-archived-card
                                                         :value_field [:field 1 nil]}}]})
      (create-dashboard-revision! dashboard-id false)

      ;; 2. remove the parameters
      (t2/update! :model/Dashboard dashboard-id {:parameters []})
      (create-dashboard-revision! dashboard-id false)

      ;; 3. archive the card
      (t2/update! :model/Card will-be-archived-card {:archived true})

      ;; 4. revert to the revision that had parameters referencing the now-archived card
      (revert-to-previous-revision! :model/Dashboard dashboard-id 2)

      (let [reverted-params (:parameters (t2/select-one :model/Dashboard :id dashboard-id))]
        (testing "parameter with archived card source should have its source config removed"
          (let [archived-source-param (first reverted-params)]
            (is (some? archived-source-param) "Parameter should still exist")
            (is (nil? (:values_source_type archived-source-param)) "values_source_type should be removed")
            (is (nil? (:values_source_config archived-source-param)) "values_source_config should be removed")))))))
