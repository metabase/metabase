(ns metabase.api.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(def ^:private rasta-revision-info
  (delay
    {:id (mt/user->id :rasta), :common_name "Rasta Toucan", :first_name "Rasta", :last_name "Toucan"}))

(defn- get-revisions [entity object-id]
  (for [revision (mt/user-http-request :rasta :get "revision" :entity entity, :id object-id)]
    (dissoc revision :timestamp :id)))

(defn- create-card-revision! [card-id is-creation? user]
  (revision/push-revision!
   {:object       (t2/select-one :model/Card :id card-id)
    :entity       :model/Card
    :id           card-id
    :user-id      (mt/user->id user)
    :is-creation? is-creation?}))

(defn- create-dashboard-revision!
  "Fetch the latest version of a Dashboard and save a revision entry for it. Returns the fetched Dashboard."
  [dash-id is-creation? user]
  (revision/push-revision!
   {:object       (t2/select-one :model/Dashboard :id dash-id)
    :entity       :model/Dashboard
    :id           dash-id
    :user-id      (mt/user->id user)
    :is-creation? is-creation?}))

;;; # GET /revision

; Things we are testing for:
;  1. ordered by timestamp DESC
;  2. :user is hydrated
;  3. :description is calculated

;; case with no revisions (maintains backwards compatibility with old installs before revisions)
(deftest no-revisions-test
  (testing "Loading revisions, where there are no revisions, should work"
    (t2.with-temp/with-temp [:model/Card {:keys [id]}]
      (is (= [{:user {}, :diff nil, :description "modified this.", :has_multiple_changes false}]
             (get-revisions :card id))))))

;; case with single creation revision
(deftest single-revision-test
  (testing "Loading a single revision works"
    (t2.with-temp/with-temp [:model/Card {:keys [id] :as card}]
      (create-card-revision! (:id card) true :rasta)
      (is (=? [{:is_reversion         false
                :is_creation          true
                :message              nil
                :user                 @rasta-revision-info
                :metabase_version     config/mb-version-string
                :diff                 nil
                :has_multiple_changes false
                :description          "created this."}]
              (get-revisions :card id))))))

(deftest get-revision-for-entity-with-revision-exceeds-max-revision-test
  (t2.with-temp/with-temp [:model/Card {:keys [id] :as card} {:name "A card"}]
    (create-card-revision! (:id card) true :rasta)
    (doseq [i (range (inc revision/max-revisions))]
      (t2/update! :model/Card (:id card) {:name (format "New name %d" i)})
      (create-card-revision! (:id card) false :rasta))

    (is (= ["renamed this Card from \"New name 14\" to \"New name 15\"."
            "renamed this Card from \"New name 13\" to \"New name 14\"."
            "renamed this Card from \"New name 12\" to \"New name 13\"."
            "renamed this Card from \"New name 11\" to \"New name 12\"."
            "renamed this Card from \"New name 10\" to \"New name 11\"."
            "renamed this Card from \"New name 9\" to \"New name 10\"."
            "renamed this Card from \"New name 8\" to \"New name 9\"."
            "renamed this Card from \"New name 7\" to \"New name 8\"."
            "renamed this Card from \"New name 6\" to \"New name 7\"."
            "renamed this Card from \"New name 5\" to \"New name 6\"."
            "renamed this Card from \"New name 4\" to \"New name 5\"."
            "renamed this Card from \"New name 3\" to \"New name 4\"."
            "renamed this Card from \"New name 2\" to \"New name 3\"."
            "renamed this Card from \"New name 1\" to \"New name 2\"."
            "modified this."]
           (map :description (get-revisions :card id))))))

;; case with multiple revisions, including reversion
(deftest multiple-revisions-with-reversion-test
  (testing "Creating multiple revisions, with a reversion, works"
    (t2.with-temp/with-temp [:model/Card {:keys [id name], :as card}]
      (create-card-revision! (:id card) true :rasta)
      (t2/update! :model/Card {:name "something else"})
      (create-card-revision! (:id card) false :rasta)
      (t2/insert! :model/Revision
                  :model        "Card"
                  :model_id     id
                  :user_id      (mt/user->id :rasta)
                  :object       (revision/serialize-instance :model/Card (:id card) card)
                  :message      "because i wanted to"
                  :is_creation  false
                  :is_reversion true)
      (is (=? [{:is_reversion         true
                :is_creation          false
                :message              "because i wanted to"
                :user                 @rasta-revision-info
                :metabase_version     config/mb-version-string
                :diff                 {:before {:name "something else"}
                                       :after  {:name name}}
                :description          "reverted to an earlier version."
                :has_multiple_changes false}
               {:is_reversion         false
                :is_creation          false
                :message              nil
                :user                 @rasta-revision-info
                :metabase_version     config/mb-version-string
                :diff                 {:before {:name name}
                                       :after  {:name "something else"}}
                :description          (format "renamed this Card from \"%s\" to \"something else\"." name)
                :has_multiple_changes false}
               {:is_reversion         false
                :is_creation          true
                :message              nil
                :metabase_version     config/mb-version-string
                :user                 @rasta-revision-info
                :diff                 nil
                :description          "created this."
                :has_multiple_changes false}]
              (get-revisions :card id))))))

;;; # POST /revision/revert

(defn- strip-ids
  [objects]
  (mapv #(dissoc % :id) objects))

(def ^:private default-revision-card
  {:size_x                 4
   :size_y                 4
   :row                    0
   :col                    0
   :card_id                nil
   :series                 []
   :dashboard_tab_id       nil
   :action_id              nil
   :parameter_mappings     []
   :visualization_settings {}})

(deftest revert-test
  (testing "Reverting through API works"
    (t2.with-temp/with-temp [:model/Dashboard {:keys [id] :as dash}   {}
                             :model/Card      {card-id :id, :as card} {}]
      (is (=? {:id id}
              (create-dashboard-revision! (:id dash) true :rasta)))
      (let [dashcard (first (t2/insert-returning-instances! :model/DashboardCard
                                                            :dashboard_id id
                                                            :card_id (:id card)
                                                            :size_x 4
                                                            :size_y 4
                                                            :row    0
                                                            :col    0))]
        (is (=? {:id id}
                (create-dashboard-revision! (:id dash) false :rasta)))
        (is (pos? (t2/delete! (t2/table-name :model/DashboardCard) :id (:id dashcard)))))
      (is (=? {:id id}
              (create-dashboard-revision! (:id dash) false :rasta)))
      (testing "Revert to the previous revision, allowed because rasta has permissions on parent collection"
        (let [[_ {previous-revision-id :id}] (revision/revisions :model/Dashboard id)]
          (is (=? {:id          int?
                   :description "reverted to an earlier version."}
                  (mt/user-http-request :rasta :post 200 "revision/revert" {:entity      :dashboard
                                                                            :id          id
                                                                            :revision_id previous-revision-id})))))
      (is (=? [{:is_reversion         true
                :is_creation          false
                :message              nil
                :user                 @rasta-revision-info
                :metabase_version     config/mb-version-string
                :diff                 {:before {:cards nil}
                                       :after  {:cards [(merge default-revision-card {:card_id card-id :dashboard_id id})]}}
                :has_multiple_changes false
                :description          "reverted to an earlier version."}
               {:is_reversion         false
                :is_creation          false
                :message              nil
                :user                 @rasta-revision-info
                :metabase_version     config/mb-version-string
                :diff                 {:before {:cards [(merge default-revision-card {:card_id card-id :dashboard_id id})]}
                                       :after  {:cards nil}}
                :has_multiple_changes false
                :description          "removed a card."}
               {:is_reversion         false
                :is_creation          false
                :message              nil
                :user                 @rasta-revision-info
                :diff                 {:before {:cards nil}
                                       :after  {:cards [(merge default-revision-card {:card_id card-id :dashboard_id id})]}}
                :has_multiple_changes false
                :description          "added a card."}
               {:is_reversion         false
                :is_creation          true
                :message              nil
                :user                 @rasta-revision-info
                :metabase_version     config/mb-version-string
                :diff                 nil
                :has_multiple_changes false
                :description          "created this."}]
              (->> (get-revisions :dashboard id)
                   (mapv (fn [rev]
                           (if-not (:diff rev)
                             rev
                             (if (get-in rev [:diff :before :cards])
                               (update-in rev [:diff :before :cards] strip-ids)
                               (update-in rev [:diff :after :cards] strip-ids)))))))))))

(deftest permission-check-on-revert-test
  (testing "Are permissions enforced by the revert action in the revision api?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {:name "Personal collection"}
                     :model/Dashboard  dashboard {:collection_id (u/the-id collection) :name "Personal dashboard"}]
        (create-dashboard-revision! (:id dashboard) true :crowberto)
        ;; update so that the revision is accepted
        (t2/update! :model/Dashboard :id (:id dashboard) {:name "Personal dashboard edited"})
        (create-dashboard-revision! (:id dashboard) false :crowberto)
        (let [dashboard-id          (u/the-id dashboard)
              [_ {prev-rev-id :id}] (revision/revisions :model/Dashboard dashboard-id)
              update-req            {:entity :dashboard, :id dashboard-id, :revision_id prev-rev-id}]
          ;; rasta should not have permissions to update the dashboard (i.e. revert), because they are not admin and do
          ;; not have any particular permission on the collection where it lives (because of the
          ;; with-non-admin-groups-no-root-collection-perms wrapper)
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post "revision/revert" update-req))))))))

