(ns metabase.api.dashboard-test
  "Tests for /api/dashboard endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.api.card-test :as api.card-test]
   [metabase.api.common :as api]
   [metabase.api.dashboard :as api.dashboard]
   [metabase.api.pivots :as api.pivots]
   [metabase.dashboard-subscription-test :as dashboard-subscription-test]
   [metabase.http-client :as client]
   [metabase.models
    :refer [Action
            Card
            Collection
            Database
            Dashboard
            DashboardCard
            DashboardCardSeries
            Field
            FieldValues
            PermissionsGroup
            PermissionsGroupMembership
            Pulse
            Revision
            Table
            User]]
   [metabase.models.dashboard :as dashboard]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.dashboard-test :as dashboard-test]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.params.chain-filter :as chain-filter]
   [metabase.models.params.chain-filter-test :as chain-filter-test]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.revision :as revision]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.streaming.test-util :as streaming.test-util]
   [metabase.server.middleware.util :as mw.util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.protocols :as t2.protocols]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- remove-ids-and-booleanize-timestamps [x]
  (cond
    (map? x)
    (into {} (for [[k v] x]
               (when-not (or (= :id k)
                             (str/ends-with? k "_id"))
                 (if (#{:created_at :updated_at} k)
                   [k (boolean v)]
                   [k (remove-ids-and-booleanize-timestamps v)]))))

    (coll? x)
    (mapv remove-ids-and-booleanize-timestamps x)

    :else
    x))

(defn- user-details [user]
  (select-keys user [:common_name :date_joined :email :first_name :id :is_qbnewb :is_superuser :last_login :last_name]))

(defn- dashcard-response [{:keys [action_id card created_at updated_at] :as dashcard}]
  (-> (into {} dashcard)
      (dissoc :id :dashboard_id :card_id)
      (cond-> (nil? action_id) (dissoc :action_id))
      (assoc :created_at (boolean created_at)
             :updated_at (boolean updated_at)
             :card       (-> (into {} card)
                             (dissoc :id :database_id :table_id :created_at :updated_at :query_average_duration)
                             (update :collection_id boolean)
                             (update :collection boolean)))))

