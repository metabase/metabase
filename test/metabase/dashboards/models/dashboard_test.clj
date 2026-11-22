(ns metabase.dashboards.models.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.models.pulse-channel-test :as pulse-channel-test]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.serialization.core :as serialization]
   [metabase.stale-test :as stale-test]
   [metabase.staleness.core :as staleness]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest public-sharing-test
  (testing "test that a Dashboard's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Dashboard dashboard {:public_uuid (str (random-uuid))}]
        (is (=? u/uuid-regex
                (:public_uuid dashboard)))))))

(deftest public-sharing-test-2
  (testing "test that a Dashboard's :public_uuid comes back if public sharing is enabled..."
    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp [:model/Dashboard dashboard {:public_uuid (str (random-uuid))}]
          (is (= nil
                 (:public_uuid dashboard))))))))

(def ^:private default-parameter
  {:id   "_CATEGORY_NAME_"
   :type :category
   :name "Category Name"
   :slug "category_name"})

(deftest ^:parallel migrate-parameters-with-linked-filters-and-values-source-type-test
  (testing "test that a Dashboard's :parameters filterParameters are cleared if the :values_source_type is not nil"
    (doseq [[values_source_type
             keep-filtering-parameters?] {:card        false
                                          :static-list false
                                          nil          true}]
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

(deftest ^:parallel migrate-parameters-with-linked-filters-and-values-query-type-test
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

(deftest ^:parallel migrate-parameters-empty-name-test
  (testing "test that a Dashboard's :parameters is selected with a non-nil name and slug"
    (doseq [[name slug] [["" ""] ["" "slug"] ["name" ""]]]
      (mt/with-temp [:model/Dashboard dashboard {:parameters [(merge
                                                               default-parameter
                                                               {:name name
                                                                :slug slug})]}]
        (is (=? {:name "unnamed"
                 :slug "unnamed"}
                (first (:parameters dashboard))))))))

(defn- do-with-dashboard-subscription!
  "Call `f` with the ids of a Dashboard in a Collection and a subscription to it, with one enabled PulseChannel and a
  trigger."
  [f]
  (pulse-channel-test/with-send-pulse-setup!
    (mt/with-temp [:model/Collection    {coll-id :id}  {}
                   :model/Card          {card-id :id}  {:collection_id coll-id}
                   :model/Dashboard     {dash-id :id}  {:collection_id coll-id}
                   :model/DashboardCard {dc-id :id}    {:dashboard_id dash-id
                                                        :card_id      card-id}
                   :model/Pulse         {pulse-id :id} {:dashboard_id  dash-id
                                                        :collection_id coll-id}]
      (mt/with-model-cleanup [:model/PulseChannel]
        (let [pc-id (:id (first (pulse-channel/create-pulse-channels! [{:pulse_id      pulse-id
                                                                        :channel_type  :email
                                                                        :enabled       true
                                                                        :schedule_type :daily
                                                                        :schedule_hour 15}])))]
          (mt/with-temp [:model/PulseCard _ {:pulse_id          pulse-id
                                             :card_id           card-id
                                             :dashboard_card_id dc-id}]
            (testing "sanity check that we have a trigger"
              (is (= 1 (count (pulse-channel-test/send-pulse-triggers pulse-id)))))
            (f {:coll-id coll-id :dash-id dash-id :pulse-id pulse-id :pc-id pc-id})))))))

(defn- trigger-pc-ids [pulse-id]
  (into #{} (mapcat #(get-in % [:data "channel-ids"])) (pulse-channel-test/send-pulse-triggers pulse-id)))

(deftest archive-dashboard-keeps-subscriptions-test
  (do-with-dashboard-subscription!
   (fn [{:keys [dash-id pulse-id pc-id]}]
     (let [pc-ids-before (trigger-pc-ids pulse-id)]
       (t2/update! :model/Dashboard :id dash-id {:archived true})
       (testing "archiving a Dashboard keeps its Pulse, PulseChannel, PulseCard and SendPulse trigger"
         (is (=? {:archived false} (t2/select-one :model/Pulse :id pulse-id)))
         (is (=? {:enabled true} (t2/select-one :model/PulseChannel :id pc-id)))
         (is (= 1 (t2/count :model/PulseCard :pulse_id pulse-id)))
         (is (= pc-ids-before (trigger-pc-ids pulse-id))))
       (t2/update! :model/Dashboard :id dash-id {:archived false})
       (testing "restoring the Dashboard leaves the subscription as it was"
         (is (=? {:archived false} (t2/select-one :model/Pulse :id pulse-id)))
         (is (=? {:enabled true} (t2/select-one :model/PulseChannel :id pc-id)))
         (is (= 1 (t2/count :model/PulseCard :pulse_id pulse-id)))
         (is (= pc-ids-before (trigger-pc-ids pulse-id))))))))

(deftest archive-dashboard-keeps-deleted-subscription-deleted-test
  (do-with-dashboard-subscription!
   (fn [{:keys [dash-id pulse-id]}]
     (testing "a subscription the user deleted before the Dashboard was trashed stays deleted after restore"
       (models.pulse/update-pulses! [pulse-id] {:archived true})
       (t2/update! :model/Dashboard :id dash-id {:archived true})
       (t2/update! :model/Dashboard :id dash-id {:archived false})
       (is (=? {:archived true} (t2/select-one :model/Pulse :id pulse-id)))
       (is (= #{} (pulse-channel-test/send-pulse-triggers pulse-id)))))))

(deftest archive-collection-keeps-dashboard-subscriptions-test
  (do-with-dashboard-subscription!
   (fn [{:keys [coll-id dash-id pulse-id pc-id]}]
     (let [pc-ids-before (trigger-pc-ids pulse-id)]
       (mt/with-current-user (mt/user->id :crowberto)
         (collection/update-collections! [coll-id] {:archived true} nil)
         (testing "archiving the parent Collection leaves the subscription and its trigger as they were"
           ;; the trashed Dashboard is what stops the trigger from sending
           (is (=? {:archived true} (t2/select-one :model/Dashboard :id dash-id)))
           (is (=? {:archived false} (t2/select-one :model/Pulse :id pulse-id)))
           (is (=? {:enabled true} (t2/select-one :model/PulseChannel :id pc-id)))
           (is (= pc-ids-before (trigger-pc-ids pulse-id))))
         (collection/update-collections! [coll-id] {:archived false} nil)
         (testing "restoring the Collection leaves the subscription and its trigger as they were"
           (is (=? {:archived false} (t2/select-one :model/Pulse :id pulse-id)))
           (is (=? {:enabled true} (t2/select-one :model/PulseChannel :id pc-id)))
           (is (= pc-ids-before (trigger-pc-ids pulse-id)))))))))

(deftest archive-collection-keeps-deleted-subscription-deleted-test
  (do-with-dashboard-subscription!
   (fn [{:keys [coll-id pulse-id pc-id]}]
     (testing "a subscription the user deleted before its Collection was trashed stays deleted after restore"
       (models.pulse/update-pulses! [pulse-id] {:archived true})
       (mt/with-current-user (mt/user->id :crowberto)
         (collection/update-collections! [coll-id] {:archived true} nil)
         (collection/update-collections! [coll-id] {:archived false} nil))
       (is (=? {:archived true} (t2/select-one :model/Pulse :id pulse-id)))
       (is (=? {:enabled false} (t2/select-one :model/PulseChannel :id pc-id)))
       (is (= #{} (pulse-channel-test/send-pulse-triggers pulse-id)))))))

(deftest delete-dashboard-deletes-subscriptions-test
  (doseq [archived? [true false]]
    (testing (format "hard deleting a Dashboard (archived? %s) deletes its Pulse and SendPulse triggers" archived?)
      (do-with-dashboard-subscription!
       (fn [{:keys [dash-id pulse-id]}]
         (when archived?
           (t2/update! :model/Dashboard :id dash-id {:archived true}))
         (dashboard/delete-dashboards! [dash-id])
         (is (nil? (t2/select-one :model/Pulse :id pulse-id)))
         (is (= #{} (pulse-channel-test/send-pulse-triggers pulse-id))))))))

(deftest delete-collection-deletes-trashed-dashboard-subscriptions-test
  (testing "hard deleting a Collection holding a directly trashed Dashboard deletes its Pulse and SendPulse triggers"
    (do-with-dashboard-subscription!
     (fn [{:keys [coll-id dash-id pulse-id]}]
       (t2/update! :model/Dashboard :id dash-id {:archived true})
       (collection/delete-collections! [coll-id])
       (is (nil? (t2/select-one :model/Pulse :id pulse-id)))
       (is (= #{} (pulse-channel-test/send-pulse-triggers pulse-id)))))))

(deftest parameter-card-test
  (testing "A new dashboard creates a new ParameterCard"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (mt/with-model-cleanup [:model/Dashboard]
        (let [{dashboard-id :id} (first (dashboard/create-dashboards!
                                         [{:name       (mt/random-name)
                                           :creator_id (mt/user->id :rasta)
                                           :parameters [(merge default-parameter
                                                               {:values_source_type    :card
                                                                :values_source_config {:card_id card-id}})]}]))]
          (is (=? {:card_id                   card-id
                   :parameterized_object_type :dashboard
                   :parameterized_object_id   dashboard-id
                   :parameter_id              "_CATEGORY_NAME_"}
                  (t2/select-one :model/ParameterCard :card_id card-id))))))))

(deftest parameter-card-test-2
  (testing "Adding a card_id creates a new ParameterCard"
    (mt/with-temp [:model/Card      {card-id :id}      {}
                   :model/Dashboard {dashboard-id :id} {:parameters [default-parameter]}]
      (is (nil? (t2/select-one :model/ParameterCard :card_id card-id)))
      (dashboard/update-dashboards! [dashboard-id]
                                    {:parameters [(merge default-parameter
                                                         {:values_source_type    :card
                                                          :values_source_config {:card_id card-id}})]})
      (is (=? {:card_id                   card-id
               :parameterized_object_type :dashboard
               :parameterized_object_id   dashboard-id
               :parameter_id              "_CATEGORY_NAME_"}
              (t2/select-one :model/ParameterCard :card_id card-id))))))

(deftest parameter-card-test-3
  (testing "Removing a card_id deletes old ParameterCards"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (mt/with-model-cleanup [:model/Dashboard]
        (let [{dashboard-id :id} (first (dashboard/create-dashboards!
                                         [{:name       (mt/random-name)
                                           :creator_id (mt/user->id :rasta)
                                           :parameters [(merge default-parameter
                                                               {:values_source_type    :card
                                                                :values_source_config {:card_id card-id}})]}]))]
          (is (some? (t2/select-one :model/ParameterCard :card_id card-id)))
          (dashboard/delete-dashboards! [dashboard-id])
          (is (nil? (t2/select-one :model/ParameterCard :card_id card-id))))))))

(deftest do-not-update-parameter-card-if-it-doesn't-change-test
  (testing "Do not update ParameterCard if updating a Dashboard doesn't change the parameters"
    (mt/with-temp [:model/Card      {source-card-id :id} {}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name       "Category Name"
                                                                      :slug       "category_name"
                                                                      :id         "_CATEGORY_NAME_"
                                                                      :type       "category"
                                                                      :values_source_type    "card"
                                                                      :values_source_config {:card_id source-card-id}}]}]
      (mt/with-dynamic-fn-redefs [parameter-card/sync-parameter-cards! (fn [& _] (throw (ex-info "Should not be called" {})))]
        (dashboard/update-dashboards! [dashboard-id] {:name "new name"})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-dash-in-collection! [f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection    collection {}
                   :model/Dashboard     dash       {:collection_id (u/the-id collection)}
                   :model/Database      db         {:engine :h2}
                   :model/Table         table      {:db_id (u/the-id db)}
                   :model/Card          card       {:dataset_query {:database (u/the-id db)
                                                                    :type     :query
                                                                    :query    {:source-table (u/the-id table)}}}
                   :model/DashboardCard _          {:dashboard_id (u/the-id dash), :card_id (u/the-id card)}]
      (f db collection dash))))

(defmacro with-dash-in-collection!
  "Execute `body` with a Dashboard in a Collection. Dashboard will contain one Card in a Database."
  {:style/indent :defn}
  [[db-binding collection-binding dash-binding] & body]
  `(do-with-dash-in-collection!
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or dash-binding '_)]
      ~@body)))

(deftest perms-test
  (with-dash-in-collection! [_db collection dash]
    (mt/with-test-user :rasta
      (testing "Dashboard in Collection is not readable without permissions for that Collection"
        (mt/with-full-data-perms-for-all-users!
          (is (false? (mi/can-read? (t2/hydrate dash :can_read))))))
      (testing "Dashboard in Collection is readable, not writable, with read permissions for that Collection"
        (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
        (is (true? (mi/can-read? (t2/hydrate dash :can_read))))
        (is (false? (mi/can-write? (t2/hydrate dash :can_write)))))
      (testing "Dashboard in Collection is writable with write permissions for that Collection"
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection)
        (is (true? (mi/can-write? (t2/hydrate dash :can_write))))))))

(deftest transient-dashboards-test
  (testing "test that we save a transient dashboard"
    (tu/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Collection]
      (let [rastas-personal-collection (collection/user->personal-collection (test.users/user->id :rasta))]
        (mt/with-current-user (test.users/user->id :rasta)
          (let [dashboard       (magic/automagic-analysis (t2/select-one :model/Table :id (mt/id :venues)) {})
                saved-dashboard (dashboards.write/save-transient-dashboard! dashboard (u/the-id rastas-personal-collection))]
            (is (= (t2/count :model/DashboardCard :dashboard_id (u/the-id saved-dashboard))
                   (-> dashboard :dashcards count)))))))))

(deftest transient-dashboard-save-records-two-revisions-test
  (testing "Saving an x-ray creates the bare Dashboard, then its cards, then its parts: two Revisions, one audit row for the cards"
    (mt/with-premium-features #{:audit-app}
      (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Revision :model/AuditLog]
        (let [rastas-personal-collection (collection/user->personal-collection (test.users/user->id :rasta))]
          (mt/with-current-user (test.users/user->id :rasta)
            (let [dashboard       (magic/automagic-analysis (t2/select-one :model/Table :id (mt/id :venues)) {})
                  saved-dashboard (dashboards.write/save-transient-dashboard! dashboard (u/the-id rastas-personal-collection))
                  dashboard-id    (u/the-id saved-dashboard)
                  revisions       (t2/select :model/Revision :model "Dashboard" :model_id dashboard-id {:order-by [[:id :asc]]})
                  topics          (map :topic (t2/select :model/AuditLog :model "Dashboard" :model_id dashboard-id {:order-by [[:id :asc]]}))]
              (is (=? [{:is_creation true :object {:cards empty?}}
                       {:is_creation false :object {:cards #(= (count %) (t2/count :model/DashboardCard :dashboard_id dashboard-id))}}]
                      revisions))
              (is (= [:dashboard-create :dashboard-add-cards] topics)))))))))

(deftest validate-collection-namespace-test
  (mt/with-temp [:model/Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Dashboard in a non-normal Collection"
      (let [dashboard-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Dashboard can only go in Collections in the \"default\"(?: or :[a-z\-]+)+ namespace."
               (first (dashboard/create-dashboards! [{:creator_id (mt/user->id :rasta), :collection_id collection-id, :name dashboard-name}]))))
          (is (not (t2/exists? :model/Dashboard :name dashboard-name)))
          (finally
            (t2/delete! :model/Dashboard :name dashboard-name)))))
    (testing "Shouldn't be able to move a Dashboard to a non-normal Collection"
      (mt/with-temp [:model/Dashboard {dashboard-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Dashboard can only go in Collections in the \"default\"(?: or :[a-z\-]+)+ namespace."
             (dashboard/update-dashboards! [dashboard-id] {:collection_id collection-id})))
        (is (nil? (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id)))))))

(deftest unarchived-dashboard-in-archived-collection-test
  (mt/with-temp [:model/Collection {archived-id :id} {:archived true}
                 :model/Dashboard  {dashboard-id :id} {}]
    (testing "an unarchived Dashboard cannot go in an archived Collection"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (dashboard/update-dashboards! [dashboard-id] {:collection_id archived-id})))
      (is (nil? (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id))))
    (testing "an archived Dashboard can"
      (dashboard/update-dashboards! [dashboard-id] {:archived true :collection_id archived-id})
      (is (= archived-id (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id))))))

(deftest normalize-parameters-test
  (testing ":parameters should get normalized when coming out of the DB"
    (doseq [[target expected] {[:dimension [:field-id 1000]] [:dimension [:field 1000 nil]]
                               [:field-id 1000]              [:field 1000 nil]}]
      (testing (format "target = %s" (pr-str target))
        (mt/with-temp [:model/Card      {card-id :id} {}
                       :model/Dashboard {dashboard-id :id} {:parameters [{:name   "Category Name"
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
                   :values_query_type :list
                   :values_source_type :card
                   :values_source_config {:card_id card-id, :value_field [:field 2 nil]}}]
                 (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id))))))))

(deftest ^:parallel should-add-default-values-source-test
  (testing "shoudld add default if not exists"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:parameters [{:name   "Category Name"
                                                                      :slug   "category_name"
                                                                      :id     "_CATEGORY_NAME_"
                                                                      :type   "category"}]}]
      (is (=? [{:name                 "Category Name"
                :slug                 "category_name"
                :id                   "_CATEGORY_NAME_"
                :type                 :category}]
              (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id))))))

(deftest ^:parallel should-add-default-values-source-test-2
  (testing "shoudld not override if existsed "
    (mt/with-temp [:model/Card      {card-id :id} {}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name   "Category Name"
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
                :values_query_type    :list
                :values_source_type   :card
                :values_source_config {:card_id card-id, :value_field [:field 2 nil]}}]
              (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id))))))

(defn- content-dependencies [dashboard]
  (into #{}
        (remove (comp #{:model/Database :model/Table :model/Field} first))
        (first (serialization/export-dependencies :model/Dashboard [dashboard]))))

(deftest ^:parallel export-dependencies-test
  (testing "dashboard whose parameter's source is another card"
    (mt/with-temp
      [:model/Field     field     {:name "A field"}
       :model/Card      card      {:name "A card"}
       :model/Dashboard dashboard {:name       "A dashboard"
                                   :parameters [{:id                   "abc"
                                                 :type                 "category"
                                                 :values_source_type   "card"
                                                 :values_source_config {:card_id     (:id card)
                                                                        :value_field [:field (:id field) nil]}}]}]
      (is (= #{[:model/Card (:id card)]}
             (content-dependencies dashboard))))))

(deftest export-dependencies-test-2
  (testing "dashboard with dashcard with action"
    (mt/with-actions [{:keys [action-id]} {}]
      (mt/with-temp
        [:model/Dashboard     dashboard {:name "A dashboard"}
         :model/DashboardCard _         {:action_id          action-id
                                         :dashboard_id       (:id dashboard)
                                         :parameter_mappings []}]
        (is (= #{[:model/Action action-id]}
               (content-dependencies dashboard)))))))

(deftest ^:parallel export-dependencies-test-3
  (testing "dashboard whose dashcards have parameter_mappings to card"
    (mt/with-temp
      [:model/Card          card1     {:name "Card attached to dashcard"}
       :model/Card          card2     {:name "Card attached to parameters"}
       :model/Dashboard     dashboard {:parameters [{:name "Category Name"
                                                     :slug "category_name"
                                                     :id   "_CATEGORY_NAME_"
                                                     :type "category"}]}
       :model/DashboardCard _         {:card_id            (:id card1)
                                       :dashboard_id       (:id dashboard)
                                       :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                             :card_id      (:id card2)
                                                             :target       [:dimension (mt/$ids $categories.name)]}]}]
      (is (= #{[:model/Card (:id card1)] [:model/Card (:id card2)]}
             (content-dependencies dashboard))))))

(deftest ^:parallel export-dependencies-test-4
  (testing "dashboard whose dashcards have series"
    (mt/with-temp
      [:model/Card                card1     {:name "Card attached to dashcard"}
       :model/Card                card2     {:name "Card attached to series in 1st position"}
       :model/Card                card3     {:name "Card attached to series in 2nd position"}
       :model/Dashboard           dashboard {:parameters [{:name "Category Name"
                                                           :slug "category_name"
                                                           :id   "_CATEGORY_NAME_"
                                                           :type "category"}]}
       :model/DashboardCard       dashcard  {:card_id (:id card1), :dashboard_id (:id dashboard)}
       :model/DashboardCardSeries _         {:dashboardcard_id (:id dashcard), :card_id (:id card2), :position 0}
       :model/DashboardCardSeries _         {:dashboardcard_id (:id dashcard), :card_id (:id card3), :position 1}]
      (is (= #{[:model/Card (:id card1)] [:model/Card (:id card2)] [:model/Card (:id card3)]}
             (content-dependencies dashboard))))))

(deftest ^:parallel hydrate-tabs-test
  (mt/with-temp
    [:model/Dashboard    dash1      {:name "A dashboard"}
     :model/DashboardTab dash1-tab1 {:name "Tab 1", :dashboard_id (:id dash1)}
     :model/DashboardTab dash1-tab2 {:name "Tab 2", :dashboard_id (:id dash1)}
     :model/Dashboard    dash2      {:name "Another dashboard"}
     :model/DashboardTab dash2-tab1 {:name "Dash 2 tab 1" :dashboard_id (:id dash2)}
     :model/DashboardTab dash2-tab2 {:name "Dash 2 tab 2" :dashboard_id (:id dash2)}]
    (is (=? [[dash1-tab1 dash1-tab2]
             [dash2-tab1 dash2-tab2]]
            (map :tabs (t2/hydrate [dash1 dash2] :tabs))))))

(deftest ^:parallel hydrate-dashcards-test
  (mt/with-temp
    [:model/Dashboard     dash1       {:name "A dashboard"}
     :model/DashboardCard dash1-card1 {:dashboard_id (:id dash1)}
     :model/DashboardCard dash1-card2 {:dashboard_id (:id dash1)}
     :model/Dashboard     dash2       {:name "Another dashboard"}
     :model/DashboardCard dash2-card1 {:dashboard_id (:id dash2)}
     :model/DashboardCard dash2-card2 {:dashboard_id (:id dash2)}]
    (is (=? [[dash1-card1 dash1-card2]
             [dash2-card1 dash2-card2]]
            (map :dashcards (t2/hydrate [dash1 dash2] :dashcards))))))

(deftest ^:parallel hydrate-resolved-params-test
  (mt/with-temp
    [:model/Dashboard     dash      {:parameters [{:name "Category Name"
                                                   :slug "category_name"
                                                   :id   "_CATEGORY_NAME_"
                                                   :type "category"}]}
     :model/Card          card      {:name "Card attached to dashcard"}
     :model/DashboardCard dashcard {:dashboard_id       (:id dash)
                                    :card_id            (:id card)
                                    :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                          :target       [:dimension (mt/$ids $categories.name)]}]}]
    (is (=? {"_CATEGORY_NAME_"
             {:name     "Category Name"
              :slug     "category_name"
              :id       "_CATEGORY_NAME_"
              :type     :category
              :mappings (mt/malli=? [:set [:map
                                           [:parameter_id [:= "_CATEGORY_NAME_"]]
                                           [:target       [:= [:dimension (mt/$ids $categories.name)]]]
                                           [:dashcard     [:map
                                                           [:id   [:= (:id dashcard)]]
                                                           [:card [:map
                                                                   [:id [:= (:id card)]]]]]]]])}}
            (-> dash (t2/hydrate :resolved-params) :resolved-params)))))

(deftest stale-candidates-test
  (testing "the Dashboard staleness spec selects stale dashboards and applies the model's own exclusions"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Dashboard {stale-id :id}    (stale-test/stale-dashboard {:name "stale" :collection_id col-id})
                   :model/Dashboard {fresh-id :id}    {:name "fresh" :collection_id col-id
                                                       :last_viewed_at (stale-test/datetime-months-ago 1)}
                   :model/Dashboard {archived-id :id} (stale-test/stale-dashboard {:name "archived" :collection_id col-id
                                                                                   :archived true})]
      (let [stale-ids (fn [] (set (map :id (t2/query ((staleness/candidates-fn :model/Dashboard)
                                                      {:collection-ids #{col-id}
                                                       :cutoff-date    (stale-test/date-months-ago 6)})))))]
        (testing "a stale, unarchived dashboard is returned; recent and archived dashboards are not"
          (let [ids (stale-ids)]
            (is (contains? ids stale-id))
            (is (not (contains? ids fresh-id)))
            (is (not (contains? ids archived-id)))))
        (testing "a publicly shared dashboard is excluded only when public sharing is enabled"
          (mt/with-temp [:model/Dashboard {public-id :id} (stale-test/stale-dashboard
                                                           {:name "public" :collection_id col-id
                                                            :public_uuid (str (random-uuid))})]
            (tu/with-temporary-setting-values [enable-public-sharing false]
              (is (contains? (stale-ids) public-id)))
            (tu/with-temporary-setting-values [enable-public-sharing true]
              (is (not (contains? (stale-ids) public-id))))))))))

(deftest ^:parallel hydrate-resolved-params-model-test
  (mt/with-temp
    [:model/Dashboard     dash      {:parameters [{:name "Category Name"
                                                   :slug "category_name"
                                                   :id   "_CATEGORY_NAME_"
                                                   :type "category"}]}
     :model/Card          card      {:name "Card attached to dashcard"
                                     :dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :categories)}}
                                     :type :model}
     :model/DashboardCard dashcard {:dashboard_id       (:id dash)
                                    :card_id            (:id card)
                                    :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                          :target       [:dimension (mt/$ids *categories.name)]}]}]
    (is (=? {"_CATEGORY_NAME_"
             {:name     "Category Name"
              :slug     "category_name"
              :id       "_CATEGORY_NAME_"
              :type     :category
              :mappings (mt/malli=? [:set [:map
                                           [:parameter_id [:= "_CATEGORY_NAME_"]]
                                           [:target       [:= [:dimension (mt/$ids *categories.name)]]]
                                           [:dashcard     [:map
                                                           [:id   [:= (:id dashcard)]]
                                                           [:card [:map
                                                                   [:id [:= (:id card)]]]]]]]])}}
            (-> dash (t2/hydrate :resolved-params) :resolved-params)))))

(deftest collection-namespace-test
  (testing "A Dashboard goes in a Collection of an allowed namespace, when it is inserted and when it moves"
    (mt/with-temp [:model/Collection snippets {:namespace :snippets}
                   :model/Collection plain    {}
                   :model/Dashboard  dash     {:collection_id (u/the-id plain)}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only go in Collections"
                            (first (dashboard/create-dashboards! [{:name "Dash" :creator_id (mt/user->id :rasta)
                                                                   :collection_id (u/the-id snippets)}]))))
      (is (not (t2/exists? :model/Dashboard :name "Dash")))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only go in Collections"
                            (dashboard/update-dashboards! [(u/the-id dash)] {:collection_id (u/the-id snippets)})))
      (is (= (u/the-id plain) (t2/select-one-fn :collection_id :model/Dashboard :id (u/the-id dash)))))))

(deftest move-dashboard-moves-dashboard-questions-test
  (testing "Any update of the collection of a Dashboard moves the questions saved in it"
    (mt/with-temp [:model/Collection source {}
                   :model/Collection target {}
                   :model/Dashboard  dash   {:collection_id (u/the-id source)}
                   :model/Card       card   {:dashboard_id (u/the-id dash) :collection_id (u/the-id source)}]
      (dashboard/update-dashboards! [(u/the-id dash)] {:collection_id (u/the-id target)})
      (is (= (u/the-id target) (t2/select-one-fn :collection_id :model/Card :id (u/the-id card))))
      (dashboard/update-dashboards! [(u/the-id dash)] {:collection_id nil})
      (is (nil? (t2/select-one-fn :collection_id :model/Card :id (u/the-id card)))))))

(deftest ^:parallel dashboard-columns-schema-test
  (testing "Dashboard has non-blank name, known width and boolean auto apply filters"
    (doseq [[column bad] [[:name "  "]
                          [:width "wide"]
                          [:auto_apply_filters "yes"]
                          [:auto_apply_filters nil]]]
      (testing (pr-str column bad)
        (is (not (mr/validate ::dashboards.schema/dashboard.update {:id 1 column bad})))))
    (is (mr/validate ::dashboards.schema/dashboard.update {:id 1 :name "Dash" :width "full" :auto_apply_filters false}))))

(def ^:private change-permission-table
  "The changes of a Dashboard the permission check refuses a user, by what the user may write."
  [{:writes #{}                 :changes {:name "New"}                   :allowed? false}
   {:writes #{:source}          :changes {:name "New"}                   :allowed? true}
   {:writes #{:source}          :changes {:collection_id :target}        :allowed? false}
   {:writes #{:source :target}  :changes {:collection_id :target}        :allowed? true}
   {:writes #{:source :target}  :changes {:enable_embedding true}        :allowed? false}
   {:writes #{:source :target}  :changes {:public_uuid "a-public-link"}  :allowed? false}])

(deftest can-update-dashboard-test
  (testing "Whether the current user may change a Dashboard depends on the collections and on the columns changed"
    (mt/with-non-admin-groups-no-root-collection-perms
      (doseq [{:keys [writes changes allowed?]} change-permission-table]
        (mt/with-temp [:model/Collection source {}
                       :model/Collection target {}
                       :model/Dashboard  dash   {:collection_id (u/the-id source)}]
          (let [collections {:source source :target target}
                changes     (cond-> changes
                              (= :target (:collection_id changes)) (assoc :collection_id (u/the-id target)))]
            (doseq [collection-key writes]
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) (collections collection-key)))
            (testing (pr-str {:writes writes :changes changes})
              (mt/with-test-user :rasta
                (is (= allowed? (mi/can-update? (t2/hydrate dash :can_write) changes))))
              (mt/with-test-user :crowberto
                (is (true? (mi/can-update? (t2/hydrate dash :can_write) changes)))))))))))

(deftest can-create-dashboard-test
  (testing "Creating a Dashboard needs write access to its collection, and a superuser to start it shared"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection writable {}]
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) writable)
        (mt/with-test-user :rasta
          (is (true? (mi/can-create? :model/Dashboard {:collection_id (u/the-id writable)})))
          (is (false? (mi/can-create? :model/Dashboard {:collection_id (u/the-id writable) :enable_embedding true}))))
        (mt/with-test-user :crowberto
          (is (true? (mi/can-create? :model/Dashboard {:collection_id (u/the-id writable) :enable_embedding true}))))))))

(deftest archiving-dashboard-keeps-alerts-of-its-questions-test
  (testing "archiving a Dashboard leaves the alerts of the questions that belong to it, which restoring the Dashboard brings back"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
      (notification.tu/with-card-notification
        [notification {:card {:dashboard_id dashboard-id}
                       :notification-card {:send_condition :has_result}}]
        (t2/update! :model/Dashboard :id dashboard-id {:archived true})
        (is (t2/exists? :model/Notification :id (:id notification)))
        (t2/update! :model/Dashboard :id dashboard-id {:archived false})
        (is (t2/exists? :model/Notification :id (:id notification)))))))

(deftest create-dashboards-statement-count-test
  (testing "Creating Dashboards takes the same number of statements for any number of them"
    (mt/with-temp [:model/Collection {collection-id :id} {}
                   :model/Card       {card-id :id}       {}]
      (mt/with-model-cleanup [:model/Dashboard]
        (let [parameters [(merge default-parameter
                                 {:values_source_type :card :values_source_config {:card_id card-id}})]
              statements (fn [n]
                           (t2/with-call-count [call-count]
                             (doall (dashboard/create-dashboards!
                                     (for [i (range n)]
                                       {:name (str "Dashboard " i) :creator_id (mt/user->id :rasta) :collection_id collection-id :parameters parameters})))
                             (call-count)))]
          (statements 1)
          (is (= (statements 2) (statements 6)))
          (is (= 9 (t2/count :model/ParameterCard :card_id card-id))))))))

(deftest update-dashboards-statement-count-test
  (testing "Archiving Dashboards takes the same number of statements for any number of them"
    (mt/with-temp [:model/Collection {from-id :id} {}]
      (mt/with-model-cleanup [:model/Dashboard]
        (let [statements (fn [n changes]
                           (let [dashboards (dashboard/create-dashboards!
                                             (for [i (range n)] {:name (str "Dashboard " i) :creator_id (mt/user->id :rasta) :collection_id from-id}))]
                             (t2/with-call-count [call-count]
                               (dashboard/update-dashboards! (mapv :id dashboards) changes)
                               (call-count))))]
          (statements 1 {:archived true})
          (testing "archiving"
            (is (= (statements 2 {:archived true}) (statements 6 {:archived true})))))))))

(deftest update-dashboards-keeps-parameter-cards-test
  (testing "Updating the parameters of Dashboards updates their ParameterCards"
    (mt/with-temp [:model/Card      {card-id :id}   {}
                   :model/Card      {card-2-id :id} {}
                   :model/Dashboard {dashboard-id :id} {:parameters [(merge default-parameter
                                                                            {:values_source_type :card :values_source_config {:card_id card-id}})]}]
      (dashboard/update-dashboards! [dashboard-id]
                                    {:parameters [(merge default-parameter
                                                         {:values_source_type :card :values_source_config {:card_id card-2-id}})]})
      (is (= [card-2-id] (t2/select-fn-vec :card_id :model/ParameterCard :parameterized_object_id dashboard-id)))
      (dashboard/update-dashboards! [dashboard-id] {:parameters [default-parameter]})
      (is (= [] (t2/select :model/ParameterCard :parameterized_object_id dashboard-id))))))

(deftest delete-dashboards-statement-count-test
  (testing "Deleting Dashboards takes the same number of statements for any number of them"
    (let [statements (fn [n]
                       (let [dashboards (dashboard/create-dashboards! (for [i (range n)] {:name (str "Dashboard " i) :creator_id (mt/user->id :rasta)}))]
                         (t2/with-call-count [call-count]
                           (dashboard/delete-dashboards! (mapv :id dashboards))
                           (call-count))))]
      (statements 1)
      (is (= (statements 2) (statements 6))))))

(deftest create-dashboards-with-parts-test
  (testing "A Dashboard is created with its tabs, dashcards and series, and its Revision holds them"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id}   {}
                     :model/Card {series-id :id} {}]
        (mt/with-model-cleanup [:model/Dashboard]
          (let [[{dashboard-id :id}] (dashboard/create-dashboards!
                                      [{:name      "With parts"
                                        :creator_id (mt/user->id :crowberto)
                                        :tabs      [{:id -1 :name "Tab" :position 0}]
                                        :dashcards [{:card_id card-id :dashboard_tab_id -1 :row 0 :col 0 :size_x 4 :size_y 4
                                                     :series  [series-id]}]}])
                tab-id               (t2/select-one-pk :model/DashboardTab :dashboard_id dashboard-id)
                dashcard             (t2/select-one :model/DashboardCard :dashboard_id dashboard-id)]
            (is (= tab-id (:dashboard_tab_id dashcard)))
            (is (= [series-id] (t2/select-fn-vec :card_id :model/DashboardCardSeries :dashboardcard_id (:id dashcard))))
            (is (=? [{:is_creation true :object {:tabs [{:name "Tab"}] :cards [{:card_id card-id :series [series-id]}]}}]
                    (t2/select :model/Revision :model "Dashboard" :model_id dashboard-id)))))))))

(deftest update-dashboards-with-parts-test
  (testing "The parts of a Dashboard are replaced, with one update event and one audit row for the dashcards added"
    (mt/with-premium-features #{:audit-app}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Before"}
                       :model/Card      {card-id :id}      {}]
          (let [audit-before (or (t2/select-one-fn :id :model/AuditLog {:order-by [[:id :desc]]}) 0)
                revisions    #(t2/select :model/Revision :model "Dashboard" :model_id dashboard-id {:order-by [[:id :asc]]})
                before       (count (revisions))
                topics       #(map :topic (t2/select :model/AuditLog :id [:> audit-before] {:order-by [[:id :asc]]}))]
            (dashboard/update-dashboard! dashboard-id
                                         {:name      "After"
                                          :dashcards [{:id -1 :card_id card-id :row 0 :col 0 :size_x 4 :size_y 4}]})
            (is (= (inc before) (count (revisions))))
            (is (=? {:object {:name "After" :cards [{:card_id card-id}]}} (last (revisions))))
            (is (= [:dashboard-add-cards] (topics)))
            (dashboard/update-dashboard! dashboard-id {:dashcards []})
            (is (= (+ before 2) (count (revisions))))
            (is (= [:dashboard-add-cards :dashboard-remove-cards] (topics)))))))))

(deftest remove-dashcards-cleans-inline-parameters-test
  (testing "Removing a dashcard removes the inline parameters it held from its Dashboard, in one Revision"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:parameters [{:id "p" :name "P" :slug "p" :type :category}]}
                     :model/Card      {card-id :id}      {}]
        (let [[{dashcard-id :id}] (dashboard/add-dashcards! [{:dashboard_id dashboard-id :card_id card-id :row 0 :col 0
                                                              :size_x 4 :size_y 4 :inline_parameters ["p"]}])
              before              (t2/count :model/Revision :model "Dashboard" :model_id dashboard-id)]
          (dashboard/remove-dashcards! [dashcard-id])
          (is (= [] (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id)))
          (is (= (inc before) (t2/count :model/Revision :model "Dashboard" :model_id dashboard-id))))))))

(deftest create-dashboards!-rows-with-different-columns-test
  (testing "Dashboards given different sets of columns keep the defaults of the columns they lack"
    (mt/with-model-cleanup [:model/Dashboard]
      (let [[full bare] (dashboard/create-dashboards! [{:name "Full" :creator_id (mt/user->id :rasta) :description "Described" :auto_apply_filters false :width "full"}
                                                       {:name "Bare" :creator_id (mt/user->id :rasta)}])]
        (is (=? {:name "Full" :description "Described" :auto_apply_filters false :width "full"}
                (t2/select-one :model/Dashboard :id (:id full))))
        (is (=? {:name "Bare" :description nil :auto_apply_filters true :width "fixed"}
                (t2/select-one :model/Dashboard :id (:id bare))))))))

(deftest plain-writes-convert-columns-test
  (testing "The column transforms convert the parameters, the embedding params and the embedding type of plain writes"
    (mt/with-temp [:model/Dashboard {id :id} {:parameters       [{:id                 "p"
                                                                  :name               "P"
                                                                  :slug               "p"
                                                                  :type               "category"
                                                                  :values_source_type "static-list"}]
                                              :embedding_params {:p :enabled}
                                              :embedding_type   :static-legacy}]
      (is (=? {:parameters       [{:id "p" :type :category :values_source_type :static-list}]
               :embedding_params {"p" "enabled"}
               :embedding_type   "static-legacy"}
              (t2/select-one :model/Dashboard :id id)))
      (testing "on update"
        (t2/update! :model/Dashboard :id id {:embedding_params {:q :locked} :embedding_type :guest})
        (is (=? {:embedding_params {"q" "locked"}
                 :embedding_type   "guest"}
                (t2/select-one :model/Dashboard :id id)))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Card       {card-id :id}   {}
                 :model/Card       {series-id :id} {}
                 :model/Collection {live :id}      {}
                 :model/Collection {other :id}     {}]
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (let [rows    (fn [n]
                      (mapv (fn [_]
                              (assoc (dissoc (mt/with-temp-defaults :model/Dashboard) :created_at :updated_at)
                                     :collection_id live
                                     :tabs          [{:id -1 :name "Tab" :position 0}]
                                     :dashcards     [{:card_id card-id :dashboard_tab_id -1 :row 0 :col 0 :size_x 4 :size_y 4
                                                      :series  [series-id]}]))
                            (range n)))
            fresh!  (fn [n]
                      (let [ids (mapv :id (dashboard/create-dashboards! (rows n)))]
                        (doseq [id ids]
                          (t2/insert! :model/Card (assoc (mt/with-temp-defaults :model/Card) :dashboard_id id :collection_id live)))
                        ids))
            update! (fn [prepare changes n]
                      (let [ids (fresh! n)]
                        (prepare (take-nth 2 ids))
                        (events.tu/statement-count! #(dashboard/update-dashboards! ids changes))))
            counted (fn [f]
                      (f 1)
                      (is (= (f 2) (f 6))))]
        (testing "creating dashboards with their tabs, dashcards and series"
          (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(dashboard/create-dashboards! rows))))))
        (testing "updating columns, some already holding the new value"
          (counted (partial update!
                            (fn [ids] (dashboard/update-dashboards! ids {:description "Same"}))
                            {:description "Same"})))
        (testing "archiving dashboards and their questions, some already archived"
          (counted (partial update!
                            (fn [ids] (dashboard/update-dashboards! ids {:archived true}))
                            {:archived true})))
        (testing "restoring dashboards and their questions, some already live"
          (counted (partial update!
                            (fn [ids] (dashboard/update-dashboards! ids {:archived true}))
                            {:archived false})))
        (testing "moving dashboards and their questions, some already in the Collection"
          (counted (partial update!
                            (fn [ids] (dashboard/update-dashboards! ids {:collection_id other}))
                            {:collection_id other})))
        (testing "adding, updating and removing dashcards"
          (counted (fn [n]
                     (let [ids (fresh! n)
                           rows (mapv (fn [id] {:dashboard_id id :card_id card-id :row 5 :col 0 :size_x 4 :size_y 4 :series [series-id]}) ids)]
                       (events.tu/statement-count! #(dashboard/add-dashcards! rows)))))
          (counted (fn [n]
                     (let [ids       (fresh! n)
                           dashcards (t2/select-pks-vec :model/DashboardCard :dashboard_id [:in ids])]
                       (dashboard/update-dashcards! (mapv (fn [id] {:id id :row 3}) (take-nth 2 dashcards)))
                       (events.tu/statement-count! #(dashboard/update-dashcards! (mapv (fn [id] {:id id :row 3}) dashcards))))))
          (counted (fn [n]
                     (let [ids       (fresh! n)
                           dashcards (t2/select-pks-vec :model/DashboardCard :dashboard_id [:in ids])]
                       (events.tu/statement-count! #(dashboard/remove-dashcards! dashcards))))))
        (testing "deleting dashboards"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(dashboard/delete-dashboards! ids))))))
        (testing "counting views and touching the last view"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(dashboard/increment-view-counts! {3 ids})))))
          (counted (fn [n]
                     (let [ids (fresh! n)]
                       (events.tu/statement-count!
                        #(dashboard/touch-last-viewed! (zipmap ids (repeat (java.time.Instant/now)))))))))))))

(deftest archived-directly-follows-collection-on-plain-update-test
  (mt/with-temp [:model/Collection {live :id}     {}
                 :model/Collection {archived :id} {:archived true}
                 :model/Dashboard  {a :id}        {:collection_id live}
                 :model/Dashboard  {b :id}        {:collection_id archived}
                 :model/Dashboard  {c :id}        {:collection_id live}]
    (let [directly #(t2/select-one-fn :archived_directly :model/Dashboard :id %)]
      (testing "archiving a Dashboard of a live Collection is direct"
        (t2/update! :model/Dashboard :id a {:archived true})
        (is (true? (directly a))))
      (testing "restoring clears it"
        (t2/update! :model/Dashboard :id a {:archived false})
        (is (false? (directly a))))
      (testing "archiving a Dashboard of an archived Collection is not direct"
        (t2/update! :model/Dashboard :id b {:archived true})
        (is (false? (directly b))))
      (testing "archiving while moving reads the new Collection"
        (t2/update! :model/Dashboard :id c {:archived true :collection_id archived})
        (is (false? (directly c)))
        (t2/update! :model/Dashboard :id c {:archived false})
        (t2/update! :model/Dashboard :id c {:archived true :collection_id live})
        (is (true? (directly c))))
      (testing "archiving several Dashboards in mixed state costs the same statements at two and six ids"
        (let [fresh (fn [n] (mapv :id (dashboard/create-dashboards! (for [i (range n)] {:name (str "D" i) :creator_id (mt/user->id :rasta) :collection_id live}))))
              stmts (fn [n]
                      (let [ids (fresh n)]
                        (t2/update! :model/Dashboard :id [:in (take-nth 2 ids)] {:archived true})
                        (events.tu/statement-count! #(dashboard/update-dashboards! ids {:archived true}))))]
          (stmts 1)
          (is (= (stmts 2) (stmts 6))))))))