(deftest dashboard-revision-description-test
  (testing "revision description for dashboard are generated correctly"
    (t2.with-temp/with-temp
      [:model/Collection {coll-id :id}      {:name "New Collection"}
       :model/Card       {card-id-1 :id}    {:name "Card 1"}
       :model/Card       {card-id-2 :id}    {:name "Card 2"}
       :model/Dashboard  {dashboard-id :id} {:name "A dashboard"}]
      ;; 0. create the dashboard
      (create-dashboard-revision! dashboard-id true :crowberto)

      ;; 1. rename
      (t2/update! :model/Dashboard :id dashboard-id {:name "New name"})
      (create-dashboard-revision! dashboard-id false :crowberto)

      ;; 2. add description
      (t2/update! :model/Dashboard :id dashboard-id {:description "A beautiful dashboard"})
      (create-dashboard-revision! dashboard-id false :crowberto)

      ;; 3. add 2 cards
      (let [dashcard-ids (t2/insert-returning-pks! :model/DashboardCard [{:dashboard_id dashboard-id
                                                                          :card_id      card-id-1
                                                                          :size_x       4
                                                                          :size_y       4
                                                                          :col          1
                                                                          :row          1}
                                                                         {:dashboard_id dashboard-id
                                                                          :card_id      card-id-2
                                                                          :size_x       4
                                                                          :size_y       4
                                                                          :col          1
                                                                          :row          1}])]
        (create-dashboard-revision! dashboard-id false :crowberto)

        ;; 4. remove 1 card
        (t2/delete! :model/DashboardCard :id (first dashcard-ids))
        (create-dashboard-revision! dashboard-id false :crowberto)

        ;; 5. arrange cards
        (t2/update! :model/DashboardCard :id (second dashcard-ids) {:col 2
                                                                    :row 2})
        (create-dashboard-revision! dashboard-id false :crowberto))

      ;; 6. Move to a new collection
      (t2/update! :model/Dashboard :id dashboard-id {:collection_id coll-id})
      (create-dashboard-revision! dashboard-id false :crowberto)

      ;; 7. revert to an earlier revision
      (let [earlier-revision-id (t2/select-one-pk :model/Revision :model "Dashboard" :model_id dashboard-id {:order-by [[:timestamp :desc]]})]
        (revision/revert! {:entity :model/Dashboard :id dashboard-id :user-id (mt/user->id :crowberto) :revision-id earlier-revision-id}))

      (is (= [{:description          "reverted to an earlier version."
               :has_multiple_changes false}
              {:description          "moved this Dashboard to New Collection.",
               :has_multiple_changes false}
              {:description          "rearranged the cards."
               :has_multiple_changes false}
              {:description          "removed a card."
               :has_multiple_changes false}
              {:description          "added 2 cards."
               :has_multiple_changes false}
              {:description          "added a description."
               :has_multiple_changes false}
              {:description          "renamed this Dashboard from \"A dashboard\" to \"New name\"."
               :has_multiple_changes false}
              {:description          "created this."
               :has_multiple_changes false}]
             (map #(select-keys % [:description :has_multiple_changes])
                  (mt/user-http-request :crowberto :get 200 "revision" :entity "dashboard" :id dashboard-id)))))))