(defn- dashboard-response [{:keys [creator ordered_cards created_at updated_at] :as dashboard}]
  ;; todo: should be udpated to use mt/boolean-ids-and-timestamps
  (let [dash (-> (into {} dashboard)
                 (dissoc :id)
                 (assoc :created_at (boolean created_at)
                        :updated_at (boolean updated_at))
                 (update :entity_id boolean)
                 (update :collection_id boolean)
                 (update :collection boolean)
                 (cond->
                   (:param_values dashboard)
                   (update :param_values not-empty)))]
    (cond-> dash
      (contains? dash :last-edit-info)
      (update :last-edit-info (fn [info]
                                (-> info
                                    (update :id boolean)
                                    (update :timestamp boolean))))
      creator       (update :creator #(into {} %))
      ordered_cards (update :ordered_cards #(mapv dashcard-response %)))))

(defn- do-with-dashboards-in-a-collection [grant-collection-perms-fn! dashboards-or-ids f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (t2.with-temp/with-temp [Collection collection]
      (grant-collection-perms-fn! (perms-group/all-users) collection)
      (doseq [dashboard-or-id dashboards-or-ids]
        (t2/update! Dashboard (u/the-id dashboard-or-id) {:collection_id (u/the-id collection)}))
      (f))))

(defmacro ^:private with-dashboards-in-readable-collection [dashboards-or-ids & body]
  `(do-with-dashboards-in-a-collection perms/grant-collection-read-permissions! ~dashboards-or-ids (fn [] ~@body)))

(defmacro ^:private with-dashboards-in-writeable-collection [dashboards-or-ids & body]
  `(do-with-dashboards-in-a-collection perms/grant-collection-readwrite-permissions! ~dashboards-or-ids (fn [] ~@body)))

(defn do-with-simple-dashboard-with-tabs
  [f]
  (t2.with-temp/with-temp
    [Dashboard           {dashboard-id :id} {}

     Card                {card-id-1 :id}    {}

     Card                {card-id-2 :id}    {}
     :model/DashboardTab {dashtab-id-1 :id} {:name         "Tab 1"
                                             :dashboard_id dashboard-id
                                             :position     0}
     :model/DashboardTab {dashtab-id-2 :id} {:name         "Tab 2"
                                             :dashboard_id dashboard-id
                                             :position     1}
     DashboardCard       {dashcard-id-1 :id} {:dashboard_id     dashboard-id
                                              :card_id          card-id-1
                                              :dashboard_tab_id dashtab-id-1
                                              :row              1}
     DashboardCard       {dashcard-id-2 :id} {:dashboard_id     dashboard-id
                                              :card_id          card-id-2
                                              :dashboard_tab_id dashtab-id-2
                                              :row              2}]
    (f {:dashboard-id  dashboard-id
        :card-id-1     card-id-1
        :card-id-2     card-id-1
        :dashtab-id-1  dashtab-id-1
        :dashtab-id-2  dashtab-id-2
        :dashcard-id-1 dashcard-id-1
        :dashcard-id-2 dashcard-id-2})))

(defmacro with-simple-dashboard-with-tabs
  "Create a simple dashboard with 2 tabs and 2 cards in each tab and run `body` with the dashboard and cards ids bound to"
  [[bindings] & body]
  `(do-with-simple-dashboard-with-tabs (fn [~bindings] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     /api/dashboard/* AUTHENTICATION Tests                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest auth-test
  (is (= (get mw.util/response-unauthentic :body)
         (client/client :get 401 "dashboard")
         (client/client :put 401 "dashboard/13"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/dashboard                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-dashboard-validation-test
  (testing "POST /api/dashboard"
    (is (= {:errors {:name "value must be a non-blank string."}}
           (mt/user-http-request :rasta :post 400 "dashboard" {})))

    (is (= {:errors {:parameters (str "value may be nil, or if non-nil, value must be an array. "
                                      "Each parameter must be a map with :id and :type keys")}}
           (mt/user-http-request :crowberto :post 400 "dashboard" {:name       "Test"
                                                                   :parameters "abc"})))))

(def ^:private dashboard-defaults
  {:archived                false
   :caveats                 nil
   :collection_id           nil
   :collection_position     nil
   :collection              true
   :created_at              true ; assuming you call dashboard-response on the results
   :description             nil
   :embedding_params        nil
   :enable_embedding        false
   :entity_id               true
   :made_public_by_id       nil
   :parameters              []
   :points_of_interest      nil
   :cache_ttl               nil
   :position                nil
   :public_uuid             nil
   :auto_apply_filters      true
   :show_in_getting_started false
   :updated_at              true})

(deftest create-dashboard-test
  (testing "POST /api/dashboard"
    (mt/with-non-admin-groups-no-root-collection-perms
      (t2.with-temp/with-temp [Collection collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (let [test-dashboard-name "Test Create Dashboard"]
          (try
            (is (= (merge
                    dashboard-defaults
                    {:name           test-dashboard-name
                     :creator_id     (mt/user->id :rasta)
                     :parameters     [{:id "abc123", :name "test", :type "date"}]
                     :updated_at     true
                     :created_at     true
                     :collection_id  true
                     :collection     false
                     :cache_ttl      1234
                     :last-edit-info {:timestamp true :id true :first_name "Rasta"
                                      :last_name "Toucan" :email "rasta@metabase.com"}})
                   (-> (mt/user-http-request :rasta :post 200 "dashboard" {:name          test-dashboard-name
                                                                           :parameters    [{:id "abc123", :name "test", :type "date"}]
                                                                           :cache_ttl     1234
                                                                           :collection_id (u/the-id collection)})
                       dashboard-response)))
            (finally
              (t2/delete! Dashboard :name test-dashboard-name))))))))

(deftest create-dashboard-with-collection-position-test
  (testing "POST /api/dashboard"
    (testing "Make sure we can create a Dashboard with a Collection position"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (let [dashboard-name (mt/random-name)]
            (try
              (mt/user-http-request :rasta :post 200 "dashboard" {:name                dashboard-name
                                                                  :collection_id       (u/the-id collection)
                                                                  :collection_position 1000})
              (is (=? {:collection_id true, :collection_position 1000}
                      (some-> (t2/select-one [Dashboard :collection_id :collection_position] :name dashboard-name)
                              (update :collection_id (partial = (u/the-id collection))))))
              (finally
                (t2/delete! Dashboard :name dashboard-name)))))

        (testing "..but not if we don't have permissions for the Collection"
          (t2.with-temp/with-temp [Collection collection]
            (let [dashboard-name (mt/random-name)]
              (mt/user-http-request :rasta :post 403 "dashboard" {:name                dashboard-name
                                                                  :collection_id       (u/the-id collection)
                                                                  :collection_position 1000})
              (is (= nil
                     (some-> (t2/select-one [Dashboard :collection_id :collection_position] :name dashboard-name)
                             (update :collection_id (partial = (u/the-id collection)))))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             GET /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-dashboard-test
  (mt/dataset sample-dataset
    (mt/with-column-remappings [orders.user_id people.name]
      (binding [api/*current-user-permissions-set* (atom #{"/"})]
        (t2.with-temp/with-temp
          [Dashboard {dashboard-id :id} {:name             "Test Dashboard"
                                         :creator_id       (mt/user->id :crowberto)
                                         :embedding_params {:id "enabled", :name "enabled", :source "enabled", :user_id "enabled"}
                                         :parameters       [{:name "Id", :slug "id", :id "a", :type :id}
                                                            {:name "Name", :slug "name", :id "b", :type :category}
                                                            {:name "Source", :slug "source", :id "c", :type :category}
                                                            {:name "User", :slug "user_id", :id "d", :type :id}]}
           Card {card-id :id} {:database_id   (mt/id)
                               :query_type    :native
                               :name          "test question"
                               :creator_id    (mt/user->id :crowberto)
                               :dataset_query {:type     :native
                                               :native   {:query "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */"
                                                          :template-tags
                                                          {"id"      {:name         "id"
                                                                      :display-name "Id"
                                                                      :type         :dimension
                                                                      :dimension    [:field (mt/id :people :id) nil]
                                                                      :widget-type  :id
                                                                      :default      nil}
                                                           "name"    {:name         "name"
                                                                      :display-name "Name"
                                                                      :type         :dimension
                                                                      :dimension    [:field (mt/id :people :name) nil]
                                                                      :widget-type  :category
                                                                      :default      nil}
                                                           "source"  {:name         "source"
                                                                      :display-name "Source"
                                                                      :type         :dimension
                                                                      :dimension    [:field (mt/id :people :source) nil]
                                                                      :widget-type  :category
                                                                      :default      nil}
                                                           "user_id" {:name         "user_id"
                                                                      :display-name "User"
                                                                      :type         :dimension
                                                                      :dimension    [:field (mt/id :orders :user_id) nil]
                                                                      :widget-type  :id
                                                                      :default      nil}}}
                                               :database (mt/id)}}
           DashboardCard _ {:parameter_mappings [{:parameter_id "a", :card_id card-id, :target [:dimension [:template-tag "id"]]}
                                                 {:parameter_id "b", :card_id card-id, :target [:dimension [:template-tag "name"]]}
                                                 {:parameter_id "c", :card_id card-id, :target [:dimension [:template-tag "source"]]}
                                                 {:parameter_id "d", :card_id card-id, :target [:dimension [:template-tag "user_id"]]}]
                            :card_id            card-id
                            :dashboard_id       dashboard-id}]
          (is (#'api.dashboard/get-dashboard dashboard-id)))))))

(deftest fetch-dashboard-test
  (testing "GET /api/dashboard/:id"
    (testing "fetch a dashboard WITH a dashboard card on it"
      (mt/with-temp* [Dashboard           [{dashboard-id :id
                                            :as          dashboard}    {:name "Test Dashboard"}]
                      Card                [{card-id :id
                                            :as     card}         {:name "Dashboard Test Card"}]
                      :model/DashboardTab [{dashtab-id :id}   {:name "Test Dashboard Tab" :position 0 :dashboard_id dashboard-id}]
                      DashboardCard       [dashcard           {:dashboard_id dashboard-id :card_id card-id :dashboard_tab_id dashtab-id}]
                      User                [{user-id :id}      {:first_name "Test" :last_name "User"
                                                               :email      "test@example.com"}]
                      Revision            [_                  {:user_id  user-id
                                                               :model    "Dashboard"
                                                               :model_id dashboard-id
                                                               :object   (revision/serialize-instance dashboard
                                                                                                      dashboard-id
                                                                                                      dashboard)}]]
        (with-dashboards-in-readable-collection [dashboard-id]
          (api.card-test/with-cards-in-readable-collection [card-id]
            (is (=? (merge
                     dashboard-defaults
                     {:name                       "Test Dashboard"
                      :creator_id                 (mt/user->id :rasta)
                      :collection                 true
                      :collection_id              true
                      :collection_authority_level nil
                      :can_write                  false
                      :param_fields               nil
                      :param_values               nil
                      :last-edit-info             {:timestamp true :id true :first_name "Test" :last_name "User" :email "test@example.com"}
                      :ordered_tabs               [{:name "Test Dashboard Tab" :position 0 :id dashtab-id :dashboard_id dashboard-id}]
                      :ordered_cards              [{:size_x                     4
                                                    :size_y                     4
                                                    :col                        0
                                                    :row                        0
                                                    :collection_authority_level nil
                                                    :updated_at                 true
                                                    :created_at                 true
                                                    :entity_id                  (:entity_id dashcard)
                                                    :parameter_mappings         []
                                                    :visualization_settings     {}
                                                    :dashboard_tab_id           dashtab-id
                                                    :card                       (merge api.card-test/card-defaults-no-hydrate
                                                                                       {:name                   "Dashboard Test Card"
                                                                                        :creator_id             (mt/user->id :rasta)
                                                                                        :collection_id          true
                                                                                        :display                "table"
                                                                                        :entity_id              (:entity_id card)
                                                                                        :visualization_settings {}
                                                                                        :result_metadata        nil})
                                                    :series                     []}]})
                   (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))))))))

    (testing "a dashboard that has link cards on it"
      (let [link-card-info-from-resp
            (fn [resp]
              (->> resp
                   :ordered_cards
                   (map (fn [dashcard] (or (get-in dashcard [:visualization_settings :link :entity])
                                           ;; get for link card
                                           (get-in dashcard [:visualization_settings :link]))))))]
        (t2.with-temp/with-temp
          [Dashboard dashboard {:name "Test Dashboard"}]
          (dashboard-subscription-test/with-link-card-fixture-for-dashboard dashboard [{:keys [collection-id
                                                                                               database-id
                                                                                               table-id
                                                                                               dashboard-id
                                                                                               card-id
                                                                                               model-id]}]
            (is (= [{:id collection-id :model "collection":name "Linked collection name"  :description "Linked collection desc"  :display nil
                     :db_id nil   :collection_id     nil}
                    {:id database-id   :model "database"  :name "Linked database name"  :description "Linked database desc"  :display nil
                     :db_id nil   :collection_id     nil}
                    {:id table-id      :model "table"     :name "Linked table dname" :description "Linked table desc"     :display nil
                     :db_id database-id :collection_id     nil}
                    {:id dashboard-id  :model "dashboard" :name "Linked Dashboard name" :description "Linked Dashboard desc" :display nil
                     :db_id nil   :collection_id     collection-id}
                    {:id card-id  :model "card"      :name "Linked card name"      :description "Linked card desc"      :display "bar"
                     :db_id nil   :collection_id     collection-id}
                    {:id model-id :model "dataset"   :name "Linked model name"     :description "Linked model desc"     :display "table"
                     :db_id nil   :collection_id     collection-id}
                    {:url "https://metabase.com"}]
                   (link-card-info-from-resp
                     (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" (:id dashboard))))))

           (testing "should return restricted if user doesn't have permission to view the models"
             (perms/revoke-data-perms! (perms-group/all-users) database-id)
             (is (= #{{:restricted true} {:url "https://metabase.com"}}
                    (set (link-card-info-from-resp
                           (mt/user-http-request :lucky :get 200 (format "dashboard/%d" (:id dashboard))))))))))))

    (testing "fetch a dashboard with a param in it"
      (mt/with-temp* [Table         [{table-id :id} {}]
                      Field         [{field-id :id display-name :display_name} {:table_id table-id}]

                      Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id
                                      :as     card}     {:name "Dashboard Test Card"}]
                      DashboardCard [dashcard           {:dashboard_id       dashboard-id
                                                         :card_id            card-id
                                                         :parameter_mappings [{:card_id      1
                                                                               :parameter_id "foo"
                                                                               :target       [:dimension [:field field-id nil]]}]}]]
        (with-dashboards-in-readable-collection [dashboard-id]
          (api.card-test/with-cards-in-readable-collection [card-id]
            (is (= (merge dashboard-defaults
                          {:name                       "Test Dashboard"
                           :creator_id                 (mt/user->id :rasta)
                           :collection_id              true
                           :collection_authority_level nil
                           :can_write                  false
                           :param_values               nil
                           :param_fields               {field-id {:id               field-id
                                                                  :table_id         table-id
                                                                  :display_name     display-name
                                                                  :base_type        "type/Text"
                                                                  :semantic_type    nil
                                                                  :has_field_values "search"
                                                                  :name_field       nil
                                                                  :dimensions       []}}
                           :ordered_tabs               []
                           :ordered_cards              [{:size_x                     4
                                                         :size_y                     4
                                                         :col                        0
                                                         :row                        0
                                                         :updated_at                 true
                                                         :created_at                 true
                                                         :entity_id                  (:entity_id dashcard)
                                                         :collection_authority_level nil
                                                         :parameter_mappings         [{:card_id      1
                                                                                       :parameter_id "foo"
                                                                                       :target       ["dimension" ["field" field-id nil]]}]
                                                         :visualization_settings     {}
                                                         :dashboard_tab_id           nil
                                                         :card                       (merge api.card-test/card-defaults-no-hydrate
                                                                                            {:name                   "Dashboard Test Card"
                                                                                             :creator_id             (mt/user->id :rasta)
                                                                                             :collection_id          true
                                                                                             :collection             false
                                                                                             :entity_id              (:entity_id card)
                                                                                             :display                "table"
                                                                                             :query_type             nil
                                                                                             :visualization_settings {}
                                                                                             :result_metadata        nil})
                                                         :series                     []}]})
                   (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))))))))
    (testing "fetch a dashboard from an official collection includes the collection type"
      (mt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                      DashboardCard [_                  {:dashboard_id dashboard-id, :card_id card-id}]]
        (with-dashboards-in-readable-collection [dashboard-id]
          (api.card-test/with-cards-in-readable-collection [card-id]
            (is (nil?
                 (-> (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))
                     :collection_authority_level)))
            (let [collection-id (:collection_id (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))]
              (t2/update! Collection collection-id {:authority_level "official"}))
            (is (= "official"
                   (-> (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))
                       :collection_authority_level)))))))))

(deftest fetch-dashboard-permissions-test
  (testing "GET /api/dashboard/:id"
    (testing "Fetch Dashboard with a series, should fail if the User doesn't have access to the Collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection          [{coll-id :id}      {:name "Collection 1"}]
                        Dashboard           [{dashboard-id :id} {:name       "Test Dashboard"
                                                                 :creator_id (mt/user->id :crowberto)}]
                        Card                [{card-id :id}      {:name          "Dashboard Test Card"
                                                                 :collection_id coll-id}]
                        Card                [{card-id2 :id}     {:name          "Dashboard Test Card 2"
                                                                 :collection_id coll-id}]
                        DashboardCard       [{dbc_id :id}       {:dashboard_id dashboard-id, :card_id card-id}]
                        DashboardCardSeries [_                  {:dashboardcard_id dbc_id, :card_id card-id2
                                                                 :position         0}]]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "dashboard/%d" dashboard-id)))))))))

(deftest param-values-test
  (testing "Don't return `param_values` for Fields for which the current User has no data perms."
    (mt/with-temp-copy-of-db
      (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
      (perms/grant-permissions! (perms-group/all-users) (perms/table-read-path (mt/id :venues)))
      (mt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                      DashboardCard [{_ :id}            {:dashboard_id       dashboard-id
                                                         :card_id            card-id
                                                         :parameter_mappings [{:card_id      card-id
                                                                               :parameter_id "foo"
                                                                               :target       [:dimension
                                                                                              [:field (mt/id :venues :name) nil]]}
                                                                              {:card_id      card-id
                                                                               :parameter_id "bar"
                                                                               :target       [:dimension
                                                                                              [:field (mt/id :categories :name) nil]]}]}]]

        (is (= {(mt/id :venues :name) {:values                ["20th Century Cafe"
                                                               "25°"
                                                               "33 Taps"]
                                       :field_id              (mt/id :venues :name)
                                       :human_readable_values []}}
               (let [response (:param_values (mt/user-http-request :rasta :get 200 (str "dashboard/" dashboard-id)))]
                 (into {} (for [[field-id m] response]
                            [field-id (update m :values (partial take 3))])))))))))



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             PUT /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-test
  (testing "PUT /api/dashboard/:id"
    (t2.with-temp/with-temp [Dashboard {dashboard-id :id} {:name "Test Dashboard"}]
      (with-dashboards-in-writeable-collection [dashboard-id]
        (testing "GET before update"
          (is (= (merge dashboard-defaults {:name          "Test Dashboard"
                                            :creator_id    (mt/user->id :rasta)
                                            :collection    false
                                            :collection_id true})
                 (dashboard-response (t2/select-one Dashboard :id dashboard-id)))))

        (testing "PUT response"
          (is (= (merge dashboard-defaults {:name           "My Cool Dashboard"
                                            :description    "Some awesome description"
                                            :creator_id     (mt/user->id :rasta)
                                            :cache_ttl      1234
                                            :last-edit-info {:timestamp true     :id    true :first_name "Rasta"
                                                             :last_name "Toucan" :email "rasta@metabase.com"}
                                            :collection     false
                                            :collection_id  true})
                 (dashboard-response
                  (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                        {:name        "My Cool Dashboard"
                                         :description "Some awesome description"
                                         :cache_ttl   1234
                                         ;; these things should fail to update
                                         :creator_id  (mt/user->id :trashbird)})))))

        (testing "GET after update"
          (is (= (merge dashboard-defaults {:name          "My Cool Dashboard"
                                            :description   "Some awesome description"
                                            :cache_ttl     1234
                                            :creator_id    (mt/user->id :rasta)
                                            :collection    false
                                            :collection_id true})
                 (dashboard-response (t2/select-one Dashboard :id dashboard-id)))))

        (testing "No-op PUT: Do not return 500"
          (t2.with-temp/with-temp [Card          {card-id :id} {}
                                   DashboardCard dashcard      {:card_id card-id, :dashboard_id dashboard-id}]
            ;; so, you can't actually set `:cards` with THIS endpoint (you have to use PUT /api/dashboard/:id/cards)
            ;; but the e2e tests are trying to do it. With Toucan 1, it would silently do nothing and return truthy for
            ;; whatever reason (I'm guessing it was a bug?) if you did something like (update! Dashboard 1 {}). Toucan 2
            ;; returns falsey, since it doesn't do anything, which is what Toucan 1 SAID it was supposed to do.
            ;;
            ;; In the interest of un-busting the e2e tests let's just check to make sure the endpoint no-ops
            (is (=? {:id dashboard-id}
                    (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                          {:cards [(select-keys dashcard [:id :card_id :row_col :size_x :size_y])]})))))))
    (testing "auto_apply_filters test"
      (doseq [enabled? [true false]]
        (t2.with-temp/with-temp [Dashboard {dashboard-id :id} {:name "Test Dashboard"
                                                               :auto_apply_filters enabled?}]
          (testing "Can set it"
            (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                  {:auto_apply_filters (not enabled?)})
            (is (= (not enabled?)
                   (t2/select-one-fn :auto_apply_filters Dashboard :id dashboard-id))))
          (testing "If not in put it is not changed"
            (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                  {:description "foo"})
            (is (= (not enabled?)
                   (t2/select-one-fn :auto_apply_filters Dashboard :id dashboard-id)))))))))

(deftest update-dashboard-guide-columns-test
  (testing "PUT /api/dashboard/:id"
    (testing "allow `:caveats` and `:points_of_interest` to be empty strings, and `:show_in_getting_started` should be a boolean"
      (t2.with-temp/with-temp [Dashboard {dashboard-id :id} {:name "Test Dashboard"}]
        (with-dashboards-in-writeable-collection [dashboard-id]
          (is (= (merge dashboard-defaults {:name                    "Test Dashboard"
                                            :creator_id              (mt/user->id :rasta)
                                            :collection              false
                                            :collection_id           true
                                            :caveats                 ""
                                            :points_of_interest      ""
                                            :cache_ttl               1337
                                            :last-edit-info
                                            {:timestamp true, :id true, :first_name "Rasta"
                                             :last_name "Toucan", :email "rasta@metabase.com"}
                                            :show_in_getting_started true})
                 (dashboard-response (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                                           {:caveats                 ""
                                                            :points_of_interest      ""
                                                            :cache_ttl               1337
                                                            :show_in_getting_started true})))))))))

(deftest update-dashboard-clear-description-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we clear the description of a Dashboard? (#4738)"
      (t2.with-temp/with-temp [Dashboard dashboard {:description "What a nice Dashboard"}]
        (with-dashboards-in-writeable-collection [dashboard]
          (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard)) {:description nil})
          (is (= nil
                 (t2/select-one-fn :description Dashboard :id (u/the-id dashboard))))

          (testing "Set to a blank description"
            (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard)) {:description ""})
            (is (= ""
                   (t2/select-one-fn :description Dashboard :id (u/the-id dashboard))))))))))

(deftest update-dashboard-change-collection-id-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we change the Collection a Dashboard is in (assuming we have the permissions to do so)?"
      (dashboard-test/with-dash-in-collection [_db collection dash]
        (t2.with-temp/with-temp [Collection new-collection]
          ;; grant Permissions for both new and old collections
          (doseq [coll [collection new-collection]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
          ;; now make an API call to move collections
          (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dash)) {:collection_id (u/the-id new-collection)})
          ;; Check to make sure the ID has changed in the DB
          (is (= (t2/select-one-fn :collection_id Dashboard :id (u/the-id dash))
                 (u/the-id new-collection))))))

    (testing "if we don't have the Permissions for the old collection, we should get an Exception"
      (mt/with-non-admin-groups-no-root-collection-perms
        (dashboard-test/with-dash-in-collection [_db _collection dash]
          (t2.with-temp/with-temp [Collection new-collection]
            ;; grant Permissions for only the *new* collection
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
            ;; now make an API call to move collections. Should fail
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dash))
                                         {:collection_id (u/the-id new-collection)})))))))

    (testing "if we don't have the Permissions for the new collection, we should get an Exception"
      (mt/with-non-admin-groups-no-root-collection-perms
        (dashboard-test/with-dash-in-collection [_db collection dash]
          (t2.with-temp/with-temp [Collection new-collection]
            ;; grant Permissions for only the *old* collection
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            ;; now make an API call to move collections. Should fail
            (is (schema= {:message (s/eq "You do not have curate permissions for this Collection.")
                          s/Keyword s/Any}
                         (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dash))
                                               {:collection_id (u/the-id new-collection)})))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    UPDATING DASHBOARD COLLECTION POSITIONS                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-change-collection-position-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we change the Collection position of a Dashboard?"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [collection]
                        Dashboard  [dashboard {:collection_id (u/the-id collection)}]]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                {:collection_position 1})
          (is (= 1
                 (t2/select-one-fn :collection_position Dashboard :id (u/the-id dashboard))))

          (testing "...and unset (unpin) it as well?"
            (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                  {:collection_position nil})
            (is (= nil
                   (t2/select-one-fn :collection_position Dashboard :id (u/the-id dashboard))))))

        (testing "we shouldn't be able to if we don't have permissions for the Collection"
          (mt/with-temp* [Collection [collection]
                          Dashboard  [dashboard {:collection_id (u/the-id collection)}]]
            (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dashboard))
                                  {:collection_position 1})
            (is (= nil
                   (t2/select-one-fn :collection_position Dashboard :id (u/the-id dashboard)))))

          (mt/with-temp* [Collection [collection]
                          Dashboard  [dashboard {:collection_id (u/the-id collection), :collection_position 1}]]
            (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dashboard))
                                  {:collection_position nil})
            (is (= 1
                   (t2/select-one-fn :collection_position Dashboard :id (u/the-id dashboard))))))))))

(deftest update-dashboard-position-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (t2.with-temp/with-temp [Collection collection]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (letfn [(move-dashboard! [dashboard new-position]
                (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                      {:collection_position new-position}))
              (items []
                (api.card-test/get-name->collection-position :rasta collection))]
        (testing "Check that we can update a dashboard's position in a collection of only dashboards"
          (api.card-test/with-ordered-items collection [Dashboard a
                                                        Dashboard b
                                                        Dashboard c
                                                        Dashboard d]
            (move-dashboard! b 4)
            (is (= {"a" 1, "c" 2, "d" 3, "b" 4}
                   (items)))))

        (testing "Check that updating a dashboard at position 3 to position 1 will increment the positions before 3, not after"
          (api.card-test/with-ordered-items collection [Card      a
                                                        Pulse     b
                                                        Dashboard c
                                                        Dashboard d]
            (move-dashboard! c 1)
            (is (= {"c" 1, "a" 2, "b" 3, "d" 4}
                   (items)))))

        (testing "Check that updating position 1 to 3 will cause b and c to be decremented"
          (api.card-test/with-ordered-items collection [Dashboard a
                                                        Card      b
                                                        Pulse     c
                                                        Dashboard d]
            (move-dashboard! a 3)
            (is (= {"b" 1, "c" 2, "a" 3, "d" 4}
                   (items)))))


        (testing "Check that updating position 1 to 4 will cause a through c to be decremented"
          (api.card-test/with-ordered-items collection [Dashboard a
                                                        Card      b
                                                        Pulse     c
                                                        Pulse     d]
            (move-dashboard! a 4)
            (is (= {"b" 1, "c" 2, "d" 3, "a" 4}
                   (items)))))

        (testing "Check that updating position 4 to 1 will cause a through c to be incremented"
          (api.card-test/with-ordered-items collection [Card      a
                                                        Pulse     b
                                                        Card      c
                                                        Dashboard d]
            (move-dashboard! d 1)
            (is (= {"d" 1, "a" 2, "b" 3, "c" 4}
                   (items)))))))))

(deftest move-dashboard-to-different-collection-test
  (testing "Check that moving a dashboard to another collection will fixup both collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection-1]
                      Collection [collection-2]]
        (api.card-test/with-ordered-items collection-1 [Dashboard a
                                                        Card      b
                                                        Card      c
                                                        Pulse     d]
          (api.card-test/with-ordered-items collection-2 [Pulse     e
                                                          Pulse     f
                                                          Dashboard g
                                                          Card      h]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
            ;; Move the first dashboard in collection-1 to collection-1
            (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id a))
                                  {:collection_position 1, :collection_id (u/the-id collection-2)})
            ;; "a" should now be gone from collection-1 and all the existing dashboards bumped down in position
            (testing "original collection"
              (is (= {"b" 1
                      "c" 2
                      "d" 3}
                     (api.card-test/get-name->collection-position :rasta collection-1))))
            ;; "a" is now first, all other dashboards in collection-2 bumped down 1
            (testing "new collection"
              (is (= {"a" 1
                      "e" 2
                      "f" 3
                      "g" 4
                      "h" 5}
                     (api.card-test/get-name->collection-position :rasta collection-2))))))))))

(deftest insert-dashboard-increment-existing-collection-position-test
  (testing "POST /api/dashboard"
    (testing "Check that adding a new Dashboard at Collection position 3 will increment position of the existing item at position 3"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (api.card-test/with-ordered-items collection [Card  a
                                                        Pulse b
                                                        Card  d]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (is (= {"a" 1
                    "b" 2
                    "d" 3}
                   (api.card-test/get-name->collection-position :rasta collection)))
            (try
              (mt/user-http-request :rasta :post 200 "dashboard" {:name                "c"
                                                                  :collection_id       (u/the-id collection)
                                                                  :collection_position 3})
              (is (= {"a" 1
                      "b" 2
                      "c" 3
                      "d" 4}
                     (api.card-test/get-name->collection-position :rasta collection)))
              (finally
                (t2/delete! Dashboard :collection_id (u/the-id collection))))))))))

(deftest insert-dashboard-no-position-test
  (testing "POST /api/dashboard"
    (testing "Check that adding a new Dashboard without a position, leaves the existing positions unchanged"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (api.card-test/with-ordered-items collection [Dashboard a
                                                        Card      b
                                                        Pulse     d]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (is (= {"a" 1
                    "b" 2
                    "d" 3}
                   (api.card-test/get-name->collection-position :rasta collection)))
            (try
              (mt/user-http-request :rasta :post 200 "dashboard" {:name          "c"
                                                                  :collection_id (u/the-id collection)})
              (is (= {"a" 1
                      "b" 2
                      "c" nil
                      "d" 3}
                     (api.card-test/get-name->collection-position :rasta collection)))
              (finally
                (t2/delete! Dashboard :collection_id (u/the-id collection))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           DELETE /api/dashboard/:id                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-test
  (t2.with-temp/with-temp [Dashboard {dashboard-id :id}]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (is (= nil
             (mt/user-http-request :rasta :delete 204 (format "dashboard/%d" dashboard-id))))
      (is (= nil
             (t2/select-one Dashboard :id dashboard-id))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/copy                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest copy-dashboard-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "A plain copy with nothing special"
      (t2.with-temp/with-temp [Dashboard dashboard {:name        "Test Dashboard"
                                                    :description "A description"
                                                    :creator_id  (mt/user->id :rasta)}]
        (let [response (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" (:id dashboard)))]
          (try
            (is (= (merge
                    dashboard-defaults
                    {:name          "Test Dashboard"
                     :description   "A description"
                     :creator_id    (mt/user->id :rasta)
                     :collection    false
                     :collection_id false})
                   (dashboard-response response)))
            (is (some? (:entity_id response)))
            (is (not=  (:entity_id dashboard) (:entity_id response))
                "The copy should have a new entity ID generated")
            (finally
              (t2/delete! Dashboard :id (u/the-id response)))))))

    (testing "Ensure name / description / user set when copying"
      (t2.with-temp/with-temp [Dashboard dashboard  {:name        "Test Dashboard"
                                                     :description "An old description"}]
        (let [response (mt/user-http-request :crowberto :post 200 (format "dashboard/%d/copy" (:id dashboard))
                                             {:name        "Test Dashboard - Duplicate"
                                              :description "A new description"})]
          (try
            (is (= (merge
                    dashboard-defaults
                    {:name          "Test Dashboard - Duplicate"
                     :description   "A new description"
                     :creator_id    (mt/user->id :crowberto)
                     :collection_id false
                     :collection    false})
                   (dashboard-response response)))
            (is (some? (:entity_id response)))
            (is (not= (:entity_id dashboard) (:entity_id response))
                "The copy should have a new entity ID generated")
            (finally
              (t2/delete! Dashboard :id (u/the-id response))))))))

  (testing "Deep copy: POST /api/dashboard/:id/copy"
    (mt/dataset sample-dataset
      (mt/with-temp* [Collection [source-coll {:name "Source collection"}]
                      Collection [dest-coll   {:name "Destination collection"}]
                      Dashboard  [dashboard {:name          "Dashboard to be Copied"
                                             :description   "A description"
                                             :collection_id (u/the-id source-coll)
                                             :creator_id    (mt/user->id :rasta)}]
                      Card       [total-card  {:name "Total orders per month"
                                               :collection_id (u/the-id source-coll)
                                               :display :line
                                               :visualization_settings
                                               {:graph.dimensions ["CREATED_AT"]
                                                :graph.metrics ["sum"]}
                                               :dataset_query
                                               (mt/$ids
                                                 {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table $$orders
                                                             :aggregation  [[:sum $orders.total]]
                                                             :breakout     [!month.orders.created_at]}})}]
                      Card      [avg-card  {:name "Average orders per month"
                                            :collection_id (u/the-id source-coll)
                                            :display :line
                                            :visualization_settings
                                            {:graph.dimensions ["CREATED_AT"]
                                             :graph.metrics ["sum"]}
                                            :dataset_query
                                            (mt/$ids
                                              {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table $$orders
                                                          :aggregation  [[:avg $orders.total]]
                                                          :breakout     [!month.orders.created_at]}})}]
                      Card          [model {:name "A model"
                                            :collection_id (u/the-id source-coll)
                                            :dataset true
                                            :dataset_query
                                            (mt/$ids
                                              {:database (mt/id)
                                               :type :query
                                               :query {:source-table $$orders
                                                       :limit 4}})}]
                      DashboardCard [dashcard {:dashboard_id (u/the-id dashboard)
                                               :card_id    (u/the-id total-card)
                                               :size_x 6, :size_y 6}]
                      DashboardCard [_textcard {:dashboard_id (u/the-id dashboard)
                                                :visualization_settings
                                                {:virtual_card
                                                 {:display :text}
                                                 :text "here is some text"}}]
                      DashboardCard [_        {:dashboard_id (u/the-id dashboard)
                                               :card_id    (u/the-id model)
                                               :size_x 6, :size_y 6}]
                      DashboardCardSeries [_ {:dashboardcard_id (u/the-id dashcard)
                                              :card_id (u/the-id avg-card)
                                              :position 0}]]
        (mt/with-model-cleanup [Card Dashboard DashboardCard DashboardCardSeries]
          (let [resp (mt/user-http-request :crowberto :post 200
                                           (format "dashboard/%d/copy" (:id dashboard))
                                           {:name        "New dashboard"
                                            :description "A new description"
                                            :is_deep_copy true
                                            :collection_id (u/the-id dest-coll)})]
            (is (= (:collection_id resp) (u/the-id dest-coll))
                "Dashboard should go into the destination collection")
            (is (= 3 (count (t2/select 'Card :collection_id (u/the-id source-coll)))))
            (let [copied-cards (t2/select 'Card :collection_id (u/the-id dest-coll))
                  copied-db-cards (t2/select 'DashboardCard :dashboard_id (u/the-id (:id resp)))
                  source-db-cards (t2/select 'DashboardCard :dashboard_id (u/the-id dashboard))]
              (testing "Copies all of the questions on the dashboard"
                (is (= 2 (count copied-cards))))
              (testing "Copies all of the dashboard cards"
                (is (= (count copied-db-cards) (count source-db-cards)))
                (testing "Including text cards"
                  (is (some (comp nil? :card_id) copied-db-cards))
                  (is (some (comp :text :visualization_settings) copied-db-cards))))
              (testing "Should copy cards"
                (is (= #{"Total orders per month" "Average orders per month"}
                       (into #{} (map :name) copied-cards))
                    "Should preserve the titles of the original cards"))
              (testing "Should not deep-copy models"
                (is (every? (comp false? :dataset) copied-cards)
                    "Copied a model"))))))
      (testing "When there are cards the user lacks write perms for"
        (mt/with-temp* [Collection [source-coll {:name "Source collection"}]
                        Collection [no-read-coll {:name "Crowberto lacks write coll"}]
                        Collection [dest-coll   {:name "Destination collection"}]
                        Dashboard  [dashboard {:name          "Dashboard to be Copied"
                                               :description   "A description"
                                               :collection_id (u/the-id source-coll)
                                               :creator_id    (mt/user->id :rasta)}]
                        Card       [total-card  {:name "Total orders per month"
                                                 :collection_id (u/the-id no-read-coll)
                                                 :display :line
                                                 :visualization_settings
                                                 {:graph.dimensions ["CREATED_AT"]
                                                  :graph.metrics ["sum"]}
                                                 :dataset_query
                                                 (mt/$ids
                                                   {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table $$orders
                                                               :aggregation  [[:sum $orders.total]]
                                                               :breakout     [!month.orders.created_at]}})}]
                        Card      [avg-card  {:name "Average orders per month"
                                              :collection_id (u/the-id source-coll)
                                              :display :line
                                              :visualization_settings
                                              {:graph.dimensions ["CREATED_AT"]
                                               :graph.metrics ["sum"]}
                                              :dataset_query
                                              (mt/$ids
                                                {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table $$orders
                                                            :aggregation  [[:avg $orders.total]]
                                                            :breakout     [!month.orders.created_at]}})}]
                        Card          [card {:name "A card"
                                             :collection_id (u/the-id source-coll)
                                             :dataset_query
                                             (mt/$ids
                                               {:database (mt/id)
                                                :type :query
                                                :query {:source-table $$orders
                                                        :limit 4}})}]
                        DashboardCard [dashcard {:dashboard_id (u/the-id dashboard)
                                                 :card_id    (u/the-id total-card)
                                                 :size_x 6, :size_y 6}]
                        DashboardCard [_        {:dashboard_id (u/the-id dashboard)
                                                 :card_id    (u/the-id card)
                                                 :size_x 6, :size_y 6}]
                        DashboardCardSeries [_ {:dashboardcard_id (u/the-id dashcard)
                                                :card_id (u/the-id avg-card)
                                                :position 0}]]
          (mt/with-model-cleanup [Card Dashboard DashboardCard DashboardCardSeries]
            (perms/revoke-collection-permissions! (perms-group/all-users) no-read-coll)
            (let [resp (mt/user-http-request :rasta :post 200
                                             (format "dashboard/%d/copy" (:id dashboard))
                                             {:name        "New dashboard"
                                              :description "A new description"
                                              :is_deep_copy true
                                              :collection_id (u/the-id dest-coll)})]
              (is (= (:collection_id resp) (u/the-id dest-coll))
                  "Dashboard should go into the destination collection")
              (let [copied-cards (t2/select 'Card :collection_id (u/the-id dest-coll))
                    copied-db-cards (t2/select 'DashboardCard :dashboard_id (u/the-id (:id resp)))]
                (testing "Copies only one of the questions on the dashboard"
                  (is (= 1 (count copied-cards))))
                (testing "Copies one of the dashboard cards"
                  (is (= 1 (count copied-db-cards))))
                (testing "Should copy cards"
                  (is (= #{"A card"}
                         (into #{} (map :name) copied-cards))
                      "Should preserve the titles of the original cards"))
                (testing "Should not create dashboardcardseries because the base card lacks permissions"
                  (is (empty? (t2/select DashboardCardSeries :card_id [:in (map :id copied-cards)]))))
                (testing "Response includes uncopied cards"
                  ;; cards might be full cards or just a map {:id 1} due to permissions Any card with lack of
                  ;; permissions is just {:id 1}. Cards in a series which you have permissions for, but the base card
                  ;; you lack permissions for are also not copied, but you can see the whole card.
                  (is (= 2 (->> resp :uncopied count)))))))))
      (testing "When source and destination are the same"
        (mt/with-temp* [Collection [source-coll {:name "Source collection"}]
                        Dashboard  [dashboard {:name          "Dashboard to be Copied"
                                               :description   "A description"
                                               :collection_id (u/the-id source-coll)
                                               :creator_id    (mt/user->id :rasta)}]
                        Card       [total-card  {:name "Total orders per month"
                                                 :collection_id (u/the-id source-coll)
                                                 :display :line
                                                 :visualization_settings
                                                 {:graph.dimensions ["CREATED_AT"]
                                                  :graph.metrics ["sum"]}
                                                 :dataset_query
                                                 (mt/$ids
                                                   {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table $$orders
                                                               :aggregation  [[:sum $orders.total]]
                                                               :breakout     [!month.orders.created_at]}})}]
                        Card      [avg-card  {:name "Average orders per month"
                                              :collection_id (u/the-id source-coll)
                                              :display :line
                                              :visualization_settings
                                              {:graph.dimensions ["CREATED_AT"]
                                               :graph.metrics ["sum"]}
                                              :dataset_query
                                              (mt/$ids
                                                {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table $$orders
                                                            :aggregation  [[:avg $orders.total]]
                                                            :breakout     [!month.orders.created_at]}})}]
                        Card          [card {:name "A card"
                                             :collection_id (u/the-id source-coll)
                                             :dataset_query
                                             (mt/$ids
                                               {:database (mt/id)
                                                :type :query
                                                :query {:source-table $$orders
                                                        :limit 4}})}]
                        DashboardCard [dashcard {:dashboard_id (u/the-id dashboard)
                                                 :card_id    (u/the-id total-card)
                                                 :size_x 6, :size_y 6}]
                        DashboardCard [_        {:dashboard_id (u/the-id dashboard)
                                                 :card_id    (u/the-id card)
                                                 :size_x 6, :size_y 6}]
                        DashboardCardSeries [_ {:dashboardcard_id (u/the-id dashcard)
                                                :card_id (u/the-id avg-card)
                                                :position 0}]]
          (mt/with-model-cleanup [Card Dashboard DashboardCard DashboardCardSeries]
            (let [_resp (mt/user-http-request :rasta :post 200
                                              (format "dashboard/%d/copy" (:id dashboard))
                                              {:name        "New dashboard"
                                               :description "A new description"
                                               :is_deep_copy true
                                               :collection_id (u/the-id source-coll)})
                  cards-in-coll (t2/select 'Card :collection_id (u/the-id source-coll))]
              ;; original 3 plust 3 duplicates
              (is (= 6 (count cards-in-coll)) "Not all cards were copied")
              (is (= (into #{} (comp (map :name)
                                     (mapcat (fn [n] [n (str n " - Duplicate")])))
                           [total-card avg-card card])
                     (set (map :name cards-in-coll)))
                  "Cards should have \"- Duplicate\" appended"))))))))

(defn- ordered-cards-by-position
  "Returns dashcards for a dashboard ordered by their position instead of creation like [[dashboard/ordered-cards]] does."
  [dashboard-or-id]
  (sort dashboard-card/dashcard-comparator (dashboard/ordered-cards dashboard-or-id)))

(deftest copy-dashboard-with-tab-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "for a dashboard that has tabs"
      (with-simple-dashboard-with-tabs [{:keys [dashboard-id]}]
        (let [new-dash-id        (:id (mt/user-http-request :rasta :post 200
                                                            (format "dashboard/%d/copy" dashboard-id)
                                                            {:name        "New dashboard"
                                                             :description "A new description"}))
              original-tabs      (t2/select [:model/DashboardTab :id :position :name]
                                            :dashboard_id dashboard-id
                                            {:order-by [[:position :asc]]})
              new-tabs           (t2/select [:model/DashboardTab :id :position :name]
                                            :dashboard_id new-dash-id
                                            {:order-by [[:position :asc]]})
              new->old-tab-id   (zipmap (map :id new-tabs) (map :id original-tabs))]
         (testing "Cards are located correctly between tabs"
           (is (= (map #(select-keys % [:dashboard_tab_id :card_id :row :col :size_x :size_y :dashboard_tab_id])
                       (ordered-cards-by-position dashboard-id))
                  (map #(select-keys % [:dashboard_tab_id :card_id :row :col :size_x :size_y :dashboard_tab_id])
                       (for [card (ordered-cards-by-position new-dash-id)]
                         (assoc card :dashboard_tab_id (new->old-tab-id (:dashboard_tab_id card))))))))

         (testing "new tabs should have the same name and position"
           (is (= (map #(dissoc % :id) original-tabs)
                  (map #(dissoc % :id) new-tabs)))))))))

(def ^:dynamic ^:private
  ^{:doc "Set of ids that will report [[mi/can-write]] as true."}
  *readable-card-ids* #{})

(defmethod mi/can-read? ::dispatches-on-dynamic
  ([fake-model]
   (contains? *readable-card-ids* (:id fake-model)))
  ([_fake-model id]
   (contains? *readable-card-ids* id)))

(defn- card-model
  "Return a card \"model\" that reports as a `::dispatches-on-dynamic` model type, and checking `mi/can-write?` checks
  if the `:id` is in the dynamic variable `*writable-card-ids*."
  [card]
  (with-meta card {`t2.protocols/model
                   (fn [_] ::dispatches-on-dynamic)
                   `t2.protocols/dispatch-value
                   (fn [_] ::dispatches-on-dynamic)}))

(deftest cards-to-copy-test
  (testing "Identifies all cards to be copied"
    (let [ordered-cards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                         {:card_id 3 :card (card-model{:id 3})}]]
      (binding [*readable-card-ids* #{1 2 3}]
        (is (= {:copy {1 {:id 1} 2 {:id 2} 3 {:id 3}}
                :discard []}
               (#'api.dashboard/cards-to-copy ordered-cards))))))
  (testing "Identifies cards which cannot be copied"
    (testing "If they are in a series"
      (let [ordered-cards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                           {:card_id 3 :card (card-model{:id 3})}]]
        (binding [*readable-card-ids* #{1 3}]
          (is (= {:copy {1 {:id 1} 3 {:id 3}}
                  :discard [{:id 2}]}
                 (#'api.dashboard/cards-to-copy ordered-cards))))))
    (testing "When the base of a series lacks permissions"
      (let [ordered-cards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                           {:card_id 3 :card (card-model{:id 3})}]]
        (binding [*readable-card-ids* #{3}]
          (is (= {:copy {3 {:id 3}}
                  :discard [{:id 1} {:id 2}]}
                 (#'api.dashboard/cards-to-copy ordered-cards))))))))

(deftest update-cards-for-copy-test
  (testing "When copy style is shallow returns original ordered-cards"
    (let [ordered-cards [{:card_id 1 :card {:id 1} :series [{:id 2}]}
                         {:card_id 3 :card {:id 3}}]]
      (is (= ordered-cards
             (api.dashboard/update-cards-for-copy 1
                                                  ordered-cards
                                                  false
                                                  nil
                                                  nil))))
    (testing "with tab-ids updated if dashboard has tab"
      (is (= [{:card_id 1 :card {:id 1} :dashboard_tab_id 10}
              {:card_id 3 :card {:id 3} :dashboard_tab_id 20}]
             (api.dashboard/update-cards-for-copy 1
                                                  [{:card_id 1 :card {:id 1} :dashboard_tab_id 1}
                                                   {:card_id 3 :card {:id 3} :dashboard_tab_id 2}]
                                                  false
                                                  nil
                                                  {1 10
                                                   2 20})))))
  (testing "When copy style is deep"
    (let [ordered-cards [{:card_id 1 :card {:id 1} :series [{:id 2} {:id 3}]}]]
      (testing "Can omit series cards"
        (is (= [{:card_id 5 :card {:id 5} :series [{:id 6}]}]
               (api.dashboard/update-cards-for-copy 1
                                                    ordered-cards
                                                    true
                                                    {1 {:id 5}
                                                     2 {:id 6}}
                                                    nil)))))
    (testing "Can omit whole card with series if not copied"
      (let [ordered-cards [{:card_id 1 :card {} :series [{:id 2} {:id 3}]}
                           {:card_id 4 :card {} :series [{:id 5} {:id 6}]}]]
        (is (= [{:card_id 7 :card {:id 7} :series [{:id 8} {:id 9}]}]
               (api.dashboard/update-cards-for-copy 1
                                                    ordered-cards
                                                    true
                                                    {1 {:id 7}
                                                     2 {:id 8}
                                                     3 {:id 9}
                                                     ;; not copying id 4 which is the base of the following two
                                                     5 {:id 10}
                                                     6 {:id 11}}
                                                    nil)))))
    (testing "Updates parameter mappings to new card ids"
      (let [ordered-cards [{:card_id            1
                            :card               {:id 1}
                            :parameter_mappings [{:parameter_id "72d27de6"
                                                  :card_id      1
                                                  :target       [:dimension
                                                                 [:field 63 nil]]}]}]]
        (is (= [{:card_id            2
                 :card               {:id 2}
                 :parameter_mappings [{:parameter_id "72d27de6"
                                       :card_id      2
                                       :target       [:dimension
                                                      [:field 63 nil]]}]}]
               (api.dashboard/update-cards-for-copy 1
                                                    ordered-cards
                                                    true
                                                    {1 {:id 2}}
                                                    nil)))))
    (testing "Throws error if no new card-id information for deep copy"
      (let [user-id      44
            dashboard-id 55
            error-data   (try
                           (binding [api/*current-user-id* user-id]
                             (api.dashboard/update-cards-for-copy dashboard-id
                                                                  [{:card_id 1 :card {:id 1}}]
                                                                  true
                                                                  nil
                                                                  nil))
                           (is false "Should have thrown with deep-copy true and no new card id info")
                           (catch Exception e (ex-data e)))]
        (is (= {:user-id user-id, :dashboard-id dashboard-id} error-data))))))

(deftest copy-dashboard-cards-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "Ensure dashboard cards and parameters are copied (#23685)"
      (mt/with-temp* [Dashboard     [{dashboard-id :id}  {:name       "Test Dashboard"
                                                          :parameters [{:name "Category ID"
                                                                        :slug "category_id"
                                                                        :id   "_CATEGORY_ID_"
                                                                        :type :category}]}]
                      Card          [{card-id :id}]
                      Card          [{card-id2 :id}]
                      DashboardCard [{dashcard-id :id} {:dashboard_id       dashboard-id
                                                        :card_id            card-id
                                                        :parameter_mappings [{:parameter_id "random-id"
                                                                              :card_id      card-id
                                                                              :target       [:dimension [:field (mt/id :venues :name) nil]]}]}]
                      DashboardCard [_ {:dashboard_id dashboard-id, :card_id card-id2}]]
        (let [copy-id (u/the-id (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" dashboard-id)))]
          (try
            (is (= 2
                   (count (t2/select-pks-set DashboardCard, :dashboard_id copy-id))))
            (is (=? [{:name "Category ID" :slug "category_id" :id "_CATEGORY_ID_" :type :category}]
                   (t2/select-one-fn :parameters Dashboard :id copy-id)))
            (is (=? [{:parameter_id "random-id"
                      :card_id      card-id
                      :target       [:dimension [:field (mt/id :venues :name) nil]]}]
                   (t2/select-one-fn :parameter_mappings DashboardCard :id dashcard-id)))
           (finally
             (t2/delete! Dashboard :id copy-id))))))))

(deftest copy-dashboard-into-correct-collection-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "Ensure the correct collection is set when copying"
      (dashboard-test/with-dash-in-collection [_db collection dash]
        (t2.with-temp/with-temp [Collection new-collection]
          ;; grant Permissions for both new and old collections
          (doseq [coll [collection new-collection]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
          (let [response (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" (u/the-id dash)) {:collection_id (u/the-id new-collection)})]
            (try
              ;; Check to make sure the ID of the collection is correct
              (is (= (t2/select-one-fn :collection_id Dashboard :id
                                       (u/the-id response))
                     (u/the-id new-collection)))
              (finally
                (t2/delete! Dashboard :id (u/the-id response))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PUT /api/dashboard/:id/cards                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-add-card-parameter-mapping-permissions-fixtures [f]
  (mt/with-temp-copy-of-db
    (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
    (mt/with-temp* [Dashboard     [{dashboard-id :id} {:parameters [{:name "Category ID"
                                                                     :slug "category_id"
                                                                     :id   "_CATEGORY_ID_"
                                                                     :type "category"}]}]
                    Card          [{card-id :id} {:database_id   (mt/id)
                                                  :table_id      (mt/id :venues)
                                                  :dataset_query (mt/mbql-query venues)}]]
      (let [mappings [{:parameter_id "_CATEGORY_ID_"
                       :target       [:dimension [:field (mt/id :venues :category_id) nil]]}]]
        ;; TODO -- check series as well?
        (f {:dashboard-id dashboard-id
            :card-id      card-id
            :mappings     mappings
            :add-card!    (fn [expected-status-code]
                            (mt/user-http-request :rasta
                                                  :put expected-status-code (format "dashboard/%d/cards" dashboard-id)
                                                  {:cards [{:id                 -1
                                                            :card_id            card-id
                                                            :row                0
                                                            :col                0
                                                            :size_x             4
                                                            :size_y             4
                                                            :parameter_mappings mappings}]
                                                   :ordered_tabs []}))
            :dashcards    (fn [] (t2/select DashboardCard :dashboard_id dashboard-id))})))))

(defn- dashcard-like-response
  [id]
  (t2/hydrate (t2/select-one DashboardCard :id id) :series))

(defn- current-cards
  "Returns the current ordered cards of a dashboard."
  [dashboard-id]
  (-> dashboard-id
      dashboard/ordered-cards
      (t2/hydrate :series)))

(defn do-with-update-cards-parameter-mapping-permissions-fixtures [f]
  (do-with-add-card-parameter-mapping-permissions-fixtures
   (fn [{:keys [dashboard-id card-id mappings]}]
     (t2.with-temp/with-temp [DashboardCard dashboard-card {:dashboard_id       dashboard-id
                                                            :card_id            card-id
                                                            :parameter_mappings mappings}]
       (let [dashcard-info     (select-keys dashboard-card [:id :size_x :size_y :row :col :parameter_mappings])
             new-mappings      [{:parameter_id "_CATEGORY_ID_"
                                 :target       [:dimension [:field (mt/id :venues :price) nil]]}]
             new-dashcard-info (assoc dashcard-info :size_x 1000)]
         (f {:dashboard-id           dashboard-id
             :card-id                card-id
             :original-mappings      mappings
             :new-mappings           new-mappings
             :original-dashcard-info dashcard-info
             :new-dashcard-info      new-dashcard-info
             :update-mappings!       (fn [expected-status-code]
                                       (mt/user-http-request :rasta :put expected-status-code
                                                             (format "dashboard/%d/cards" dashboard-id)
                                                             {:cards        [(assoc dashcard-info :parameter_mappings new-mappings)]
                                                              :ordered_tabs []}))
             :update-size!           (fn []
                                       (mt/user-http-request :rasta :put 200
                                                             (format "dashboard/%d/cards" dashboard-id)
                                                             {:cards        [new-dashcard-info]
                                                              :ordered_tabs []}))}))))))

(deftest e2e-update-cards-and-tabs-test
  (testing "PUT /api/dashboard/:id/cards with create/update/delete in a single req"
       (t2.with-temp/with-temp
         [Dashboard               {dashboard-id :id}  {}
          Card                    {card-id-1 :id}     {}
          Card                    {card-id-2 :id}     {}
          :model/DashboardTab     {dashtab-id-1 :id}  {:name "Tab 1" :dashboard_id dashboard-id :position 0}
          :model/DashboardTab     {dashtab-id-2 :id}  {:name "Tab 2" :dashboard_id dashboard-id :position 1}
          :model/DashboardTab     {dashtab-id-3 :id}  {:name "Tab 3" :dashboard_id dashboard-id :position 2}
          DashboardCard           {dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id-1, :dashboard_tab_id dashtab-id-1}
          DashboardCard           {dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id-1, :dashboard_tab_id dashtab-id-2}
          DashboardCard           {dashcard-id-3 :id} {:dashboard_id dashboard-id, :card_id card-id-1, :dashboard_tab_id dashtab-id-2}]
        (let [resp (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                                                         {:ordered_tabs  [{:id   dashtab-id-1
                                                                           :name "Tab 1 edited"}
                                                                          {:id   dashtab-id-2
                                                                           :name "Tab 2"}
                                                                          {:id   -1
                                                                           :name "New tab"}]
                                                          :cards [{:id     dashcard-id-1
                                                                   :size_x 4
                                                                   :size_y 4
                                                                   :col    1
                                                                   :row    1
                                                                   ;; initialy was in tab1, now in tab 2
                                                                   :dashboard_tab_id dashtab-id-2
                                                                   :card_id card-id-1}
                                                                  {:id     dashcard-id-2
                                                                   :dashboard_tab_id dashtab-id-2
                                                                   :size_x 2
                                                                   :size_y 2
                                                                   :col    2
                                                                   :row    2}
                                                                  ;; remove the dashcard3 and create a new card using negative numbers
                                                                  ;; and assign into the newly created dashcard
                                                                  {:id     -1
                                                                   :size_x 1
                                                                   :size_y 1
                                                                   :col    3
                                                                   :row    3
                                                                   :dashboard_tab_id -1
                                                                   :card_id card-id-2}]})]
          (testing "tabs got updated correctly "
            (is (=? [{:id           dashtab-id-1
                      :dashboard_id dashboard-id
                      :name         "Tab 1 edited"
                      :position     0}
                     {:id           dashtab-id-2
                      :dashboard_id dashboard-id
                      :name         "Tab 2"
                      :position 1}
                     {:id           #hawk/schema (s/pred pos-int?)
                      :dashboard_id dashboard-id
                      :name         "New tab"
                      :position     2}]
                    (:ordered_tabs resp)))
            (testing "dashtab 3 got deleted"
              (is (nil? (t2/select-one :model/DashboardTab :id dashtab-id-3)))))

          (testing "dashcards got updated correctly"
            (let [new-tab-id (t2/select-one-pk :model/DashboardTab :name "New tab" :dashboard_id dashboard-id)]
              (is (=? [{:id               dashcard-id-1
                        :card_id          card-id-1
                        :dashboard_tab_id dashtab-id-2
                        :size_x           4
                        :size_y           4
                        :col              1
                        :row              1}
                       {:id               dashcard-id-2
                        :dashboard_tab_id dashtab-id-2
                        :size_x           2
                        :size_y           2
                        :col              2
                        :row              2}
                       {:id               #hawk/schema (s/pred pos-int?)
                        :size_x           1
                        :size_y           1
                        :col              3
                        :row              3
                        :dashboard_tab_id new-tab-id
                        :card_id           card-id-2}]
                      (:cards resp))))
            (testing "dashcard 3 got deleted"
             (is (nil? (t2/select-one DashboardCard :id dashcard-id-3)))))))))

(deftest e2e-update-cards-only-test
  (testing "PUT /api/dashboard/:id/cards with create/update/delete in a single req"
    (t2.with-temp/with-temp
      [Dashboard           {dashboard-id :id}  {}
       Card                {card-id-1 :id}     {}
       Card                {card-id-2 :id}     {}
       DashboardCard       {dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id-1}
       DashboardCard       {dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id-1}
       DashboardCard       {dashcard-id-3 :id} {:dashboard_id dashboard-id, :card_id card-id-1}
       Card                {series-id-1 :id}   {:name "Series Card 1"}
       Card                {series-id-2 :id}   {:name "Series Card 2"}
       DashboardCardSeries _                   {:dashboardcard_id dashcard-id-1, :card_id series-id-1
                                                :position         0}]
      ;; send a request that update and create and delete some cards at the same time
      (let [cards (:cards (mt/user-http-request :crowberto :put 200 (format "dashboard/%d/cards" dashboard-id)
                                                {:cards [{:id     dashcard-id-1
                                                          :size_x 4
                                                          :size_y 4
                                                          :col    1
                                                          :row    1
                                                          ;; update series for card 1
                                                          :series  [{:id series-id-2}]
                                                          :card_id card-id-1}
                                                         {:id     dashcard-id-2
                                                          :size_x 2
                                                          :size_y 2
                                                          :col    2
                                                          :row    2}
                                                         ;; remove the dashcard3 and create a new card using negative numbers
                                                         {:id     -1
                                                          :size_x 1
                                                          :size_y 1
                                                          :col    3
                                                          :row    3
                                                          :card_id card-id-2
                                                          :series  [{:id series-id-1}]}]
                                                 :ordered_tabs []}))
            updated-card-1 {:id           dashcard-id-1
                            :card_id      card-id-1
                            :dashboard_id dashboard-id
                            :size_x       4
                            :size_y       4
                            :action_id    nil
                            :row          1
                            :col          1
                            :series       [{:name "Series Card 2"}]}
            updated-card-2 {:id           dashcard-id-2
                            :card_id      card-id-1
                            :dashboard_id dashboard-id
                            :size_x       2
                            :size_y       2
                            :action_id    nil
                            :row          2
                            :col          2
                            :series       []}
            new-card       {:card_id      card-id-2
                            :dashboard_id dashboard-id
                            :size_x       1
                            :size_y       1
                            :action_id    nil
                            :row          3
                            :col          3
                            :series       [{:name "Series Card 1"}]}]
        (is (=? [updated-card-1
                 updated-card-2
                 new-card]
                cards))
       ;; dashcard 3 is deleted
       (is (nil? (t2/select-one DashboardCard :id dashcard-id-3)))))))

(deftest e2e-update-tabs-only-test
  (testing "PUT /api/dashboard/:id/cards with create/update/delete tabs in a single req"
    (with-simple-dashboard-with-tabs [{:keys [dashboard-id dashtab-id-1 dashtab-id-2]}]
      (with-dashboards-in-writeable-collection [dashboard-id]
        ;; send a request that update and create and delete some cards at the same time
        (is (some? (t2/select-one :model/DashboardTab :id dashtab-id-2)))
        (let [tabs (:ordered_tabs (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                                                        {:ordered_tabs [{:name     "Tab new"
                                                                         :id       -1}
                                                                        {:name     "Tab 1 moved to second position"
                                                                         :id       dashtab-id-1}]
                                                         :cards        []}))]

          (is (=? [{:dashboard_id dashboard-id
                    :name         "Tab new"
                    :position     0}
                   {:id           dashtab-id-1
                    :dashboard_id dashboard-id
                    :name         "Tab 1 moved to second position"
                    :position     1}]
                  tabs))
          ;; dashtab 2 is deleted
          (is (nil? (t2/select-one :model/DashboardTab :id dashtab-id-2))))))))

(deftest upgrade-from-non-tab-dashboard-to-has-tabs
  (testing "we introduced tabs in 47 but there are dashboards without tabs before this
           this test check the flow to upgrade a dashboard pre-47 to have tabs"
    (t2.with-temp/with-temp
      [Dashboard     {dashboard-id :id}  {}
       Card          {card-id-1 :id}     {}
       Card          {card-id-2 :id}     {}
       DashboardCard {dashcard-1-id :id} {:card_id      card-id-1
                                          :dashboard_id dashboard-id}]
      ;; create 2 tabs, assign the existing dashcard to the 1st tab
      ;; create 2 new dashcards, 1 for each tab
      (let [resp (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                                  {:ordered_tabs  [{:id       -1
                                                    :name     "New Tab 1"}
                                                   {:id       -2
                                                    :name     "New Tab 2"}]
                                   :cards [{:id               dashcard-1-id
                                            :size_x           4
                                            :size_y           4
                                            :col              1
                                            :row              1
                                            :dashboard_tab_id -1
                                            :card_id          card-id-1}
                                           {:id               -2
                                            :size_x           4
                                            :size_y           4
                                            :col              1
                                            :row              2
                                            :dashboard_tab_id -1
                                            :card_id          card-id-1}
                                           {:id               -1
                                            :size_x           4
                                            :size_y           4
                                            :col              1
                                            :row              3
                                            :dashboard_tab_id -2
                                            :card_id          card-id-2}]})
            tab-1-id (t2/select-one-pk :model/DashboardTab :name "New Tab 1" :dashboard_id dashboard-id)
            tab-2-id (t2/select-one-pk :model/DashboardTab :name "New Tab 2" :dashboard_id dashboard-id)]
        (is (=? {:cards [{:id               dashcard-1-id
                          :card_id          card-id-1
                          :dashboard_id     dashboard-id
                          :dashboard_tab_id tab-1-id}
                         {:id               #hawk/schema (s/pred pos-int?)
                          :card_id          card-id-1
                          :dashboard_id     dashboard-id
                          :dashboard_tab_id tab-1-id}
                         {:id               #hawk/schema (s/pred pos-int?)
                          :card_id          card-id-2
                          :dashboard_id     dashboard-id
                          :dashboard_tab_id tab-2-id}]
                 :ordered_tabs [{:id           tab-1-id
                                 :dashboard_id dashboard-id
                                 :name         "New Tab 1"
                                 :position     0}
                                {:id           tab-2-id
                                 :dashboard_id dashboard-id
                                 :name         "New Tab 2"
                                 :position     1}]}
                (update resp :cards #(sort dashboard-card/dashcard-comparator %))))))))

(deftest update-cards-error-handling-test
  (testing "PUT /api/dashboard/:id/cards"
    (with-simple-dashboard-with-tabs [{:keys [dashboard-id]}]
      (testing "if a dashboard has tabs, check if all cards from the request has a tab_id"
        (is (= "This dashboard has tab, makes sure every card has a tab"
               (mt/user-http-request :crowberto :put 400 (format "dashboard/%d/cards" dashboard-id)
                                     {:cards        (conj
                                                      (current-cards dashboard-id)
                                                      {:id      -1
                                                       :size_x  4
                                                       :size_y  4
                                                       :col     1
                                                       :row     1})
                                      :ordered_tabs (dashboard/ordered-tabs dashboard-id)})))))))

(deftest update-tabs-track-snowplow-test
  (t2.with-temp/with-temp
    [Dashboard               {dashboard-id :id}  {}
     :model/DashboardTab     {dashtab-id-1 :id}  {:name "Tab 1" :dashboard_id dashboard-id :position 0}
     :model/DashboardTab     {dashtab-id-2 :id}  {:name "Tab 2" :dashboard_id dashboard-id :position 1}
     :model/DashboardTab     _                   {:name "Tab 3" :dashboard_id dashboard-id :position 2}]
    (testing "create and delete tabs events are tracked"
      (snowplow-test/with-fake-snowplow-collector
        (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                              {:ordered_tabs  [{:id   dashtab-id-1
                                                :name "Tab 1 edited"}
                                               {:id   dashtab-id-2
                                                :name "Tab 2"}
                                               {:id   -1
                                                :name "New tab 1"}
                                               {:id   -2
                                                :name "New tab 2"}]
                               :cards         []})
        (is (= [{:data {"dashboard_id"   dashboard-id
                        "num_tabs"       1
                        "total_num_tabs" 4
                        "event"          "dashboard_tab_deleted"},
                 :user-id (str (mt/user->id :rasta))}
                {:data {"dashboard_id"   dashboard-id
                        "num_tabs"       2
                        "total_num_tabs" 4
                        "event"          "dashboard_tab_created"}
                 :user-id (str (mt/user->id :rasta))}]
               (take-last 2 (snowplow-test/pop-event-data-and-user-id!))))))

    (testing "send nothing if tabs are unchanged"
      (snowplow-test/with-fake-snowplow-collector
        (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                              {:ordered_tabs  (dashboard/ordered-tabs dashboard-id)
                               :cards         []})
        (is (= 0 (count (snowplow-test/pop-event-data-and-user-id!))))))))

;;; -------------------------------------- Create dashcards tests ---------------------------------------

(deftest simple-creation-with-no-additional-series-test
  (mt/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (api.card-test/with-cards-in-readable-collection [card-id]
        (let [resp (:cards (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                                                 {:cards        [{:id                     -1
                                                                  :card_id                card-id
                                                                  :row                    4
                                                                  :col                    4
                                                                  :size_x                 4
                                                                  :size_y                 4
                                                                  :parameter_mappings     [{:parameter_id "abc"
                                                                                            :card_id 123
                                                                                            :hash "abc"
                                                                                            :target "foo"}]
                                                                  :visualization_settings {}}]
                                                  :ordered_tabs []}))]
          ;; extra sure here because the dashcard we given has a negative id
          (testing "the inserted dashcards has ids auto-generated"
            (is (pos? (:id (first resp)))))
          (is (= {:size_x                     4
                  :size_y                     4
                  :col                        4
                  :row                        4
                  :series                     []
                  :dashboard_tab_id           nil
                  :parameter_mappings         [{:parameter_id "abc" :card_id 123, :hash "abc", :target "foo"}]
                  :visualization_settings     {}
                  :created_at                 true
                  :updated_at                 true
                  :collection_authority_level nil}
                 (-> resp
                     first
                     (dissoc :id :dashboard_id :action_id :card_id :entity_id)
                     (update :created_at boolean)
                     (update :updated_at boolean))))
          (is (= [{:size_x                 4
                   :size_y                 4
                   :col                    4
                   :row                    4
                   :parameter_mappings     [{:parameter_id "abc", :card_id 123, :hash "abc", :target "foo"}]
                   :visualization_settings {}}]
                 (map (partial into {})
                      (t2/select [DashboardCard :size_x :size_y :col :row :parameter_mappings :visualization_settings]
                                 :dashboard_id dashboard-id)))))))))

(deftest new-dashboard-card-with-additional-series-test
  (mt/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]
                  Card      [{series-id-1 :id} {:name "Series Card"}]]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (api.card-test/with-cards-in-readable-collection [card-id series-id-1]
        (let [dashboard-cards (:cards (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                                                            {:cards        [{:id      -1
                                                                             :card_id card-id
                                                                             :row     4
                                                                             :col     4
                                                                             :size_x  4
                                                                             :size_y  4
                                                                             :series [{:id series-id-1}]}]
                                                             :ordered_tabs []}))]
          (is (=? [{:row                    4
                    :col                    4
                    :size_x                 4
                    :size_y                 4
                    :parameter_mappings     []
                    :visualization_settings {}
                    :series                 [{:name                   "Series Card"
                                              :description            nil
                                              :dataset_query          (:dataset_query api.card-test/card-defaults)
                                              :display                "table"
                                              :visualization_settings {}}]
                    :created_at             true
                    :updated_at             true}]
                 (remove-ids-and-booleanize-timestamps dashboard-cards)))
          (is (= [{:size_x 4
                   :size_y 4
                   :col    4
                   :row    4}]
                 (map (partial into {})
                      (t2/select [DashboardCard :size_x :size_y :col :row], :dashboard_id dashboard-id))))
          (is (= #{0}
                 (t2/select-fn-set :position DashboardCardSeries, :dashboardcard_id (:id (first dashboard-cards))))))))))

(deftest dashcard-action-create-update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (doseq [action-type [:http :implicit :query]]
        (mt/with-actions [{:keys [action-id]} {:type action-type :visualization_settings {:hello true}}]
          (testing (str "Creating dashcard with action: " action-type)
            (mt/with-temp* [Dashboard [{dashboard-id :id}]]
              (is (partial= [{:visualization_settings {:label "Update"}
                              :action_id              action-id
                              :card_id                nil}]
                            (:cards (mt/user-http-request :crowberto :put 200 (format "dashboard/%s/cards" dashboard-id)
                                                          {:cards        [{:id                     -1
                                                                           :size_x                 1
                                                                           :size_y                 1
                                                                           :row                    1
                                                                           :col                    1
                                                                           :card_id                nil
                                                                           :action_id              action-id
                                                                           :visualization_settings {:label "Update"}}]
                                                           :ordered_tabs []}))))
              (is (partial= {:ordered_cards [{:action (cond-> {:visualization_settings {:hello true}
                                                               :type (name action-type)
                                                               :parameters [{:id "id"}]
                                                               :database_enabled_actions true}
                                                              (#{:query :implicit} action-type)
                                                              (assoc :database_id (mt/id)))}]}
                            (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))))))))

(deftest dashcard-action-database-enabled-actions-test
  (testing "database_enabled_actions should hydrate according to database-enable-actions setting"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (mt/with-actions-test-data
        (doseq [enable-actions? [true false]
                encrypt-db?     [true false]]
          (mt/with-temp-env-var-value [mb-encryption-secret-key encrypt-db?]
            (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions enable-actions?}}
              (mt/with-actions [{:keys [action-id]} {:type :query :visualization_settings {:hello true}}]
                (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                                DashboardCard [_ {:action_id action-id, :dashboard_id dashboard-id}]]
                  (is (partial= {:ordered_cards [{:action {:database_enabled_actions enable-actions?}}]}
                                (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))))))))))

(deftest add-card-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id/cards"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (do-with-add-card-parameter-mapping-permissions-fixtures
       (fn [{:keys [card-id mappings add-card! dashcards]}]
         (is (schema= {:message  (s/eq "You must have data permissions to add a parameter referencing the Table \"VENUES\".")
                       s/Keyword s/Any}
                (add-card! 403)))
         (is (= []
                (dashcards)))
         (testing "Permissions for a different table in the same DB should not count"
           (perms/grant-permissions! (perms-group/all-users) (perms/table-query-path (mt/id :categories)))
           (is (schema= {:message  (s/eq "You must have data permissions to add a parameter referencing the Table \"VENUES\".")
                         s/Keyword s/Any}
                        (add-card! 403)))
           (is (= []
                  (dashcards))))
         (testing "If they have data permissions, it should be ok"
           (perms/grant-permissions! (perms-group/all-users) (perms/table-query-path (mt/id :venues)))
           (is (schema= [{:card_id            (s/eq card-id)
                                  :parameter_mappings [(s/one
                                                         {:parameter_id (s/eq "_CATEGORY_ID_")
                                                          :target       (s/eq ["dimension" ["field" (mt/id :venues :category_id) nil]])
                                                          s/Keyword     s/Any}
                                                         "mapping")]
                                  s/Keyword           s/Any}]
                        (:cards (add-card! 200))))
           (is (schema= [(s/one {:card_id            (s/eq card-id)
                                 :parameter_mappings (s/eq mappings)
                                 s/Keyword           s/Any}
                                "DashboardCard")]
                        (dashcards)))))))))

(deftest adding-archived-cards-to-dashboard-is-not-allowed
  (t2.with-temp/with-temp
    [Dashboard {dashboard-id :id} {}
     Card      {card-id :id}      {:archived true}]
    (is (= "The object has been archived."
           (:message (mt/user-http-request :rasta :put 404 (format "dashboard/%d/cards" dashboard-id)
                                           {:cards       [{:id                     -1
                                                           :card_id                card-id
                                                           :row                    4
                                                           :col                    4
                                                           :size_x                 4
                                                           :size_y                 4
                                                           :parameter_mappings     [{:parameter_id "abc"
                                                                                     :card_id 123
                                                                                     :hash "abc"
                                                                                     :target "foo"}]
                                                           :visualization_settings {}}]
                                            :ordered_tabs []}))))))

;;; -------------------------------------- Update dashcards only tests ---------------------------------------

(deftest update-cards-test
  (testing "PUT /api/dashboard/:id/cards"
    ;; fetch a dashboard WITH a dashboard card on it
    (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                    Card          [{card-id :id}]
                    DashboardCard [{dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                    DashboardCard [{dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                    Card          [{series-id-1 :id}   {:name "Series Card"}]]
      (with-dashboards-in-writeable-collection [dashboard-id]
        (is (= {:size_x                 4
                :size_y                 4
                :col                    0
                :row                    0
                :series                 []
                :parameter_mappings     []
                :visualization_settings {}
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-1))))
        (is (= {:size_x                 4
                :size_y                 4
                :col                    0
                :row                    0
                :parameter_mappings     []
                :visualization_settings {}
                :series                 []
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-2))))
        ;; TODO adds tests for return
        (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                              {:cards        [{:id     dashcard-id-1
                                               :size_x 4
                                               :size_y 2
                                               :col    0
                                               :row    0
                                               :series [{:id series-id-1}]}
                                              {:id     dashcard-id-2
                                               :size_x 1
                                               :size_y 1
                                               :col    1
                                               :row    3}]
                               :ordered_tabs []})
        (is (= {:size_x                 4
                :size_y                 2
                :col                    0
                :row                    0
                :parameter_mappings     []
                :visualization_settings {}
                :series                 [{:name                   "Series Card"
                                          :description            nil
                                          :display                :table
                                          :dataset_query          {}
                                          :visualization_settings {}}]
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-1))))
        (is (= {:size_x                 1
                :size_y                 1
                :col                    1
                :row                    3
                :parameter_mappings     []
                :visualization_settings {}
                :series                 []
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-2))))))))

(deftest update-cards-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id/cards"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (do-with-update-cards-parameter-mapping-permissions-fixtures
       (fn [{:keys [dashboard-id card-id original-mappings update-mappings! update-size! new-dashcard-info new-mappings]}]
         (testing "Should *NOT* be allowed to update the `:parameter_mappings` without proper data permissions"
           (is (schema= {:message  (s/eq "You must have data permissions to add a parameter referencing the Table \"VENUES\".")
                         s/Keyword s/Any}
                        (update-mappings! 403)))
           (is (= original-mappings
                  (t2/select-one-fn :parameter_mappings DashboardCard :dashboard_id dashboard-id, :card_id card-id))))
         (testing "Changing another column should be ok even without data permissions."
           (update-size!)
           (is (= (:size_x new-dashcard-info)
                  (t2/select-one-fn :size_x DashboardCard :dashboard_id dashboard-id, :card_id card-id))))
         (testing "Should be able to update `:parameter_mappings` *with* proper data permissions."
           (perms/grant-permissions! (perms-group/all-users) (perms/table-query-path (mt/id :venues)))
           (update-mappings! 200)
           (is (= new-mappings
                  (t2/select-one-fn :parameter_mappings DashboardCard :dashboard_id dashboard-id, :card_id card-id)))))))))

(deftest update-action-cards-test
  (mt/with-actions-enabled
    (testing "PUT /api/dashboard/:id/cards"
      ;; fetch a dashboard WITH a dashboard card on it
      (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                      Card          [{model-id :id} {:dataset true}]
                      Card          [{model-id-2 :id} {:dataset true}]
                      Action        [{action-id :id} {:model_id model-id :type :implicit :name "action"}]
                      DashboardCard [action-card {:dashboard_id dashboard-id
                                                  :action_id action-id
                                                  :card_id model-id}]
                      DashboardCard [question-card {:dashboard_id dashboard-id, :card_id model-id}]]
        (with-dashboards-in-writeable-collection [dashboard-id]
          ;; TODO adds test for return
          (mt/user-http-request :rasta :put 200 (format "dashboard/%d/cards" dashboard-id)
                                       {:cards [(assoc action-card :card_id model-id-2)
                                                (assoc question-card :card_id model-id-2)]
                                        :ordered_tabs []})
          ;; Only action card should change
          (is (partial= [{:card_id model-id-2}
                         {:card_id model-id}]
                        (t2/select DashboardCard :dashboard_id dashboard-id {:order-by [:id]}))))))))

(deftest update-tabs-test
  (with-simple-dashboard-with-tabs [{:keys [dashboard-id dashtab-id-1 dashtab-id-2]}]
    (testing "change tab name and change the position"
      (is (=? [{:id       dashtab-id-2
                :name     "Tab 2"}
               {:id       dashtab-id-1
                :name     "Tab 1 edited"}]
              (:ordered_tabs (mt/user-http-request :crowberto :put 200 (format "dashboard/%d/cards" dashboard-id)
                                                   {:ordered_tabs [{:id   dashtab-id-2
                                                                    :name "Tab 2"}
                                                                   {:id   dashtab-id-1
                                                                    :name "Tab 1 edited"}]
                                                    :cards (current-cards dashboard-id)})))))))

;;; -------------------------------------- Delete dashcards tests ---------------------------------------

(deftest delete-cards-test
  (testing "PUT /api/dashboard/id/:cards to delete"
    (testing "partial delete"
      ;; fetch a dashboard WITH a dashboard card on it
      (mt/with-temp* [Dashboard           [{dashboard-id :id}]
                      Card                [{card-id :id}]
                      Card                [{series-id-1 :id}]
                      Card                [{series-id-2 :id}]
                      DashboardCard       [{dashcard-id-1 :id}  {:dashboard_id dashboard-id, :card_id card-id}]
                      DashboardCard       [{_dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                      DashboardCard       [{dashcard-id-3 :id}  {:dashboard_id dashboard-id, :card_id card-id}]
                      DashboardCardSeries [_                    {:dashboardcard_id dashcard-id-1, :card_id series-id-1, :position 0}]
                      DashboardCardSeries [_                    {:dashboardcard_id dashcard-id-1, :card_id series-id-2, :position 1}]
                      DashboardCardSeries [_                    {:dashboardcard_id dashcard-id-3, :card_id series-id-1, :position 0}]]
        (with-dashboards-in-writeable-collection [dashboard-id]
          (is (= 3
                 (count (t2/select-pks-set DashboardCard, :dashboard_id dashboard-id))))
          (is (=? {:cards [{:id     dashcard-id-3
                            :series [{:id series-id-1}]}]
                   :ordered_tabs  []}
                  (mt/user-http-request :rasta :put 200
                                        (format "dashboard/%d/cards" dashboard-id) {:cards [(dashcard-like-response dashcard-id-3)]
                                                                                    :ordered_tabs []})))
          (is (= 1
                 (count (t2/select-pks-set DashboardCard, :dashboard_id dashboard-id)))))))
    (testing "prune"
      (mt/with-temp* [Dashboard           [{dashboard-id :id}]
                      Card                [{card-id :id}]
                      DashboardCard       [_ {:dashboard_id dashboard-id, :card_id card-id}]
                      DashboardCard       [_ {:dashboard_id dashboard-id, :card_id card-id}]]
        (with-dashboards-in-writeable-collection [dashboard-id]
          (is (= 2
                 (count (t2/select-pks-set DashboardCard, :dashboard_id dashboard-id))))
          (is (=? {:ordered_tabs []
                   :cards        []}
                  (mt/user-http-request :rasta :put 200
                                        (format "dashboard/%d/cards" dashboard-id) {:cards [] :ordered_tabs []})))
          (is (= 0
                 (count (t2/select-pks-set DashboardCard, :dashboard_id dashboard-id)))))))))

(deftest delete-tabs-test
  (testing "PUT /api/dashboard/id/:cards to delete"
    (testing "partial delete"
      (with-simple-dashboard-with-tabs [{:keys [dashboard-id dashtab-id-1 dashtab-id-2]}]
        (testing "we have 2 tabs, each has 1 card to begin with"
          (is (= 2
                 (t2/count DashboardCard, :dashboard_id dashboard-id)))
          (is (= 2
                 (t2/count :model/DashboardTab :dashboard_id dashboard-id))))
        (is (=? {:ordered_tabs [{:id dashtab-id-1}]}
                (mt/user-http-request :rasta :put 200
                                      (format "dashboard/%d/cards" dashboard-id)
                                      {:ordered_tabs [(t2/select-one :model/DashboardTab :id dashtab-id-1)]
                                       :cards (remove #(= (:dashboard_tab_id %) dashtab-id-2) (current-cards dashboard-id))})))
        (testing "deteted 1 tab, we should have"
          (testing "1 card left"
            (is (= 1
                   (t2/count DashboardCard :dashboard_id dashboard-id))))
          (testing "1 tab left"
            (is (= 1
                   (t2/count :model/DashboardTab :dashboard_id dashboard-id)))))))
    (testing "prune"
      (with-simple-dashboard-with-tabs [{:keys [dashboard-id]}]
        (testing "we have 2 tabs, each has 1 card to begin with"
          (is (= 2
                 (t2/count DashboardCard, :dashboard_id dashboard-id)))
          (is (= 2
                 (t2/count :model/DashboardTab :dashboard_id dashboard-id))))
        (is (=? {:ordered_tabs  []
                 :cards []}
                (mt/user-http-request :rasta :put 200
                                      (format "dashboard/%d/cards" dashboard-id)
                                      {:ordered_tabs []
                                       :cards        []})))
        (testing "dashboard should be empty"
          (testing "0 card left"
            (is (= 0
                   (t2/count DashboardCard :dashboard_id dashboard-id))))
          (testing "0 tab left"
            (is (= 0
                   (t2/count :model/DashboardTab :dashboard_id dashboard-id)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        GET /api/dashboard/:id/revisions                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-revisions-test
  (testing "GET /api/dashboard/:id/revisions"
    (mt/with-temp* [Dashboard [{dashboard-id :id}]
                    Revision  [_ {:model        "Dashboard"
                                  :model_id     dashboard-id
                                  :object       {:name         "b"
                                                 :description  nil
                                                 :cards        [{:size_x  4
                                                                 :size_y  4
                                                                 :row     0
                                                                 :col     0
                                                                 :card_id 123
                                                                 :series  []}]}
                                  :is_creation  true}]
                    Revision  [_ {:model    "Dashboard"
                                  :model_id dashboard-id
                                  :user_id  (mt/user->id :crowberto)
                                  :object   {:name         "c"
                                             :description  "something"
                                             :cards        [{:size_x  5
                                                             :size_y  3
                                                             :row     0
                                                             :col     0
                                                             :card_id 123
                                                             :series  [8 9]}]}
                                  :message  "updated"}]]
      (is (= [{:is_reversion          false
               :is_creation           false
               :message               "updated"
               :user                  (-> (user-details (mt/fetch-user :crowberto))
                                          (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff                  {:before {:name        "b"
                                                :description nil
                                                :cards       [{:series nil, :size_y 4, :size_x 4}]}
                                       :after  {:name        "c"
                                                :description "something"
                                                :cards       [{:series [8 9], :size_y 3, :size_x 5}]}}
               :has_multiple_changes true
               :description          "added a description and renamed it from \"b\" to \"c\", modified the cards and added some series to card 123."}
              {:is_reversion         false
               :is_creation          true
               :message              nil
               :user                 (-> (user-details (mt/fetch-user :rasta))
                                         (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff                 nil
               :has_multiple_changes false
               :description          "created this."}]
             (doall (for [revision (mt/user-http-request :crowberto :get 200 (format "dashboard/%d/revisions" dashboard-id))]
                      (dissoc revision :timestamp :id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/revert                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revert-dashboard-test
  (testing "POST /api/dashboard/:id/revert"
    (testing "parameter validation"
      (is (= {:revision_id "value must be an integer greater than zero."}
             (:errors (mt/user-http-request :crowberto :post 400 "dashboard/1/revert" {}))))
      (is (= {:revision_id "value must be an integer greater than zero."}
             (:errors (mt/user-http-request :crowberto :post 400 "dashboard/1/revert" {:revision_id "foobar"})))))
    (mt/with-temp* [Dashboard [{dashboard-id :id}]
                    Revision  [{revision-id :id} {:model       "Dashboard"
                                                  :model_id    dashboard-id
                                                  :object      {:name        "a"
                                                                :description nil
                                                                :cards       []}
                                                  :is_creation true}]
                    Revision  [_                 {:model    "Dashboard"
                                                  :model_id dashboard-id
                                                  :user_id  (mt/user->id :crowberto)
                                                  :object   {:name        "b"
                                                             :description nil
                                                             :cards       []}
                                                  :message  "updated"}]]
      (is (= {:is_reversion         true
              :is_creation          false
              :message              nil
              :user                 (-> (user-details (mt/fetch-user :crowberto))
                                        (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
              :diff                 {:before {:name "b"}
                                     :after  {:name "a"}}
              :has_multiple_changes false
              :description          "reverted to an earlier version."}
             (dissoc (mt/user-http-request :crowberto :post 200 (format "dashboard/%d/revert" dashboard-id)
                                           {:revision_id revision-id})
                     :id :timestamp)))

      (is (= [{:is_reversion         true
               :is_creation          false
               :message              nil
               :user                 (-> (user-details (mt/fetch-user :crowberto))
                                         (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff                 {:before {:name "b"}
                                      :after  {:name "a"}}
               :has_multiple_changes false
               :description          "reverted to an earlier version."}
              {:is_reversion         false
               :is_creation          false
               :message              "updated"
               :user                 (-> (user-details (mt/fetch-user :crowberto))
                                         (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff                 {:before {:name "a"}
                                      :after  {:name "b"}}
               :has_multiple_changes false
               :description          "renamed this Dashboard from \"a\" to \"b\"."}
              {:is_reversion         false
               :is_creation          true
               :message              nil
               :user                 (-> (user-details (mt/fetch-user :rasta))
                                         (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff                 nil
               :has_multiple_changes false
               :description          "created this."}]
             (doall (for [revision (mt/user-http-request :crowberto :get 200 (format "dashboard/%d/revisions" dashboard-id))]
                      (dissoc revision :timestamp :id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-dashboard []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

;;; -------------------------------------- POST /api/dashboard/:id/public_link ---------------------------------------

(deftest share-dashboard-test
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (testing "Test that we can share a Dashboard"
      (t2.with-temp/with-temp [Dashboard dashboard]
        (let [{uuid :uuid} (mt/user-http-request :crowberto :post 200
                                                 (format "dashboard/%d/public_link" (u/the-id dashboard)))]
          (is (t2/exists? Dashboard :id (u/the-id dashboard), :public_uuid uuid))
          (testing "Test that if a Dashboard has already been shared we reuse the existing UUID"
            (is (= uuid
                   (:uuid (mt/user-http-request :crowberto :post 200
                                                (format "dashboard/%d/public_link" (u/the-id dashboard))))))))))

    (t2.with-temp/with-temp [Dashboard dashboard]
      (testing "Test that we *cannot* share a Dashboard if we aren't admins"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (format "dashboard/%d/public_link" (u/the-id dashboard))))))

      (testing "Test that we *cannot* share a Dashboard if the setting is disabled"
        (mt/with-temporary-setting-values [enable-public-sharing false]
          (is (= "Public sharing is not enabled."
                 (mt/user-http-request :crowberto :post 400 (format "dashboard/%d/public_link" (u/the-id dashboard))))))))

    (testing "Test that we get a 404 if the Dashboard doesn't exist"
      (is (= "Not found."
             (mt/user-http-request :crowberto :post 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE)))))))

(deftest delete-public-link-test
  (testing "DELETE /api/dashboard/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (testing "Test that we can unshare a Dashboard"
        (t2.with-temp/with-temp [Dashboard dashboard (shared-dashboard)]
          (mt/user-http-request :crowberto :delete 204 (format "dashboard/%d/public_link" (u/the-id dashboard)))
          (is (= false
                 (t2/exists? Dashboard :id (u/the-id dashboard), :public_uuid (:public_uuid dashboard))))))

      (testing "Test that we *cannot* unshare a Dashboard if we are not admins"
        (t2.with-temp/with-temp [Dashboard dashboard (shared-dashboard)]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 (format "dashboard/%d/public_link" (u/the-id dashboard)))))))

      (testing "Test that we get a 404 if Dashboard isn't shared"
        (t2.with-temp/with-temp [Dashboard dashboard]
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404 (format "dashboard/%d/public_link" (u/the-id dashboard)))))))

      (testing "Test that we get a 404 if Dashboard doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE))))))))

;;
(deftest fetch-public-dashboards-test
  (testing "GET /api/dashboard/public"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (t2.with-temp/with-temp [Dashboard _dashboard (shared-dashboard)]
        (testing "Test that it requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "dashboard/public"))))
        (testing "Test that superusers can fetch a list of publicly-accessible dashboards"
          (is (= [{:name true, :id true, :public_uuid true}]
                 (for [dash (mt/user-http-request :crowberto :get 200 "dashboard/public")]
                   (m/map-vals boolean (select-keys dash [:name :id :public_uuid]))))))))))

(deftest fetch-embeddable-dashboards-test
  (testing "GET /api/dashboard/embeddable"
    (testing "Test that we can fetch a list of embeddable-accessible dashboards"
      (mt/with-temporary-setting-values [enable-embedding true]
        (t2.with-temp/with-temp [Dashboard _ {:enable_embedding true}]
          (is (= [{:name true, :id true}]
                 (for [dash (mt/user-http-request :crowberto :get 200 "dashboard/embeddable")]
                   (m/map-vals boolean (select-keys dash [:name :id]))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Tests for including query average duration info                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- base-64-encode-byte-arrays
  "Walk form `x` and convert any byte arrays in the results to base-64-encoded strings. This is useful when writing
  tests that return byte arrays (such as things that work with query hashes), since identical arrays are not
  considered equal."
  {:style/indent 0}
  [x]
  (walk/postwalk (fn [form]
                   (if (instance? (Class/forName "[B") form)
                     (codec/base64-encode form)
                     form))
                 x))

(deftest dashcard->query-hashes-test
  (doseq [[dashcard expected]
          [[{:card {:dataset_query {:database 1}}}
            ["k9Y1XOETkQ31kX+S9DXW/cbDPGF7v4uS5f6dZsXjMRs="
             "K6A0F7tRxQ+2xa33kigBwIvUvU+F95UUccWjGTx8kuI="]]

           [{:card   {:dataset_query {:database 2}}
             :series [{:dataset_query {:database 3}}
                      {:dataset_query {:database 4}}]}
            ["WbWqdd3zu9zvVCVWh8X9ASWLqtaB1rZlU0gKLEuCK0I="
             "NzgQC4fjR52npCkZV7IiZDb9NfcmKbWHP4krFzkLPyA="
             "pjdBPUgWnbVvMf0VsETyeB6smRC8SYejyTZIVPh2m3I="
             "dEXUTWQI2L0Z/Bvrb2LTVVPl2Qg/56hKIPb+I2a4mG8="
             "rP5XFvxpRDCPXeM0A2Z7uoUkH0zwV0Z0o22obH3c1Uk="
             "Wn9nubTcKZX5862pHFaibkqqbsqAfGa3gVhN3D4FrJw="]]]]
    (testing (pr-str dashcard)
      (is (= expected
             (base-64-encode-byte-arrays (#'api.dashboard/dashcard->query-hashes dashcard)))))))

(deftest dashcards->query-hashes-test
  (is (= ["k9Y1XOETkQ31kX+S9DXW/cbDPGF7v4uS5f6dZsXjMRs="
          "K6A0F7tRxQ+2xa33kigBwIvUvU+F95UUccWjGTx8kuI="
          "WbWqdd3zu9zvVCVWh8X9ASWLqtaB1rZlU0gKLEuCK0I="
          "NzgQC4fjR52npCkZV7IiZDb9NfcmKbWHP4krFzkLPyA="
          "pjdBPUgWnbVvMf0VsETyeB6smRC8SYejyTZIVPh2m3I="
          "dEXUTWQI2L0Z/Bvrb2LTVVPl2Qg/56hKIPb+I2a4mG8="
          "rP5XFvxpRDCPXeM0A2Z7uoUkH0zwV0Z0o22obH3c1Uk="
          "Wn9nubTcKZX5862pHFaibkqqbsqAfGa3gVhN3D4FrJw="]
         (base-64-encode-byte-arrays
           (#'api.dashboard/dashcards->query-hashes
            [{:card {:dataset_query {:database 1}}}
             {:card   {:dataset_query {:database 2}}
              :series [{:dataset_query {:database 3}}
                       {:dataset_query {:database 4}}]}])))))

(deftest add-query-average-duration-to-dashcards-test
  (is (= [{:card   {:dataset_query {:database 1}, :query_average_duration 111}
           :series []}
          {:card   {:dataset_query {:database 2}, :query_average_duration 333}
           :series [{:dataset_query {:database 3}, :query_average_duration 555}
                    {:dataset_query {:database 4}, :query_average_duration 777}]}]
         (#'api.dashboard/add-query-average-duration-to-dashcards
          [{:card {:dataset_query {:database 1}}}
           {:card   {:dataset_query {:database 2}}
            :series [{:dataset_query {:database 3}}
                     {:dataset_query {:database 4}}]}]
          (into {} (for [[k v] {"k9Y1XOETkQ31kX+S9DXW/cbDPGF7v4uS5f6dZsXjMRs=" 111
                                "K6A0F7tRxQ+2xa33kigBwIvUvU+F95UUccWjGTx8kuI=" 222
                                "WbWqdd3zu9zvVCVWh8X9ASWLqtaB1rZlU0gKLEuCK0I=" 333
                                "NzgQC4fjR52npCkZV7IiZDb9NfcmKbWHP4krFzkLPyA=" 444
                                "pjdBPUgWnbVvMf0VsETyeB6smRC8SYejyTZIVPh2m3I=" 555
                                "dEXUTWQI2L0Z/Bvrb2LTVVPl2Qg/56hKIPb+I2a4mG8=" 666
                                "rP5XFvxpRDCPXeM0A2Z7uoUkH0zwV0Z0o22obH3c1Uk=" 777
                                "Wn9nubTcKZX5862pHFaibkqqbsqAfGa3gVhN3D4FrJw=" 888}]
                     [(mapv int (codec/base64-decode k)) v]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Test related/recommended entities                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest related-and-recommended-entities-test
  (t2.with-temp/with-temp [Dashboard {dashboard-id :id}]
    (is (= #{:cards}
           (-> (mt/user-http-request :crowberto :get 200 (format "dashboard/%s/related" dashboard-id)) keys set)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Chain Filter Endpoints                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest mappings->field-ids-test
  (testing "mappings->field-ids"
    (testing "Should extra Field IDs from parameter mappings"
      (is (= #{1 2}
             (#'api.dashboard/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension [:field 1 nil]]}
               {:parameter_id "637169c8"
                :card_id      1
                :target       [:dimension [:field 2 nil]]}]))))
    (testing "Should normalize MBQL clauses"
      (is (= #{1 2}
             (#'api.dashboard/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension ["field" 1 nil]]}
               {:parameter_id "637169c8"
                :card_id      1
                :target       ["dimension" ["field" 2 nil]]}]))))
    (testing "Should ignore field-literal clauses"
      (is (= #{1}
             (#'api.dashboard/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension ["field" 1 nil]]}
               {:parameter_id "637169c8"
                :card_id      1
                :target       ["dimension" ["field" "wow" {:base-type "type/Text"}]]}]))))
    (testing "Should ignore invalid mappings"
      (is (= #{1}
             (#'api.dashboard/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension ["field" 1 nil]]}
               {:parameter_id "637169c8"
                :card_id      1}]))))))

(defn do-with-chain-filter-fixtures
  ([f]
   (do-with-chain-filter-fixtures nil f))

  ([dashboard-values f]
   (mt/with-temp* [Card          [{source-card-id         :id}
                                  (merge (mt/card-with-source-metadata-for-query (mt/mbql-query categories {:limit 5}))
                                         {:database_id     (mt/id)
                                          :table_id        (mt/id :categories)})]
                   Dashboard     [dashboard (merge {:parameters [{:name "Category Name"
                                                                  :slug "category_name"
                                                                  :id   "_CATEGORY_NAME_"
                                                                  :type "category"}
                                                                 {:name "Category ID"
                                                                  :slug "category_id"
                                                                  :id   "_CATEGORY_ID_"
                                                                  :type "category"}
                                                                 {:name "Price"
                                                                  :slug "price"
                                                                  :id   "_PRICE_"
                                                                  :type "category"}
                                                                 {:name "ID"
                                                                  :slug "id"
                                                                  :id   "_ID_"
                                                                  :type "category"}
                                                                 {:name                  "Static Category"
                                                                  :slug                  "static_category"
                                                                  :id                    "_STATIC_CATEGORY_"
                                                                  :type                  "category"
                                                                  :values_source_type    "static-list"
                                                                  :values_source_config {:values ["African" "American" "Asian"]}}
                                                                 {:name                  "Static Category label"
                                                                  :slug                  "static_category_label"
                                                                  :id                    "_STATIC_CATEGORY_LABEL_"
                                                                  :type                  "category"
                                                                  :values_source_type    "static-list"
                                                                  :values_source_config {:values [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}}
                                                                 {:id                   "_CARD_"
                                                                  :type                 "category"
                                                                  :name                 "CATEGORY"
                                                                  :values_source_type   "card"
                                                                  :values_source_config {:card_id     source-card-id
                                                                                         :value_field (mt/$ids $categories.name)}}]}
                                                   dashboard-values)]
                   Card          [card {:database_id   (mt/id)
                                        :table_id      (mt/id :venues)
                                        :dataset_query (mt/mbql-query venues)}]
                   DashboardCard [dashcard {:card_id            (:id card)
                                            :dashboard_id       (:id dashboard)
                                            :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                 {:parameter_id "_CATEGORY_ID_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $category_id)]}
                                                                 {:parameter_id "_PRICE_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $price)]}
                                                                 {:parameter_id "_ID_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $id)]}
                                                                 {:parameter_id "_ID_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $id)]}
                                                                 {:parameter_id "_STATIC_CATEGORY_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                 {:parameter_id "_STATIC_CATEGORY_LABEL_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}]]
     (f {:dashboard  dashboard
         :card       card
         :dashcard   dashcard
         :param-keys {:category-name         "_CATEGORY_NAME_"
                      :category-id           "_CATEGORY_ID_"
                      :price                 "_PRICE_"
                      :id                    "_ID_"
                      :static-category       "_STATIC_CATEGORY_"
                      :static-category-label "_STATIC_CATEGORY_LABEL_"
                      :card                  "_CARD_"}}))))

(defmacro with-chain-filter-fixtures [[binding dashboard-values] & body]
  `(do-with-chain-filter-fixtures ~dashboard-values (fn [~binding] ~@body)))

(defn- add-query-params [url query-params]
  (let [query-params-str (str/join "&" (for [[k v] (partition 2 query-params)]
                                         (codec/form-encode {k v})))]
    (cond-> url
      (seq query-params-str) (str "?" query-params-str))))

(defn chain-filter-values-url [dashboard-or-id param-key & query-params]
  (add-query-params (format "dashboard/%d/params/%s/values" (u/the-id dashboard-or-id) (name param-key))
                    query-params))

(defmacro let-url
  "Like normal `let`, but adds `testing` context with the `url` you've bound."
  {:style/indent 1}
  [[url-binding url] & body]
  `(let [url# ~url
         ~url-binding url#]
     (testing (str "\nGET /api/" url# "\n")
       ~@body)))

(defn chain-filter-search-url [dashboard-or-id param-key query & query-params]
  {:pre [(some? param-key)]}
  (add-query-params (str (format "dashboard/%d/params/%s/search/" (u/the-id dashboard-or-id) (name param-key))
                         query)
                    query-params))

(deftest dashboard-chain-filter-permissions-test
  (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
    (let [url (chain-filter-values-url dashboard (:category-name param-keys))]
      (testing (str "\nGET /api/" url "\n")
        (testing "\nShow me names of categories that have expensive venues (price = 4), while I lack permisisons."
          (with-redefs [metabase.models.params.chain-filter/use-cached-field-values? (constantly false)]
            (binding [qp.perms/*card-id* nil] ;; this situation was observed when running constrained chain filters.
              (is (= {:values ["African" "American" "Artisan" "Asian"] :has_more_values false}
                     (chain-filter-test/take-n-values 4 (mt/user-http-request :rasta :get 200 url)))))))))

    (let [url (chain-filter-values-url dashboard (:category-name param-keys) (:price param-keys) 4)]
      (testing (str "\nGET /api/" url "\n")
        (testing "\nShow me names of categories that have expensive venues (price = 4), while I lack permisisons."
          (with-redefs [chain-filter/use-cached-field-values? (constantly false)]
            (binding [qp.perms/*card-id* nil]
              (is (= {:values ["Japanese" "Steakhouse"], :has_more_values false}
                     (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))))))))

(deftest dashboard-chain-filter-test
  (testing "GET /api/dashboard/:id/params/:param-key/values"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "Show me names of categories"
        (is (= {:values          ["African" "American" "Artisan"]
                :has_more_values false}
               (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 (chain-filter-values-url
                                                                                         (:id dashboard)
                                                                                         (:category-name param-keys)))))))
      (let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                             (:price param-keys) 4)]
        (testing "\nShow me names of categories that have expensive venues (price = 4)"
          (is (= {:values          ["Japanese" "Steakhouse"]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))
      ;; this is the format the frontend passes multiple values in (pass the parameter multiple times), and our
      ;; middleware does the right thing and converts the values to a vector
      (let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                             (:price param-keys) 3
                                             (:price param-keys) 4)]
        (testing "\nmultiple values"
          (testing "Show me names of categories that have (somewhat) expensive venues (price = 3 *or* 4)"
            (is (= {:values          ["American" "Asian" "BBQ"]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))))
    (testing "Should require perms for the Dashboard"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]} {:collection_id (:id collection)}]
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (chain-filter-values-url
                                                          (:id dashboard)
                                                          (:category-name param-keys)))))))))

    (testing "Should work if Dashboard has multiple mappings for a single param"
      (with-chain-filter-fixtures [{:keys [dashboard card dashcard param-keys]}]
        (mt/with-temp* [Card          [card-2 (dissoc card :id :entity_id)]
                        DashboardCard [_dashcard-2 (-> dashcard
                                                       (dissoc :id :card_id :entity_id)
                                                       (assoc  :card_id (:id card-2)))]]
          (is (= {:values          ["African" "American" "Artisan"]
                  :has_more_values false}
                 (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                      (mt/user-http-request :rasta :get 200)
                      (chain-filter-test/take-n-values 3)))))))

    (testing "should check perms for the Fields in question"
      (mt/with-temp-copy-of-db
        (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
          (perms/revoke-data-perms! (perms-group/all-users) (mt/id))

          ;; HACK: we currently 403 on chain-filter calls that require running a MBQL
          ;; but 200 on calls that we could just use the cache.
          ;; It's not ideal and we definitely need to have a consistent behavior
          (with-redefs [field-values/field-should-have-field-values? (fn [_] false)]
            (is (= {:values ["African" "American" "Artisan"]
                    :has_more_values false}
                   (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                        (mt/user-http-request :rasta :get 200)
                        (chain-filter-test/take-n-values 3))))))))

    (testing "missing data perms should not affect perms for the Fields in question when users have collection access"
      (mt/with-temp-copy-of-db
        (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
          (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
          (is (= {:values ["African" "American" "Artisan"] :has_more_values false}
                 (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                      (mt/user-http-request :rasta :get 200)
                      (chain-filter-test/take-n-values 3)))))))))

(deftest dashboard-with-static-list-parameters-test
  (testing "A dashboard that has parameters that has static values"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "we could get the values"
        (is (= {:has_more_values false
                :values          ["African" "American" "Asian"]}
               (mt/user-http-request :rasta :get 200
                                     (chain-filter-values-url (:id dashboard) (:static-category param-keys)))))

        (is (= {:has_more_values false
                :values          [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}
               (mt/user-http-request :rasta :get 200
                                     (chain-filter-values-url (:id dashboard) (:static-category-label param-keys))))))

      (testing "we could search the values"
        (is (= {:has_more_values false
                :values          ["African"]}
               (mt/user-http-request :rasta :get 200
                                     (chain-filter-search-url (:id dashboard) (:static-category param-keys) "af"))))

        (is (= {:has_more_values false
                :values          [["African" "Af"]]}
               (mt/user-http-request :rasta :get 200
                                     (chain-filter-search-url (:id dashboard) (:static-category-label param-keys) "f")))))

      (testing "we could edit the values list"
        ;; TODO add tests for schema check
        (let [dashboard (mt/user-http-request :rasta :put 200 (str "dashboard/" (:id dashboard))
                                              {:parameters [{:name                  "Static Category"
                                                             :slug                  "static_category"
                                                             :id                    "_STATIC_CATEGORY_"
                                                             :type                  "category"
                                                             :values_query_type     "search"
                                                             :values_source_type    "static-list"
                                                             :values_source_config {"values" ["BBQ" "Bakery" "Bar"]}}]})]
          (is (= [{:name                  "Static Category"
                   :slug                  "static_category"
                   :id                    "_STATIC_CATEGORY_"
                   :type                  "category"
                   :values_query_type     "search"
                   :values_source_type    "static-list"
                   :values_source_config {:values ["BBQ" "Bakery" "Bar"]}}]
                 (:parameters dashboard))))))

    (testing "source-options must be a map and sourcetype must be `card` or `static-list` must be a string"
      (is (= "value may be nil, or if non-nil, value must be an array. Each parameter must be a map with :id and :type keys"
             (get-in (mt/user-http-request :rasta :post 400 "dashboard"
                                           {:name       "a dashboard"
                                            :parameters [{:id                    "_value_"
                                                          :name                  "value"
                                                          :type                  "category"
                                                          :values_source_type    "random-type"
                                                          :values_source_config {"values" [1 2 3]}}]})
                     [:errors :parameters])))
      (is (= "value may be nil, or if non-nil, value must be an array. Each parameter must be a map with :id and :type keys"
             (get-in (mt/user-http-request :rasta :post 400 "dashboard"
                                           {:name       "a dashboard"
                                            :parameters [{:id                    "_value_"
                                                          :name                  "value"
                                                          :type                  "category"
                                                          :values_source_type    "static-list"
                                                          :values_source_config []}]})
                     [:errors :parameters]))))))

(deftest native-query-get-params-test
  (testing "GET /api/dashboard/:id/params/:param-key/values works for native queries"
    (mt/dataset sample-dataset
      ;; Note that we can directly query the values for the model, but this is
      ;; nonsensical from a dashboard standpoint as the returned values aren't
      ;; usable for filtering...
      (mt/with-temp* [Card [{model-id :id :as native-card}
                            {:database_id   (mt/id)
                             :name          "Native Query"
                             :dataset_query (mt/native-query
                                             {:query "SELECT category FROM products LIMIT 10;"})
                             :dataset       true}]]
        (let [metadata (-> (qp/process-query (:dataset_query native-card))
                           :data :results_metadata :columns)]
          (is (seq metadata) "Did not get metadata")
          (t2/update! 'Card {:id model-id}
                      {:result_metadata (json/generate-string
                                         (assoc-in metadata [0 :id]
                                                    (mt/id :products :category)))}))
        ;; ...so instead we create a question on top of this model (note that
        ;; metadata must be present on the model) and use the question on the
        ;; dashboard.
        (mt/with-temp* [Card [{question-id :id}
                              {:database_id   (mt/id)
                               :name          "card on native query"
                               :dataset_query {:type     :query
                                               :database (mt/id)
                                               :query    {:source-table (str "card__" model-id)}}
                               :dataset       true}]
                        Dashboard [dashboard {:name       "Dashboard"
                                              :parameters [{:name      "Native Dropdown"
                                                            :slug      "native_dropdown"
                                                            :id        "_NATIVE_CATEGORY_NAME_"
                                                            :type      :string/=
                                                            :sectionId "string"}]}]
                        DashboardCard [_dashcard {:parameter_mappings
                                                  [{:parameter_id "_NATIVE_CATEGORY_NAME_"
                                                    :card_id      question-id
                                                    :target       [:dimension
                                                                   [:field "CATEGORY" {:base-type :type/Text}]]}]
                                                  :card_id      question-id
                                                  :dashboard_id (:id dashboard)}]]
          (let [url (format "dashboard/%d/params/%s/values" (u/the-id dashboard) "_NATIVE_CATEGORY_NAME_")]
            (is (=? {:values          ["Doohickey"
                                       "Gadget"
                                       "Gizmo"
                                       "Widget"]
                     :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-search-test
  (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (let [url (chain-filter-search-url dashboard (:category-name param-keys) "bar")]
        (testing (str "\n" url)
          (testing "\nShow me names of categories that include 'bar' (case-insensitive)"
            (is (= {:values          ["Bar" "Gay Bar" "Juice Bar"]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))))

      (let-url [url (chain-filter-search-url dashboard (:category-name param-keys) "house" (:price param-keys) 4)]
        (testing "\nShow me names of categories that include 'house' that have expensive venues (price = 4)"
          (is (= {:values          ["Steakhouse"]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))

      (testing "Should require a non-empty query"
        (doseq [query [nil
                       ""
                       "   "
                       "\n"]]
          (let-url [url (chain-filter-search-url dashboard (:category-name param-keys) query)]
            (is (= "API endpoint does not exist."
                   (mt/user-http-request :rasta :get 404 url)))))))

    (testing "Should require perms for the Dashboard"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]} {:collection_id (:id collection)}]
            (let [url (chain-filter-search-url dashboard (:category-name param-keys) "s")]
              (testing (str "\n url")
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :get 403 url)))))))))))

(deftest chain-filter-not-found-test
  (t2.with-temp/with-temp [Dashboard {dashboard-id :id}]
    (testing "GET /api/dashboard/:id/params/:param-key/values returns 400 if param not found"
      (mt/user-http-request :rasta :get 400 (format "dashboard/%d/params/non-existing-param/values" dashboard-id)))

    (testing "GET /api/dashboard/:id/params/:param-key/search/:query returns 400 if param not found"
      (mt/user-http-request :rasta :get 400 (format "dashboard/%d/params/non-existing-param/search/bar" dashboard-id)))))

(deftest chain-filter-invalid-parameters-test
  (testing "GET /api/dashboard/:id/params/:param-key/values"
    (testing "If some Dashboard parameters do not have valid Field IDs, we should ignore them"
      (with-chain-filter-fixtures [{:keys [dashcard card dashboard]}]
        (t2/update! DashboardCard (:id dashcard)
                    {:parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                           :card_id      (:id card)
                                           :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                          {:parameter_id "_PRICE_"
                                           :card_id      (:id card)}]})
        (testing "Since the _PRICE_ param is not mapped to a valid Field, it should get ignored"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_" "_PRICE_" 4)]
            (is (= {:values          ["African" "American" "Artisan"]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))))))

(deftest chain-filter-human-readable-values-remapping-test
  (testing "Chain filtering for Fields that have Human-Readable values\n"
    (chain-filter-test/with-human-readable-values-remapping
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_ID_" "_PRICE_" 4)]
            (is (= {:values          [[40 "Japanese"]
                                      [67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
          (let-url [url (chain-filter-search-url dashboard "_CATEGORY_ID_" "house" "_PRICE_" 4)]
            (is (= {:values          [[67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-field-to-field-remapping-test
  (testing "Chain filtering for Fields that have a Field -> Field remapping\n"
    (with-chain-filter-fixtures [{:keys [dashboard]}]
      (testing "GET /api/dashboard/:id/params/:param-key/values"
        (let-url [url (chain-filter-values-url dashboard "_ID_")]
          (is (= {:values          [[29 "20th Century Cafe"]
                                    [ 8 "25°"]
                                    [93 "33 Taps"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
        (let-url [url (chain-filter-values-url dashboard "_ID_" "_PRICE_" 4)]
          (is (= {:values          [[55 "Dal Rae Restaurant"]
                                    [61 "Lawry's The Prime Rib"]
                                    [16 "Pacific Dining Car - Santa Monica"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))

      (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
        (let-url [url (chain-filter-search-url dashboard "_ID_" "fish")]
          (is (= {:values          [[90 "Señor Fish"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
        (let-url [url (chain-filter-search-url dashboard "_ID_" "sushi" "_PRICE_" 4)]
          (is (= {:values          [[77 "Sushi Nakazawa"]
                                    [79 "Sushi Yasuda"]
                                    [81 "Tanoshi Sushi & Sake Bar"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-fk-field-to-field-remapping-test
  (testing "Chain filtering for Fields that have a FK Field -> Field remapping\n"
    (chain-filter-test/with-fk-field-to-field-remapping
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_ID_" "_PRICE_" 4)]
            (is (= {:values          [[40 "Japanese"]
                                      [67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
          (let-url [url (chain-filter-search-url dashboard "_CATEGORY_ID_" "house" "_PRICE_" 4)]
            (is (= {:values          [[67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-should-use-cached-field-values-test
  (testing "Chain filter endpoints should use cached FieldValues if applicable (#13832)"
    ;; ignore the cache entries added by #23699
    (mt/with-temp-vals-in-db FieldValues (t2/select-one-pk FieldValues :field_id (mt/id :categories :name) :hash_key nil) {:values ["Good" "Bad"]}
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_")]
            (is (= {:values          ["Bad" "Good"]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url))))
          (testing "Shouldn't use cached FieldValues if the request has any additional constraints"
            (let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_" "_PRICE_" 4)]
              (is (= {:values          ["Japanese" "Steakhouse"]
                      :has_more_values false}
                     (mt/user-http-request :rasta :get 200 url))))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
          (let-url [url (chain-filter-search-url dashboard "_CATEGORY_NAME_" "ood")]
            (is (= {:values          ["Good"]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

(defn- card-fields-from-table-metadata
  [card-id]
  (:fields (mt/user-http-request :rasta :get 200 (format "/table/card__%d/query_metadata" card-id))))

(deftest parameter-values-from-card-test
  (testing "getting values"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "It uses the results of the card's query execution"
        (let-url [url (chain-filter-values-url dashboard (:card param-keys))]
          (is (= {:values          ["African" "American" "Artisan" "Asian" "BBQ"]
                  :has_more_values false}
                 (mt/user-http-request :rasta :get 200 url)))))

      (testing "it only returns search matches"
        (let-url [url (chain-filter-search-url dashboard (:card param-keys) "af")]
          (is (= {:values          ["African"]
                  :has_more_values false}
                 (mt/user-http-request :rasta :get 200 url)))))))

  (testing "fallback to chain-filter"
    (with-redefs [api.dashboard/chain-filter (constantly "chain-filter")]
      (testing "if value-field not found in source card"
        (mt/with-temp* [Card       [{card-id :id}]
                        Dashboard  [dashboard
                                    {:parameters    [{:id                   "abc"
                                                      :type                 "category"
                                                      :name                 "CATEGORY"
                                                      :values_source_type   "card"
                                                      :values_source_config {:card_id     card-id
                                                                             :value_field (mt/$ids $venues.name)}}]}]]
          (let-url [url (chain-filter-values-url dashboard "abc")]
            (is (= "chain-filter" (mt/user-http-request :rasta :get 200 url))))))

      (testing "if card is archived"
        (mt/with-temp* [Card       [{card-id :id} {:archived true}]
                        Dashboard  [dashboard
                                    {:parameters    [{:id                   "abc"
                                                      :type                 "category"
                                                      :name                 "CATEGORY"
                                                      :values_source_type   "card"
                                                      :values_source_config {:card_id     card-id
                                                                             :value_field (mt/$ids $venues.name)}}]}]]
          (let-url [url (chain-filter-values-url dashboard "abc")]
            (is (= "chain-filter" (mt/user-http-request :rasta :get 200 url))))))))

  (testing "users must have permissions to read the collection that source card is in"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp*
        [Collection [coll1 {:name "Source card collection"}]
         Card       [{source-card-id :id}
                     {:collection_id (:id coll1)
                      :database_id   (mt/id)
                      :table_id      (mt/id :venues)
                      :dataset_query (mt/mbql-query venues {:limit 5})}]
         Collection [coll2 {:name "Dashboard collections"}]
         Dashboard  [{dashboard-id :id}
                     {:collection_id (:id coll2)
                      :parameters    [{:id                   "abc"
                                       :type                 "category"
                                       :name                 "CATEGORY"
                                       :values_source_type   "card"
                                       :values_source_config {:card_id     source-card-id
                                                              :value_field (mt/$ids $venues.name)}}]}]]
        (testing "Fail because user doesn't have read permissions to coll1"
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (chain-filter-values-url dashboard-id "abc"))))
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (chain-filter-search-url dashboard-id "abc" "red")))))
        ;; grant permission to read the collection contains the card
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll2)
        (testing "having read permissions to the card collection is not enough"
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (chain-filter-values-url dashboard-id "abc"))))
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (chain-filter-search-url dashboard-id "abc" "red")))))
        ;; grant permission to read the collection contains the source card
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll1)
        (testing "success if has read permission to the source card's collection"
          (is (some? (mt/user-http-request :rasta :get 200 (chain-filter-values-url dashboard-id "abc"))))
          (is (some? (mt/user-http-request :rasta :get 200 (chain-filter-search-url dashboard-id "abc" "red"))))))))

  (testing "field selection should compatible with field-id from /api/table/:card__id/query_metadata"
    ;; FE use the id returned by /api/table/:card__id/query_metadata
    ;; for the `values_source_config.value_field`, so we need to test to make sure
    ;; the id is a valid field that we could use to retrieve values.
    (mt/with-temp*
      ;; card with agggregation and binning columns
      [Card [{mbql-card-id :id}
             (merge (mt/card-with-source-metadata-for-query
                     (mt/mbql-query venues
                       {:limit 5
                        :aggregation [:count]
                        :breakout [[:field %latitude {:binning {:strategy :num-bins :num-bins 10}}]]}))
                    {:name        "MBQL question"
                     :database_id (mt/id)
                     :table_id    (mt/id :venues)})]
       Card [{native-card-id :id}
             (merge (mt/card-with-source-metadata-for-query
                     (mt/native-query {:query "select name from venues;"}))
                    {:name        "Native question"
                     :database_id (mt/id)
                     :table_id    (mt/id :venues)})]]

      (let [mbql-card-fields   (card-fields-from-table-metadata mbql-card-id)
            native-card-fields (card-fields-from-table-metadata native-card-id)
            fields->parameter  (fn [fields card-id]
                                 (for [{:keys [id field_ref name]} fields]
                                   {:id                   (format "id_%s" name)
                                    :type                 "category"
                                    :name                 name
                                    :values_source_type   "card"
                                    :values_source_config {:card_id     card-id
                                                           :value_field (if (number? id)
                                                                          field_ref
                                                                          id)}}))
            parameters         (concat
                                (fields->parameter mbql-card-fields mbql-card-id)
                                (fields->parameter native-card-fields native-card-id))]
        (t2.with-temp/with-temp [Dashboard {dash-id :id} {:parameters parameters}]
          (doseq [param parameters]
            (let-url [url (chain-filter-values-url dash-id (:id param))]
              (is (some? (mt/user-http-request :rasta :get 200 url))))))))))

(deftest valid-filter-fields-test
  (testing "GET /api/dashboard/params/valid-filter-fields"
    (letfn [(url [filtered filtering]
              (let [url    "dashboard/params/valid-filter-fields"
                    params (str/join "&" (concat (for [id filtered]
                                                   (format "filtered=%d" id))
                                                 (for [id filtering]
                                                   (format "filtering=%d" id))))]
                (if (seq params)
                  (str url "?" params)
                  url)))
            (result= [expected {:keys [filtered filtering]}]
              (let [url (url filtered filtering)]
                (testing (format "\nGET %s" (pr-str url))
                  (is (= expected
                         (mt/user-http-request :rasta :get 200 url))))))]
      (mt/$ids
        (testing (format "\nvenues.price = %d categories.name = %d\n" %venues.price %categories.name)
          (result= {%venues.price [%categories.name]}
                   {:filtered [%venues.price], :filtering [%categories.name]})
          (testing "Multiple Field IDs for each param"
            (result= {%venues.price    (sort [%venues.price %categories.name])
                      %categories.name (sort [%venues.price %categories.name])}
                     {:filtered [%venues.price %categories.name], :filtering [%categories.name %venues.price]}))
          (testing "filtered-ids cannot be nil"
            (is (= {:errors {:filtered (str "value must satisfy one of the following requirements:"
                                            " 1) value must be a valid integer greater than zero."
                                            " 2) value must be an array. Each value must be a valid integer greater than zero."
                                            " The array cannot be empty.")}}
                   (mt/user-http-request :rasta :get 400 (url [] [%categories.name])))))))
      (testing "should check perms for the Fields in question"
        (mt/with-temp-copy-of-db
          (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (mt/$ids (url [%venues.price] [%categories.name]))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             POST /api/dashboard/:dashboard-id/card/:card-id/query                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-card-query-url [dashboard-id card-id dashcard-id]
  (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id))

(defn- dashboard-card-query-expected-results-schema [& {:keys [row-count], :or {row-count 100}}]
  {:database_id (s/eq (mt/id))
   :row_count   (s/eq row-count)
   :data        {:rows     s/Any
                 s/Keyword s/Any}
   s/Keyword    s/Any})

(deftest dashboard-card-query-test
  (testing "POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
    (mt/with-temp-copy-of-db
      (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard, {card-id :id} :card, {dashcard-id :id} :dashcard}]
        (letfn [(url [& {:keys [dashboard-id card-id]
                         :or   {dashboard-id dashboard-id
                                card-id      card-id}}]
                  (dashboard-card-query-url dashboard-id card-id dashcard-id))
                (dashboard-card-query-expected-results-schema [& {:keys [row-count], :or {row-count 100}}]
                  {:database_id (s/eq (mt/id))
                   :row_count   (s/eq row-count)
                   :data        {:rows     s/Any
                                 s/Keyword s/Any}
                   s/Keyword    s/Any})]
          (testing "Should return Card results"
            (is (schema= (dashboard-card-query-expected-results-schema)
                         (mt/user-http-request :rasta :post 202 (url))))
            (testing "Should *not* require data perms"
              (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
              (is (schema= (dashboard-card-query-expected-results-schema)
                           (mt/user-http-request :rasta :post 202 (url))))))

          (testing "Validation"
            (testing "404s"
              (testing "Should return 404 if Dashboard doesn't exist"
                (is (= "Not found."
                       (mt/user-http-request :rasta :post 404 (url :dashboard-id Integer/MAX_VALUE)))))
              (testing "Should return 404 if Card doesn't exist"
                (is (= "Not found."
                       (mt/user-http-request :rasta :post 404 (url :card-id Integer/MAX_VALUE))))))

            (testing "perms"
              (t2.with-temp/with-temp [Collection {collection-id :id}]
                (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
                (testing "Should return error if current User doesn't have read perms for the Dashboard"
                  (mt/with-temp-vals-in-db Dashboard dashboard-id {:collection_id collection-id}
                    (is (= "You don't have permissions to do that."
                           (mt/user-http-request :rasta :post 403 (url))))))
                (testing "Should return error if current User doesn't have query perms for the Card"
                  (mt/with-temp-vals-in-db Card card-id {:collection_id collection-id}
                    (is (= "You don't have permissions to do that."
                           (mt/user-http-request :rasta :post 403 (url))))))))))))))

;; see also [[metabase.query-processor.dashboard-test]]
(deftest dashboard-card-query-parameters-test
  (testing "POST /api/dashboard/:dashboard-id/card/:card-id/query"
    (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard, {card-id :id} :card, {dashcard-id :id} :dashcard}]
      (let [url (dashboard-card-query-url dashboard-id card-id dashcard-id)]
        (testing "parameters"
          (testing "Should respect valid parameters"
            (is (schema= (dashboard-card-query-expected-results-schema :row-count 6)
                         (mt/user-http-request :rasta :post 202 url
                                               {:parameters [{:id    "_PRICE_"
                                                              :value 4}]})))
            (testing "New parameter types"
              (testing :number/=
                (is (schema= (dashboard-card-query-expected-results-schema :row-count 94)
                             (mt/user-http-request :rasta :post 202 url
                                                   {:parameters [{:id    "_PRICE_"
                                                                  :type  :number/=
                                                                  :value [1 2 3]}]}))))))
          (testing "Should return error if parameter doesn't exist"
            (is (= "Dashboard does not have a parameter with ID \"_THIS_PARAMETER_DOES_NOT_EXIST_\"."
                    (mt/user-http-request :rasta :post 400 url
                                          {:parameters [{:id    "_THIS_PARAMETER_DOES_NOT_EXIST_"
                                                         :value 3}]}))))
          (testing "Should return sensible error message for invalid parameter input"
            (is (= {:errors {:parameters (str "value may be nil, or if non-nil, value must be an array. "
                                              "Each value must be a parameter map with an 'id' key")}}
                   (mt/user-http-request :rasta :post 400 url
                                         {:parameters {"_PRICE_" 3}}))))
          (testing "Should ignore parameters that are valid for the Dashboard but not part of this Card (no mapping)"
            (testing "Sanity check"
              (is (schema= (dashboard-card-query-expected-results-schema :row-count 6)
                           (mt/user-http-request :rasta :post 202 url
                                                 {:parameters [{:id    "_PRICE_"
                                                                :value 4}]}))))
            (mt/with-temp-vals-in-db DashboardCard dashcard-id {:parameter_mappings []}
              (is (schema= (dashboard-card-query-expected-results-schema :row-count 100)
                           (mt/user-http-request :rasta :post 202 url
                                                 {:parameters [{:id    "_PRICE_"
                                                                :value 4}]})))))

          ;; don't let people try to be sneaky and get around our validation by passing in a different `:target`
          (testing "Should ignore incorrect `:target` passed in to API endpoint"
            (is (schema= (dashboard-card-query-expected-results-schema :row-count 6)
                         (mt/user-http-request :rasta :post 202 url
                                               {:parameters [{:id     "_PRICE_"
                                                              :target [:dimension [:field (mt/id :venues :id) nil]]
                                                              :value  4}]})))))))))

(defn- parse-export-format-results [^bytes results export-format]
  (with-open [is (java.io.ByteArrayInputStream. results)]
    (streaming.test-util/parse-result export-format is)))

(deftest dashboard-card-query-export-format-test
  (testing "POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"
    (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard, {card-id :id} :card, {dashcard-id :id} :dashcard}]
      (doseq [export-format [:csv :json :xlsx]]
        (testing (format "Export format = %s" export-format)
          (let [url (format "%s/%s" (dashboard-card-query-url dashboard-id card-id dashcard-id) (name export-format))]
            (is (= (streaming.test-util/process-query-basic-streaming
                    export-format
                    (mt/mbql-query venues {:filter [:= $price 4]}))
                   (parse-export-format-results
                    (mt/user-http-request :rasta :post 200 url
                                          {:request-options {:as :byte-array}}
                                          :parameters (json/generate-string [{:id    "_PRICE_"
                                                                              :value 4}]))
                    export-format)))))))))

(defn- dashcard-pivot-query-endpoint [dashboard-id card-id dashcard-id]
  (format "dashboard/pivot/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id))

(deftest dashboard-card-query-pivot-test
  (testing "POST /api/dashboard/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
    (mt/test-drivers (api.pivots/applicable-drivers)
      (mt/dataset sample-dataset
        (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                        Card          [{card-id :id} (api.pivots/pivot-card)]
                        DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]]
          (let [result (mt/user-http-request :rasta :post 202 (dashcard-pivot-query-endpoint dashboard-id card-id dashcard-id))
                rows   (mt/rows result)]
            (is (= 1144 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))
            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["MS" "Organic" "Gizmo" 0 16 42] (nth rows 445)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))))))

(defn- has-valid-action-execution-error-message? [response]
  (string? (:message response)))

(deftest dashcard-query-action-execution-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id model-id]} {}]
        (testing "Executing dashcard with action"
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id action-id
                                                            :card_id model-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                       dashboard-id
                                       dashcard-id)]
              (testing "Dashcard parameter"
                (is (partial= {:rows-affected 1}
                              (mt/user-http-request :crowberto :post 200 execute-path
                                                    {:parameters {"id" 1}})))
                (is (= [1 "Shop"]
                       (mt/first-row
                         (mt/run-mbql-query categories {:filter [:= $id 1]})))))
              (testing "Missing required parameter according to the template tag"
                (is (partial= {:message "Error executing Action: Error building query parameter map: Error determining value for parameter \"id\": You'll need to pick a value for 'ID' before this query can run."}
                              (mt/user-http-request :crowberto :post 500 execute-path
                                                    {:parameters {"name" "Bird"}})))
                (is (= [1 "Shop"]
                       (mt/first-row
                        (mt/run-mbql-query categories {:filter [:= $id 1]})))))
              (testing "Extra target parameter"
                (is (partial= {:rows-affected 1}
                              (mt/user-http-request :crowberto :post 200 execute-path
                                                    {:parameters {"id" 1 "name" "Bird"}})))
                (is (= [1 "Bird Shop"]
                       (mt/first-row
                         (mt/run-mbql-query categories {:filter [:= $id 1]})))))
              (testing "Should affect 0 rows if id is out of range"
                (is (= {:rows-affected 0}
                       (mt/user-http-request :crowberto :post 200 execute-path
                                             {:parameters {"id" Integer/MAX_VALUE}}))))
              (testing "Should 404 if bad dashcard-id"
                (is (= "Not found."
                       (mt/user-http-request :crowberto :post 404 (format "dashboard/%d/dashcard/%s/execute"
                                                                          dashboard-id
                                                                          Integer/MAX_VALUE)
                                             {}))))
              (testing "Missing parameter should fail gracefully"
                (is (has-valid-action-execution-error-message?
                     (mt/user-http-request :crowberto :post 500 execute-path
                                           {:parameters {}}))))
              (testing "Sending an invalid number should fail gracefully"
                (is (has-valid-action-execution-error-message?
                     (mt/user-http-request :crowberto :post 500 execute-path
                                           {:parameters {"id" "BAD"}}))))
              (testing "should send a snowplow event"
                (snowplow-test/with-fake-snowplow-collector
                  (mt/user-http-request :crowberto :post 200 execute-path
                                        {:parameters {"id" 1}})
                  (is (= {:data {"action_id" action-id
                                 "event"     "action_executed"
                                 "source"    "dashboard"
                                 "type"      "query"}
                          :user-id (str (mt/user->id :crowberto))}
                         (last (snowplow-test/pop-event-data-and-user-id!)))))))))))))

(deftest dashcard-http-action-execution-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id model-id]} {:type :http}]
        (testing "Executing dashcard with action"
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id action-id
                                                            :card_id model-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                       dashboard-id
                                       dashcard-id)]
              (testing "Should be able to execute an action"
                (is (= {:the_parameter 1}
                       (mt/user-http-request :crowberto :post 200 execute-path
                                             {:parameters {"id" 1}}))))
              (testing "Should handle errors"
                (is (= {:remote-status 400}
                       (mt/user-http-request :crowberto :post 400 execute-path
                                             {:parameters {"id" 1 "fail" "true"}}))))
              (testing "Extra parameter should fail gracefully"
                (is (partial= {:message "No destination parameter found for #{\"extra\"}. Found: #{\"id\" \"fail\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"extra" 1}}))))
              (testing "Missing parameter should fail gracefully"
                (is (has-valid-action-execution-error-message?
                     (mt/user-http-request :crowberto :post 500 execute-path
                                           {:parameters {}}))))
              (testing "Sending an invalid number should fail gracefully"
                (is (has-valid-action-execution-error-message?
                     (mt/user-http-request :crowberto :post 500 execute-path
                                           {:parameters {"id" "BAD"}})))))))))))

(deftest dashcard-implicit-action-execution-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Executing dashcard insert"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/create"}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id model-id
                                                            :action_id action-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)
                  new-row (-> (mt/user-http-request :crowberto :post 200 execute-path
                                                    {:parameters {"name" "Birds"}})
                              :created-row
                              (update-keys (comp keyword u/lower-case-en name)))]
              (testing "Should be able to insert"
                (is (pos? (:id new-row)))
                (is (partial= {:name "Birds"}
                              new-row)))
              (testing "Extra parameter should fail gracefully"
                (is (partial= {:message "No destination parameter found for #{\"extra\"}. Found: #{\"name\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"extra" 1}}))))
              (testing "Missing other parameters should fail gracefully"
                (is (partial= "Implicit parameters must be provided."
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {}}))))))))
      (testing "Executing dashcard update"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/update"}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id model-id
                                                            :action_id action-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "Should be able to update"
                (is (= {:rows-updated [1]}
                       (mt/user-http-request :crowberto :post 200 execute-path
                                             {:parameters {"id" 1 "name" "Birds"}}))))
              (testing "Extra parameter should fail gracefully"
                (is (partial= {:message "No destination parameter found for #{\"extra\"}. Found: #{\"id\" \"name\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"extra" 1 "id" 1}}))))
              (testing "Missing pk parameter should fail gracefully"
                (is (partial= "Missing primary key parameter: \"id\""
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"name" "Birds"}}))))
              (testing "Missing other parameters should fail gracefully"
                (is (partial= "Implicit parameters must be provided."
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"id" 1}}))))))))
      (testing "Executing dashcard delete"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/delete"}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id model-id
                                                            :action_id action-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "Should be able to delete"
                (is (= {:rows-deleted [1]}
                       (mt/user-http-request :crowberto :post 200 execute-path
                                             {:parameters {"id" 1}}))))
              (testing "Extra parameter should fail gracefully"
                (is (partial= {:message "No destination parameter found for #{\"extra\"}. Found: #{\"id\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"extra" 1 "id" 1}}))))
              (testing "Extra parameter should fail even if it's a model field"
                (is (partial= {:message "No destination parameter found for #{\"name\"}. Found: #{\"id\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"id"   1
                                                                  "name" "Birds"}}))))
              (testing "Missing pk parameter should fail gracefully"
                (is (partial= "Missing primary key parameter: \"id\""
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {}})))))))))))

(deftest dashcard-hidden-parameter-test
  (mt/with-actions-test-data-tables #{"users"}
    (mt/with-actions-enabled
      (mt/with-actions [_ {:dataset true :dataset_query (mt/mbql-query users)}
                        {:keys [action-id model-id]} {:type                   :implicit
                                                      :visualization_settings {:fields {"name" {:id     "name"
                                                                                                :hidden true}}}}]
        (testing "Supplying a hidden parameter value should fail gracefully for GET /api/dashboard/:id/dashcard/:id/execute"
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id    action-id
                                                            :card_id      model-id}]]
            (is (partial= {:message "No destination parameter found for #{\"name\"}. Found: #{\"last_login\" \"id\"}"}
                          (mt/user-http-request :crowberto :post 400 (format "dashboard/%s/dashcard/%s/execute"
                                                                             dashboard-id
                                                                             dashcard-id)
                                                {:parameters {:name "Darth Vader"}})))))))))

(defn- custom-action-for-field [field-name]
  ;; It seems the :type of parameters or template-tag doesn't matter??
  ;; How to go from base-type (type/Integer) to param type (number)?
  {:type :query
   :parameters [{:id field-name :slug field-name :target ["variable" ["template-tag" field-name]] :type :text}]
   :dataset_query (mt/native-query
                    {:query (format "insert into types (%s) values ({{%s}})"
                                    (u/upper-case-en field-name)
                                    field-name)
                     :template-tags {field-name {:id field-name :name field-name :type :text :display_name field-name}}})})

(deftest dashcard-action-execution-type-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (let [types [{:field-name "atext" :base-type :type/Text ::good "hello"}
                 {:field-name "aboolean" :base-type :type/Boolean ::good true ::bad "not boolean"}
                 {:field-name "ainteger" :base-type :type/Integer ::good 100}
                 {:field-name "afloat" :base-type :type/Float ::good 0.4}
                 ;; h2 and postgres handle this differently str vs #uuid, in and out
                 {:field-name "auuid" :base-type :type/UUID #_#_::good (random-uuid)}
                 ;; These comeback with timezone, date comes back with time
                 {:field-name "adate" :base-type :type/Date #_#_::good "2020-02-02"}
                 {:field-name "adatetime" :base-type :type/DateTime #_#_::good "2020-02-02 14:39:59"}
                 ;; Difference between h2 and postgres, in and out
                 {:field-name "adatetimetz" :base-type :type/DateTimeWithTZ #_#_::good "2020-02-02 14:39:59-0700" ::bad "not date"}]]
      (mt/with-temp-test-data
        ["types"
         (map #(dissoc % ::good ::bad) types)
         [["init"]]]
        (mt/with-actions-enabled
          (mt/with-actions [{card-id :id} {:dataset true :dataset_query (mt/mbql-query types)}
                            {:keys [action-id]} {:type :implicit :kind "row/create"}]
            (mt/with-temp* [Dashboard [{dashboard-id :id}]
                            DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                              :action_id action-id
                                                              :card_id card-id}]]
              (testing "Good data"
                (doseq [{:keys [field-name] value ::good} (filter ::good types)]
                  (testing (str "Attempting to implicitly insert " field-name)
                    (mt/user-http-request :crowberto :post 200  (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)
                                          {:parameters {field-name value}})
                    (let [{{:keys [rows cols]} :data} (qp/process-query
                                                       (assoc-in (mt/mbql-query types)
                                                                 [:query :order_by] [["asc", ["field", (mt/id :types :id) nil]]]))]
                      (is (partial= {field-name value}
                                    (zipmap (map (comp u/lower-case-en :name) cols)
                                            (last rows))))))
                  (mt/with-actions [{card-id :id} {:dataset true :dataset_query (mt/mbql-query types)}
                                    {:keys [action-id]} (custom-action-for-field field-name)]
                    (t2.with-temp/with-temp [DashboardCard {custom-dashcard-id :id} {:dashboard_id dashboard-id
                                                                                     :action_id action-id
                                                                                     :card_id card-id}]
                      (testing (str "Attempting to custom insert " field-name)
                        (mt/user-http-request :crowberto :post 200
                                              (format "dashboard/%s/dashcard/%s/execute" dashboard-id custom-dashcard-id)
                                              {:parameters {field-name value}})
                        (let [{{:keys [rows cols]} :data} (qp/process-query
                                                           (assoc-in (mt/mbql-query types)
                                                                     [:query :order_by] [["asc", ["field", (mt/id :types :id) nil]]]))]
                          (is (partial= {field-name value}
                                        (zipmap (map (comp u/lower-case-en :name) cols)
                                                (last rows))))))))))
              (testing "Bad data"
                (doseq [{:keys [field-name] value ::bad} (filter ::bad types)]
                  (testing (str "Attempting to implicitly insert bad " field-name)
                    (is (has-valid-action-execution-error-message?
                         (mt/user-http-request :crowberto :post 400
                                               (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)
                                               {:parameters {field-name value}}))))
                  (mt/with-actions [{card-id :id} {:dataset true :dataset_query (mt/mbql-query types)}
                                    {action-id :action-id} (custom-action-for-field field-name)]
                    (t2.with-temp/with-temp [DashboardCard {custom-dashcard-id :id} {:dashboard_id dashboard-id
                                                                                     :action_id action-id
                                                                                     :card_id card-id}]
                      (testing (str "Attempting to custom insert bad " field-name)
                        (is (has-valid-action-execution-error-message?
                             (mt/user-http-request :crowberto :post 500
                                                   (format "dashboard/%s/dashcard/%s/execute" dashboard-id custom-dashcard-id)
                                                   {:parameters {field-name value}})))))))))))))))

(deftest dashcard-implicit-action-execution-auth-test
  (mt/with-temp-copy-of-db
    (mt/with-actions-test-data
      (testing "Executing dashcard with action"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/create"}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id action-id
                                                            :card_id model-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                       dashboard-id
                                       dashcard-id)]
              (testing "Without actions enabled"
                (is (= "Actions are not enabled."
                       (:cause
                        (mt/user-http-request :crowberto :post 400 execute-path
                                              {:parameters {"name" "Birds"}})))))
              ;; Actions cannot run with access to the DB blocked, which is an enterprise feature.  See tests in
              ;; enterprise/backend/test/metabase_enterprise/advanced_permissions/common_test.clj and at the bottom of
              ;; this file
              (testing "Works without read rights on the DB (but access not blocked)"
                (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
                (mt/with-actions-enabled
                  (is (contains? #{{:ID 76, :NAME "Birds"}
                                   {:id 76, :name "Birds"}}
                                 (-> (mt/user-http-request :rasta :post 200 execute-path
                                                           {:parameters {"name" "Birds"}})
                                     :created-row)))))
              (testing "Works with execute rights on the DB"
                (perms/grant-full-data-permissions! (perms-group/all-users) (mt/db))
                (try
                  (mt/with-actions-enabled
                    (is (contains? #{{:ID 77, :NAME "Avians"}
                                     {:id 77, :name "Avians"}}
                                   (-> (mt/user-http-request :rasta :post 200 execute-path
                                                             {:parameters {"name" "Avians"}})
                                       :created-row))))
                  (finally
                    (perms/revoke-data-perms! (perms-group/all-users) (mt/db))))))))))))

(deftest dashcard-custom-action-execution-auth-test
  (mt/with-temp-copy-of-db
    (mt/with-actions-test-data
      (mt/with-actions [{:keys [action-id model-id]} {}]
        (testing "Executing dashcard with action"
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id action-id
                                                            :card_id model-id}]]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                       dashboard-id
                                       dashcard-id)]
              (testing "Fails with actions disabled"
                (is (= "Actions are not enabled."
                       (:cause
                        (mt/user-http-request :crowberto :post 400 execute-path
                                              {:parameters {"id" 1}})))))
              ;; Actions cannot run with access to the DB blocked, which is an enterprise feature.  See tests in
              ;; enterprise/backend/test/metabase_enterprise/advanced_permissions/common_test.clj and at the bottom of
              ;; this file.
              (testing "Works with read rights on the DB"
                (perms/grant-permissions-for-all-schemas! (perms-group/all-users) (mt/db))
                (try
                  (mt/with-actions-enabled
                    (is (= {:rows-affected 1}
                           (mt/user-http-request :rasta :post 200 execute-path
                                                 {:parameters {"id" 1}}))))
                  (finally
                    (perms/revoke-data-perms! (perms-group/all-users) (mt/db)))))
              (testing "Works with no particular permissions"
                (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
                (mt/with-actions-enabled
                  (is (= {:rows-affected 1}
                         (mt/user-http-request :rasta :post 200 execute-path
                                               {:parameters {"id" 1}}))))))))))))

(deftest dashcard-execution-fetch-prefill-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Prefetching dashcard update"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id model-id
                                                            :action_id action-id}]]
            (let [path #(format "dashboard/%s/dashcard/%s/execute?parameters=%s" dashboard-id dashcard-id (codec/url-encode (json/encode %)))]
              (testing "It succeeds with appropriate parameters"
                (is (partial= {:id 1 :name "African"}
                              (mt/user-http-request :crowberto :get 200
                                                    (path {"id" 1})))))
              (testing "Missing pk parameter should fail gracefully"
                (is (partial= "Missing primary key parameter: \"id\""
                              (mt/user-http-request
                               :crowberto :get 400
                               (path {"name" 1}))))))))))))

(deftest dashcard-implicit-action-only-expose-and-allow-model-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-tables #{"venues" "categories"}
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{card-id :id} {:dataset true :dataset_query (mt/mbql-query venues {:fields [$id $name]})}
                          {:keys [action-id]} {:type :implicit :kind "row/update"}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id action-id
                                                            :card_id card-id}]]
            (testing "Dashcard should only have id and name params"
              (is (partial= {:ordered_cards [{:action {:parameters [{:id "id"} {:id "name"}]}}]}
                            (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "Prefetch should limit to id and name"
                (let [values (mt/user-http-request :crowberto :get 200 (str execute-path "?parameters=" (json/encode {:id 1})))]
                  (is (= {:id 1 :name "Red Medicine"} values))))
              (testing "Update should only allow name"
                (is (= {:rows-updated [1]}
                       (mt/user-http-request :crowberto :post 200 execute-path {:parameters {"id" 1 "name" "Blueberries"}})))
                (is (partial= {:message "No destination parameter found for #{\"price\"}. Found: #{\"id\" \"name\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path {:parameters {"id" 1 "name" "Blueberries" "price" 1234}})))))))))))

(deftest dashcard-implicit-action-only-expose-unhidden-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-tables #{"venues" "categories"}
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{card-id :id} {:dataset true, :dataset_query (mt/mbql-query venues {:fields [$id $name $price]})}
                          {:keys [action-id]} {:type :implicit
                                               :kind "row/update"
                                               :visualization_settings {:fields {"id"    {:id     "id"
                                                                                          :hidden false}
                                                                                 "name"  {:id     "name"
                                                                                          :hidden false}
                                                                                 "price" {:id     "price"
                                                                                          :hidden true}}}}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                            :action_id action-id
                                                            :card_id card-id}]]
            (testing "Dashcard should only have id and name params"
              (is (partial= {:ordered_cards [{:action {:parameters [{:id "id"} {:id "name"}]}}]}
                            (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "Prefetch should only return non-hidden fields"
                (is (= {:id 1 :name "Red Medicine"} ; price is hidden
                       (mt/user-http-request :crowberto :get 200 (str execute-path "?parameters=" (json/encode {:id 1}))))))
              (testing "Update should only allow name"
                (is (= {:rows-updated [1]}
                       (mt/user-http-request :crowberto :post 200 execute-path {:parameters {"id" 1 "name" "Blueberries"}})))
                (is (partial= {:message "No destination parameter found for #{\"price\"}. Found: #{\"id\" \"name\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path {:parameters {"id" 1 "name" "Blueberries" "price" 1234}})))))))))))

(defn- ee-features-enabled? []
  (u/ignore-exceptions
    (classloader/require 'metabase-enterprise.advanced-permissions.models.permissions)
    (some? (resolve 'metabase-enterprise.advanced-permissions.models.permissions/update-db-execute-permissions!))))

(deftest dashcard-action-execution-granular-auth-test
  (when (ee-features-enabled?)
    (mt/with-temp-copy-of-db
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (testing "Executing dashcard with action"
            (mt/with-temp* [Dashboard [{dashboard-id :id}]
                            DashboardCard [{dashcard-id :id}
                                           {:dashboard_id dashboard-id
                                            :action_id action-id
                                            :card_id model-id}]]
              (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                         dashboard-id
                                         dashcard-id)]
                (testing "with :advanced-permissions feature flag"
                  (premium-features-test/with-premium-features #{:advanced-permissions}
                    (testing "for non-magic group"
                      (mt/with-temp* [PermissionsGroup [{group-id :id}]
                                      PermissionsGroupMembership [_ {:user_id  (mt/user->id :rasta)
                                                                     :group_id group-id}]]
                        (comment ;; We do not currently support /execute/ permission
                          (is (partial= {:message "You don't have permissions to do that."}
                                        (mt/user-http-request :rasta :post 403 execute-path
                                                              {:parameters {"id" 1}}))
                              "Execution permission should be required"))
                        (mt/user-http-request
                         :crowberto :put 200 "permissions/execution/graph"
                         (assoc-in (perms/execution-perms-graph) [:groups group-id (mt/id)] :all))
                        (is (= :all
                               (get-in (perms/execution-perms-graph) [:groups group-id (mt/id)]))
                            "Should be able to set execution permission")
                        (is (= {:rows-affected 1}
                               (mt/user-http-request :rasta :post 200 execute-path
                                                     {:parameters {"id" 1}}))
                            "Execution and data permissions should be enough")

                        (perms/update-data-perms-graph! [group-id (mt/id) :data]
                                                        {:schemas :block})
                        (perms/update-data-perms-graph! [(:id (perms-group/all-users)) (mt/id) :data]
                                                        {:schemas :block})
                        (is (partial= {:message "You don't have permissions to do that."}
                                      (mt/user-http-request :rasta :post 403 execute-path
                                                            {:parameters {"id" 1}}))
                            "Data permissions should be required")))))))))))))
