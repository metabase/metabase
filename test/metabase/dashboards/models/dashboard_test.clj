(ns metabase.dashboards.models.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.pulse.models.pulse-channel-test :as pulse-channel-test]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.util :as tu]
   [metabase.util :as u]
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

(deftest archive-dashboard-delete-pulse-test
  (pulse-channel-test/with-send-pulse-setup!
    (mt/with-temp [:model/Card          {card-id :id}     {}
                   :model/Dashboard     {dash-id :id}     {}
                   :model/DashboardCard {dc-id :id}       {:dashboard_id dash-id
                                                           :card_id      card-id}
                   :model/Pulse        {pulse-id :id}    {:dashboard_id dash-id}
                   :model/PulseChannel _        {:pulse_id pulse-id}
                   :model/PulseCard    _         {:pulse_id pulse-id
                                                  :card_id  card-id
                                                  :dashboard_card_id dc-id}]
      (testing "sanity check that we have a trigger"
        (is (= 1 (count (pulse-channel-test/send-pulse-triggers pulse-id)))))
      (t2/update! :model/Dashboard dash-id {:archived true})
      (testing "archiving a Dashboard should delete its Pulse and SendPulse triggers"
        (is (nil? (t2/select-one :model/Pulse pulse-id)))
        (is (= 0 (count (pulse-channel-test/send-pulse-triggers pulse-id))))))))

(deftest ^:parallel parameter-card-test
  (testing "A new dashboard creates a new ParameterCard"
    (mt/with-temp [:model/Card      {card-id :id}      {}
                   :model/Dashboard {dashboard-id :id} {:parameters [(merge default-parameter
                                                                            {:values_source_type    "card"
                                                                             :values_source_config {:card_id card-id}})]}]
      (is (=? {:card_id                   card-id
               :parameterized_object_type :dashboard
               :parameterized_object_id   dashboard-id
               :parameter_id              "_CATEGORY_NAME_"}
              (t2/select-one :model/ParameterCard :card_id card-id))))))

(deftest parameter-card-test-2
  (testing "Adding a card_id creates a new ParameterCard"
    (mt/with-temp [:model/Card      {card-id :id}      {}
                   :model/Dashboard {dashboard-id :id} {:parameters [default-parameter]}]
      (is (nil? (t2/select-one :model/ParameterCard :card_id card-id)))
      (t2/update! :model/Dashboard dashboard-id {:parameters [(merge default-parameter
                                                                     {:values_source_type    "card"
                                                                      :values_source_config {:card_id card-id}})]})
      (is (=? {:card_id                   card-id
               :parameterized_object_type :dashboard
               :parameterized_object_id   dashboard-id
               :parameter_id              "_CATEGORY_NAME_"}
              (t2/select-one :model/ParameterCard :card_id card-id))))))

(deftest parameter-card-test-3
  (testing "Removing a card_id deletes old ParameterCards"
    (mt/with-temp [:model/Card      {card-id :id}      {}
                   :model/Dashboard {dashboard-id :id} {:parameters [(merge default-parameter
                                                                            {:values_source_type    "card"
                                                                             :values_source_config {:card_id card-id}})]}]
      ;; same setup as earlier test, we know the ParameterCard exists right now
      (t2/delete! :model/Dashboard :id dashboard-id)
      (is (nil? (t2/select-one :model/ParameterCard :card_id card-id))))))