(deftest dashboard-width-revision-diff-test
  (testing "The Dashboard's revision history correctly reports dashboard width changes (#38910)"
    (t2.with-temp/with-temp
        [:model/Dashboard  {dashboard-id :id :as dash} {:name "A dashboard"}
         :model/Revision   _ {:model    "Dashboard"
                              :model_id dashboard-id
                              :user_id  (mt/user->id :crowberto)
                              :object   (assoc dash :width nil)}
         :model/Revision   _ {:model    "Dashboard"
                              :model_id dashboard-id
                              :user_id  (mt/user->id :crowberto)
                              :object   (assoc dash :width "full")}
         :model/Revision   _ {:model    "Dashboard"
                              :model_id dashboard-id
                              :user_id  (mt/user->id :crowberto)
                              :object   (assoc dash :width "fixed")}]
        (is (= ["changed the width setting from full to fixed."
                "changed the width setting."
                "modified this."]
               (map :description
                    (mt/user-http-request :crowberto :get 200 "revision" :entity "dashboard" :id dashboard-id)))))))

(deftest card-revision-description-test
  (testing "revision description for card are generated correctly"
    (t2.with-temp/with-temp
      [:model/Collection {coll-id :id} {:name "New Collection"}
       :model/Card       {card-id :id} {:name                   "A card"
                                        :display                "table"
                                        :dataset_query          (mt/mbql-query venues)
                                        :visualization_settings {}}]
      ;; 0. create the card
      (create-card-revision! card-id true :crowberto)

      ;; 1. rename
      (t2/update! :model/Card :id card-id {:name "New name"})
      (create-card-revision! card-id false :crowberto)

      ;; 2. turn to a model
      (t2/update! :model/Card :id card-id {:type :model})
      (create-card-revision! card-id false :crowberto)

      ;; 3. edit query and metadata
      (t2/update! :model/Card :id card-id {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})
                                           :display       "scalar"})
      (create-card-revision! card-id false :crowberto)

      ;; 4. add description
      (t2/update! :model/Card :id card-id {:description "meaningful number"})
      (create-card-revision! card-id false :crowberto)


      ;; 5. change collection
      (t2/update! :model/Card :id card-id {:collection_id coll-id})
      (create-card-revision! card-id false :crowberto)

      ;; 6. revert to an earlier revision
      (let [earlier-revision-id (t2/select-one-pk :model/Revision :model "Card" :model_id card-id {:order-by [[:timestamp :desc]]})]
        (revision/revert! {:entity :model/Card :id card-id :user-id (mt/user->id :crowberto) :revision-id earlier-revision-id}))

      (is (= [{:description          "reverted to an earlier version.",
               :has_multiple_changes false}
              {:description          "moved this Card to New Collection.",
               :has_multiple_changes false}
              {:description          "added a description."
               :has_multiple_changes false}
              {:description          "changed the display from table to scalar, modified the query and edited the metadata."
               :has_multiple_changes true}
              {:description          "turned this to a model and edited the metadata."
               :has_multiple_changes true}
              {:description          "renamed this Card from \"A card\" to \"New name\"."
               :has_multiple_changes false}
              {:description          "created this."
               :has_multiple_changes false}]
             (map #(select-keys % [:description :has_multiple_changes])
                  (mt/user-http-request :crowberto :get 200 "revision" :entity "card" :id card-id)))))))

(deftest revision-descriptions-are-i18ned-test
  (mt/with-mock-i18n-bundles {"fr" {:messages {"created this" "créé ceci"
                                               "added a description" "ajouté une description"
                                               "renamed {0} from \"{1}\" to \"{2}\"" "renommé {0} de {1} à {2}"
                                               "this {0}" "ce {0}"
                                               "edited this." "édité ceci."
                                               "and" "et"
                                               "Card" "Carte"
                                               "reverted to an earlier version" "est revenu à une version antérieure"}}}
    (mt/with-temporary-setting-values [site-locale "fr"]
      (testing "revisions description are translated"
        (t2.with-temp/with-temp
          [:model/Card       {card-id :id} {:name                   "A card"
                                            :display                "table"
                                            :dataset_query          (mt/mbql-query venues)
                                            :visualization_settings {}}]
          ;; 0. create the card
          (create-card-revision! card-id true :crowberto)

          ;; 1. rename
          (t2/update! :model/Card :id card-id {:description "meaningful number"
                                               :name        "New name"})
          (create-card-revision! card-id false :crowberto)


          ;; 2. revert to an earlier revision
          (let [earlier-revision-id (t2/select-one-pk :model/Revision :model "Card" :model_id card-id {:order-by [[:timestamp :desc]]})]
            (revision/revert! {:entity :model/Card :id card-id :user-id (mt/user->id :crowberto) :revision-id earlier-revision-id}))

          (is (= [{:description          "est revenu à une version antérieure."
                   :has_multiple_changes false}
                  {:description          "renommé ce Carte de A card à New name et ajouté une description."
                   :has_multiple_changes true}
                  {:description          "créé ceci."
                   :has_multiple_changes false}]
                 (map #(select-keys % [:description :has_multiple_changes])
                      (mt/user-http-request :crowberto :get 200 "revision" :entity "card" :id card-id))))
          (t2/delete! :model/Card :id card-id))))))