(deftest do-not-update-parameter-card-if-it-doesn't-change-test
  (testing "Do not update ParameterCard if updating a Dashboard doesn't change the parameters"
    (mt/with-temp [:model/Card      {source-card-id :id} {}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name       "Category Name"
                                                                      :slug       "category_name"
                                                                      :id         "_CATEGORY_NAME_"
                                                                      :type       "category"
                                                                      :values_source_type    "card"
                                                                      :values_source_config {:card_id source-card-id}}]}]
      (mt/with-dynamic-fn-redefs [parameter-card/upsert-or-delete-from-parameters! (fn [& _] (throw (ex-info "Should not be called" {})))]
        (t2/update! :model/Dashboard dashboard-id {:name "new name"})))))

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
    (testing (str "Check that if a Dashboard is in a Collection, someone who would not be able to see it under the old "
                  "artifact-permissions regime will be able to see it if they have permissions for that Collection")
      (binding [api/*current-user-permissions-set* (atom #{(perms/collection-read-path collection)})]
        (is (true?
             (mi/can-read? dash)))))

    (testing (str "Check that if a Dashboard is in a Collection, someone who would otherwise be able to see it under "
                  "the old artifact-permissions regime will *NOT* be able to see it if they don't have permissions for "
                  "that Collection"))
    (mt/with-full-data-perms-for-all-users!
      (binding [api/*current-user-permissions-set* (atom #{})]
        (is (= false
               (mi/can-read? dash)))))

    (testing "Do we have *write* Permissions for a Dashboard if we have *write* Permissions for the Collection its in?"
      (binding [api/*current-user-permissions-set* (atom #{(perms/collection-readwrite-path collection)})]
        (mi/can-write? dash)))))

(deftest transient-dashboards-test
  (testing "test that we save a transient dashboard"
    (tu/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Collection]
      (let [rastas-personal-collection (collection/user->personal-collection (test.users/user->id :rasta))]
        (binding [api/*current-user-id*              (test.users/user->id :rasta)
                  api/*current-user-permissions-set* (-> :rasta test.users/user->id perms/user-permissions-set atom)]
          (let [dashboard       (magic/automagic-analysis (t2/select-one :model/Table :id (mt/id :venues)) {})
                saved-dashboard (dashboard/save-transient-dashboard! dashboard (u/the-id rastas-personal-collection))]
            (is (= (t2/count :model/DashboardCard :dashboard_id (u/the-id saved-dashboard))
                   (-> dashboard :dashcards count)))))))))

(deftest validate-collection-namespace-test
  (mt/with-temp [:model/Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Dashboard in a non-normal Collection"
      (let [dashboard-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Dashboard can only go in Collections in the \"default\"(?: or :[a-z\-]+)+ namespace."
               (t2/insert! :model/Dashboard (assoc (mt/with-temp-defaults :model/Dashboard) :collection_id collection-id, :name dashboard-name))))
          (finally
            (t2/delete! :model/Dashboard :name dashboard-name)))))

    (testing "Shouldn't be able to move a Dashboard to a non-normal Collection"
      (mt/with-temp [:model/Dashboard {card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Dashboard can only go in Collections in the \"default\"(?: or :[a-z\-]+)+ namespace."
             (t2/update! :model/Dashboard card-id {:collection_id collection-id})))))))

(deftest ^:parallel validate-parameters-test
  (testing "Should validate Dashboard :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with :id and :type keys"
           (mt/with-temp [:model/Dashboard _ {:parameters {:a :b}}]))))))

(deftest validate-parameters-test-2
  (testing "Should validate Dashboard :parameters when"
    (testing "updating"
      (mt/with-temp [:model/Dashboard {:keys [id]} {:parameters []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameters must be a sequence of maps with :id and :type keys"
             (t2/update! :model/Dashboard id {:parameters [{:id 100}]})))))))

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

(deftest ^:parallel identity-hash-test
  (testing "Dashboard hashes are composed of the name and parent collection's hash"
    (let [now #t "2022-09-01T12:34:56Z"]
      (mt/with-temp [:model/Collection c1   {:name "top level" :location "/" :created_at now}
                     :model/Dashboard  dash {:name "my dashboard" :collection_id (:id c1) :created_at now}]
        (is (= "8cbf93b7"
               (serdes/raw-hash ["my dashboard" (serdes/identity-hash c1) (:created_at dash)])
               (serdes/identity-hash dash)))))))

(deftest ^:parallel descendants-test
  (testing "dashboard which have parameter's source is another card"
    (mt/with-temp
      [:model/Field     field     {:name "A field"}
       :model/Card      card      {:name "A card"}
       :model/Dashboard dashboard {:name       "A dashboard"
                                   :parameters [{:id                   "abc"
                                                 :type                 "category"
                                                 :values_source_type   "card"
                                                 :values_source_config {:card_id     (:id card)
                                                                        :value_field [:field (:id field) nil]}}]}]
      (is (= {["Card" (:id card)] {"Dashboard" (:id dashboard)}}
             (serdes/descendants "Dashboard" (:id dashboard) {}))))))

(deftest descendants-test-2
  (testing "dashboard which has a dashcard with an action"
    (mt/with-actions [{:keys [action-id]} {}]
      (mt/with-temp
        [:model/Dashboard     dashboard {:name "A dashboard"}
         :model/DashboardCard dc        {:action_id          action-id
                                         :dashboard_id       (:id dashboard)
                                         :parameter_mappings []}]
        (is (= {["Action" action-id] {"Dashboard"     (:id dashboard)
                                      "DashboardCard" (:id dc)}}
               (serdes/descendants "Dashboard" (:id dashboard) {})))))))

(deftest ^:parallel descendants-test-3
  (testing "dashboard in which its dashcards has parameter_mappings to a card"
    (mt/with-temp
      [:model/Card          card1     {:name "Card attached to dashcard"}
       :model/Card          card2     {:name "Card attached to parameters"}
       :model/Dashboard     dashboard {:parameters [{:name "Category Name"
                                                     :slug "category_name"
                                                     :id   "_CATEGORY_NAME_"
                                                     :type "category"}]}
       :model/DashboardCard dc        {:card_id            (:id card1)
                                       :dashboard_id       (:id dashboard)
                                       :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                             :card_id      (:id card2)
                                                             :target       [:dimension (mt/$ids $categories.name)]}]}]
      (is (= {["Card" (:id card1)] {"Dashboard"     (:id dashboard)
                                    "DashboardCard" (:id dc)}
              ["Card" (:id card2)] {"Dashboard"     (:id dashboard)
                                    "DashboardCard" (:id dc)}}
             (serdes/descendants "Dashboard" (:id dashboard) {}))))))

(deftest ^:parallel descendants-test-4
  (testing "dashboard in which its dashcards have series"
    (mt/with-temp
      [:model/Card                card1     {:name "Card attached to dashcard"}
       :model/Card                card2     {:name "Card attached to series in 1st position"}
       :model/Card                card3     {:name "Card attached to series in 2nd position"}
       :model/Dashboard           dashboard {:parameters [{:name "Category Name"
                                                           :slug "category_name"
                                                           :id   "_CATEGORY_NAME_"
                                                           :type "category"}]}
       :model/DashboardCard       dashcard {:card_id (:id card1), :dashboard_id (:id dashboard)}
       :model/DashboardCardSeries s2       {:dashboardcard_id (:id dashcard), :card_id (:id card2), :position 0}
       :model/DashboardCardSeries s3       {:dashboardcard_id (:id dashcard), :card_id (:id card3), :position 1}]
      (is (= (into {} (for [[card series] [[card1 nil] [card2 s2] [card3 s3]]]
                        [["Card" (:id card)] (cond-> {"Dashboard"           (:id dashboard)
                                                      "DashboardCard"       (:id dashcard)}
                                               series (assoc "DashboardCardSeries" (:id series)))]))
             (serdes/descendants "Dashboard" (:id dashboard) {}))))))

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