(deftest revert-does-not-create-new-revision
  (testing "revert a dashboard that previously added cards should not recreate duplicate revisions(#30869)"
    (t2.with-temp/with-temp
      [:model/Dashboard  {dashboard-id :id} {:name "A dashboard"}]
      ;; 0. create the dashboard
      (create-dashboard-revision! dashboard-id true :crowberto)

      ;; 1. add 2 cards
      (t2/insert-returning-pks! :model/DashboardCard [{:dashboard_id dashboard-id
                                                       :size_x       4
                                                       :size_y       4
                                                       :col          1
                                                       :row          1}
                                                      {:dashboard_id dashboard-id
                                                       :size_x       4
                                                       :size_y       4
                                                       :col          1
                                                       :row          1}])
      (create-dashboard-revision! dashboard-id false :crowberto)

      (let [earlier-revision-id (t2/select-one-pk :model/Revision :model "Dashboard" :model_id dashboard-id {:order-by [[:timestamp :desc]]})]
        (revision/revert! {:entity :model/Dashboard :id dashboard-id :user-id (mt/user->id :crowberto) :revision-id earlier-revision-id}))

      (is (= [{:description          "reverted to an earlier version."
               :has_multiple_changes false}
              {:description          "added 2 cards."
               :has_multiple_changes false}
              {:description          "created this."
               :has_multiple_changes false}]
             (map #(select-keys % [:description :has_multiple_changes])
                  (mt/user-http-request :crowberto :get 200 "revision" :entity "dashboard" :id dashboard-id)))))))

(deftest revert-ignores-extra-fields
  (testing "Reverting should not error if nonexistent fields are present in the revert: "
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:name "A card"}
                             :model/Dashboard {dashboard-id :id} {:name "A dashboard"}]
      (testing "Reverting a card..."
        ;; Create the revision with an extra, unknown field on the card
        (revision/push-revision!
         {:object       (assoc (t2/select-one :model/Card :id card-id) :unknown_field true)
          :entity       :model/Card
          :id           card-id
          :user-id      (mt/user->id :crowberto)
          :is-creation? false})
        ;; Update the card to a new version
        (t2/update! :model/Card {:name "A card with a new name"})
        ;; Revert to the saved revision and check that the revert succeeded despite the extra field
        (let [earlier-revision-id (t2/select-one-pk :model/Revision :model "Card" :model_id card-id {:order-by [[:timestamp :desc]]})]
          (revision/revert! {:entity :model/Card :id card-id :user-id (mt/user->id :crowberto) :revision-id earlier-revision-id}))
        (is (= "A card" (t2/select-one-fn :name :model/Card :id card-id))))

      (testing "Reverting a dashboard..."
        ;; Create the revision with an extra, unknown field on the dashboard
        (revision/push-revision!
         {:object       (assoc (t2/select-one :model/Dashboard :id dashboard-id) :unknown_field true)
          :entity       :model/Dashboard
          :id           dashboard-id
          :user-id      (mt/user->id :crowberto)
          :is-creation? false})
        ;; Update the dashboard to a new version
        (t2/update! :model/Dashboard {:name "A dashboard with a new name"})
        ;; Revert to the saved revision and check that the revert succeeded despite the extra field
        (let [earlier-revision-id (t2/select-one-pk :model/Revision :model "Dashboard" :model_id dashboard-id {:order-by [[:timestamp :desc]]})]
          (revision/revert! {:entity :model/Dashboard :id dashboard-id :user-id (mt/user->id :crowberto) :revision-id earlier-revision-id}))
        (is (= "A dashboard" (t2/select-one-fn :name :model/Dashboard :id dashboard-id)))))))
