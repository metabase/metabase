(ns ^:mb/driver-tests metabase.dashboards.api-test
  "Tests for /api/dashboard endpoints."
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.api.response :as api.response]
   [metabase.api.test-util :as api.test-util]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.dashboards.api :as api.dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-test :as dashboard-test]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.interface :as mi]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.chain-filter-test :as chain-filter-test]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.pulse.dashboard-subscription-test :as dashboard-subscription-test]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.queries.api.card-test :as api.card-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot.test-util :as api.pivots]
   [metabase.query-processor.streaming.test-util :as streaming.test-util]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]
   [toucan2.protocols :as t2.protocols]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(deftest ^:parallel update-colvalmap-setting-test
  (testing "update-colvalmap-setting function with regex matching"
    (let [id->new-card {123 {:id 456}
                        789 {:id 987}}
          col->val-source {:COLUMN_1 [{:sourceId "card:123" :originalName "sum" :name "COLUMN_1"}]
                           :COLUMN_2 [{:sourceId "card:789" :originalName "count" :name "COLUMN_2"}]
                           :COLUMN_3 [{:sourceId "card:999" :originalName "avg" :name "COLUMN_3"}]
                           :COLUMN_4 [{:sourceId "not-a-card" :originalName "x" :name "COLUMN_4"}]
                           :COLUMN_5 [{:sourceId "card:abc" :originalName "invalid" :name "COLUMN_5"}]
                           :COLUMN_6 [{:name "No source ID"}]}
          result (#'api.dashboard/update-colvalmap-setting col->val-source id->new-card)]

      (testing "should update valid card IDs that exist in the map"
        (is (= "card:456" (-> result :COLUMN_1 first :sourceId)))
        (is (= "card:987" (-> result :COLUMN_2 first :sourceId))))

      (testing "should not modify card IDs that don't exist in the map"
        (is (= "card:999" (-> result :COLUMN_3 first :sourceId))))

      (testing "should not modify non-card sourceIds"
        (is (= "not-a-card" (-> result :COLUMN_4 first :sourceId))))

      (testing "should not modify invalid card IDs (non-numeric)"
        (is (= "card:abc" (-> result :COLUMN_5 first :sourceId))))

      (testing "should handle items without sourceId"
        (is (= {:name "No source ID"} (-> result :COLUMN_6 first)))))))

(defn- remove-ids-and-booleanize-timestamps [x]
  (cond
    (map? x)
    (into {} (for [[k v] x]
               (when-not (or (#{:id :card_schema} k)
                             (str/ends-with? k "_id"))
                 (if (#{:created_at :updated_at} k)
                   [k (boolean v)]
                   [k (remove-ids-and-booleanize-timestamps v)]))))

    (coll? x)
    (mapv remove-ids-and-booleanize-timestamps x)

    :else
    x))

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

(defn- dashboard-response [{:keys [creator dashcards created_at updated_at] :as dashboard}]
  ;; todo: should be udpated to use mt/boolean-ids-and-timestamps
  (let [dash (-> (into {} dashboard)
                 (dissoc :id)
                 (assoc :created_at (boolean created_at)
                        :updated_at (boolean updated_at))
                 (update :entity_id boolean)
                 (update :collection_id boolean)
                 (update :collection boolean))]
    (cond-> dash
      (contains? dash :last-edit-info)
      (update :last-edit-info (fn [info]
                                (-> info
                                    (update :id boolean)
                                    (update :timestamp boolean))))
      creator       (update :creator #(into {} %))
      dashcards (update :dashcards #(mapv dashcard-response %)))))

(defn- do-with-dashboards-in-a-collection! [grant-collection-perms-fn! dashboards-or-ids f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection]
      (grant-collection-perms-fn! (perms-group/all-users) collection)
      (doseq [dashboard-or-id dashboards-or-ids]
        (t2/update! :model/Dashboard (u/the-id dashboard-or-id) {:collection_id (u/the-id collection)}))
      (f))))

(defmacro ^:private with-dashboards-in-readable-collection! [dashboards-or-ids & body]
  `(do-with-dashboards-in-a-collection! perms/grant-collection-read-permissions! ~dashboards-or-ids (fn [] ~@body)))

(defmacro ^:private with-dashboards-in-writeable-collection! [dashboards-or-ids & body]
  `(do-with-dashboards-in-a-collection! perms/grant-collection-readwrite-permissions! ~dashboards-or-ids (fn [] ~@body)))

(defn do-with-simple-dashboard-with-tabs
  [f]
  (mt/with-temp
    [:model/Dashboard           {dashboard-id :id} {}

     :model/Card                {card-id-1 :id}    {}

     :model/Card                {card-id-2 :id}    {}
     :model/DashboardTab {dashtab-id-1 :id} {:name         "Tab 1"
                                             :dashboard_id dashboard-id
                                             :position     0}
     :model/DashboardTab {dashtab-id-2 :id} {:name         "Tab 2"
                                             :dashboard_id dashboard-id
                                             :position     1}
     :model/DashboardCard       {dashcard-id-1 :id} {:dashboard_id     dashboard-id
                                                     :card_id          card-id-1
                                                     :dashboard_tab_id dashtab-id-1
                                                     :row              1}
     :model/DashboardCard       {dashcard-id-2 :id} {:dashboard_id     dashboard-id
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

(deftest ^:parallel auth-test
  (is (= (get api.response/response-unauthentic :body)
         (client/client :get 401 "dashboard")
         (client/client :put 401 "dashboard/13"))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/dashboard                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-dashboard-validation-test
  (testing "POST /api/dashboard"
    (is (= {:errors {:name "value must be a non-blank string."}
            :specific-errors {:name ["missing required key, received: nil"]}}
           (mt/user-http-request :rasta :post 400 "dashboard" {})))))

(deftest create-dashboard-validation-test-2
  (testing "POST /api/dashboard"
    (is (= {:errors {:parameters "nullable sequence of parameter must be a map with :id and :type keys"}
            :specific-errors {:parameters ["invalid type, received: \"abc\""]}}
           (mt/user-http-request :crowberto :post 400 "dashboard" {:name       "Test"
                                                                   :parameters "abc"})))))

(deftest create-dashboard-test
  (testing "POST /api/dashboard"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (let [test-dashboard-name "Test Create Dashboard"]
          (mt/with-model-cleanup [:model/Dashboard]
            (let [{dashboard-id :id
                   :as          created} (mt/user-http-request :rasta :post 200 "dashboard"
                                                               {:name          test-dashboard-name
                                                                :parameters    [{:id "abc123", :name "test", :type "date"}]
                                                                :cache_ttl     1234
                                                                :collection_id (u/the-id collection)})]
              (is (=? {:name           test-dashboard-name
                       :creator_id     (mt/user->id :rasta)
                       :parameters     [{:id "abc123", :name "test", :type "date"}]
                       :cache_ttl      1234
                       :last-edit-info {:first_name "Rasta"
                                        :last_name "Toucan"
                                        :email "rasta@metabase.com"}}
                      created))
              (testing "A POST /api/dashboard should return the same essential data as a GET of that same dashboard after creation (#34828)"
                (let [retrieved (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id))]
                  (is (= (update created :last-edit-info dissoc :timestamp)
                         (update retrieved :last-edit-info dissoc :timestamp))))))))))))

(deftest create-dashboard-with-collection-position-test
  (testing "POST /api/dashboard"
    (testing "Make sure we can create a Dashboard with a Collection position"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection]
          (mt/with-model-cleanup [:model/Dashboard]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (let [dashboard-name (mt/random-name)]
              (mt/user-http-request :rasta :post 200 "dashboard" {:name                dashboard-name
                                                                  :collection_id       (u/the-id collection)
                                                                  :collection_position 1000})
              (is (=? {:collection_id true, :collection_position 1000}
                      (some-> (t2/select-one [:model/Dashboard :collection_id :collection_position] :name dashboard-name)
                              (update :collection_id (partial = (u/the-id collection))))))))

          (testing "..but not if we don't have permissions for the Collection"
            (mt/with-temp [:model/Collection collection]
              (let [dashboard-name (mt/random-name)]
                (mt/user-http-request :rasta :post 403 "dashboard" {:name                dashboard-name
                                                                    :collection_id       (u/the-id collection)
                                                                    :collection_position 1000})
                (is (not (t2/select-one [:model/Dashboard :collection_id :collection_position] :name dashboard-name)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               GET /api/dashboard/                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-dashboards-test
  (mt/with-temp
    [:model/Dashboard {rasta-dash-id :id} {:creator_id (mt/user->id :rasta)}
     :model/Dashboard {crowberto-dash-id :id
                       :as               crowberto-dash}    {:creator_id    (mt/user->id :crowberto)
                                                             :collection_id (:id (collection/user->personal-collection (mt/user->id :crowberto)))}
     :model/Dashboard {archived-dash-id :id} {:archived          true
                                              :archived_directly true
                                              :collection_id     (:id (collection/user->personal-collection (mt/user->id :crowberto)))
                                              :creator_id        (mt/user->id :crowberto)}]
    (testing "should include creator info and last edited info"
      (revision/push-revision!
       {:entity       :model/Dashboard
        :id           crowberto-dash-id
        :user-id      (mt/user->id :crowberto)
        :is-creation? true
        :object       crowberto-dash})
      (is (=? (merge crowberto-dash
                     {:creator {:id          (mt/user->id :crowberto)
                                :email       "crowberto@metabase.com"
                                :first_name  "Crowberto"
                                :last_name   "Corv"
                                :common_name "Crowberto Corv"}}
                     {:last-edit-info {:id         (mt/user->id :crowberto)
                                       :first_name "Crowberto"
                                       :last_name  "Corv"
                                       :email      "crowberto@metabase.com"
                                       :timestamp  true}})
              (-> (m/find-first #(= (:id %) crowberto-dash-id)
                                (mt/user-http-request :crowberto :get 200 "dashboard" :f "mine"))
                  (update-in [:last-edit-info :timestamp] boolean)))))

    (testing "f=all shouldn't return archived dashboards"
      (is (set/subset?
           #{rasta-dash-id crowberto-dash-id}
           (set (map :id (mt/user-http-request :crowberto :get 200 "dashboard" :f "all")))))

      (is (not (set/subset?
                #{archived-dash-id}
                (set (map :id (mt/user-http-request :crowberto :get 200 "dashboard" :f "all"))))))

      (testing "and should respect read perms"
        (is (set/subset?
             #{rasta-dash-id}
             (set (map :id (mt/user-http-request :rasta :get 200 "dashboard" :f "all")))))

        (is (not (set/subset?
                  #{crowberto-dash-id archived-dash-id}
                  (set (map :id (mt/user-http-request :rasta :get 200 "dashboard" :f "all"))))))))

    (testing "f=archvied return archived dashboards"
      (is (= #{archived-dash-id}
             (set (map :id (mt/user-http-request :crowberto :get 200 "dashboard" :f "archived")))))

      (testing "and should return read perms"
        (is (= #{}
               (set (map :id (mt/user-http-request :rasta :get 200 "dashboard" :f "archived")))))))

    (testing "f=mine return dashboards created by caller but do not include archived"
      (let [ids (set (map :id (mt/user-http-request :crowberto :get 200 "dashboard" :f "mine")))]
        (is (contains? ids crowberto-dash-id)      "Should contain Crowberto's dashboard")
        (is (not (contains? ids rasta-dash-id))    "Should not contain Rasta's dashboard")
        (is (not (contains? ids archived-dash-id)) "Should not contain archied dashboard")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             GET /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-dashboard-test
  (mt/dataset test-data
    (mt/with-column-remappings [orders.user_id people.name]
      (mt/with-test-user :crowberto
        (mt/with-temp
          [:model/Dashboard {dashboard-id :id} {:name             "Test Dashboard"
                                                :creator_id       (mt/user->id :crowberto)
                                                :embedding_params {:id "enabled", :name "enabled", :source "enabled", :user_id "enabled"}
                                                :parameters       [{:name "Id", :slug "id", :id "a", :type :id}
                                                                   {:name "Name", :slug "name", :id "b", :type :category}
                                                                   {:name "Source", :slug "source", :id "c", :type :category}
                                                                   {:name "User", :slug "user_id", :id "d", :type :id}]}
           :model/Card {card-id :id} {:database_id   (mt/id)
                                      :query_type    :native
                                      :name          "test question"
                                      :creator_id    (mt/user->id :crowberto)
                                      :dataset_query {:type     :native
                                                      :native   {:query "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */"
                                                                 :template-tags
                                                                 {"id"      {:name         "id"
                                                                             :display-name "Id"
                                                                             :id           "_id_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :people :id) nil]
                                                                             :widget-type  :id
                                                                             :default      nil}
                                                                  "name"    {:name         "name"
                                                                             :display-name "Name"
                                                                             :id           "_name_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :people :name) nil]
                                                                             :widget-type  :category
                                                                             :default      nil}
                                                                  "source"  {:name         "source"
                                                                             :display-name "Source"
                                                                             :id           "_source_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :people :source) nil]
                                                                             :widget-type  :category
                                                                             :default      nil}
                                                                  "user_id" {:name         "user_id"
                                                                             :display-name "User"
                                                                             :id           "_user_id_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :orders :user_id) nil]
                                                                             :widget-type  :id
                                                                             :default      nil}}}
                                                      :database (mt/id)}}
           :model/DashboardCard _ {:parameter_mappings [{:parameter_id "a", :card_id card-id, :target [:dimension [:template-tag "id"]]}
                                                        {:parameter_id "b", :card_id card-id, :target [:dimension [:template-tag "name"]]}
                                                        {:parameter_id "c", :card_id card-id, :target [:dimension [:template-tag "source"]]}
                                                        {:parameter_id "d", :card_id card-id, :target [:dimension [:template-tag "user_id"]]}]
                                   :card_id            card-id
                                   :dashboard_id       dashboard-id}]
          (is (#'api.dashboard/get-dashboard dashboard-id)))))))

(deftest get-dashboard-param-fields-has-target-test
  (testing "param-fields for fk has target (#44231)"
    (mt/with-temp
      [:model/Card          {orders-card-id :id}   {:database_id   (mt/id)
                                                    :table_id      (mt/id :orders)
                                                    :dataset_query (mt/mbql-query orders)}
       :model/Dashboard     {dash-id :id} {:parameters [{:name "__ID__", :slug "id", :id "a", :type :id}]}
       :model/DashboardCard _             {:card_id            orders-card-id
                                           :dashboard_id       dash-id
                                           :parameter_mappings [{:parameter_id "__ID__"
                                                                 :card_id      orders-card-id
                                                                 :target       [:dimension (mt/$ids orders $user_id)]}]}]
      (is (=? {"__ID__" [{:id                 (mt/id :orders :user_id)
                          :semantic_type      :type/FK
                          :fk_target_field_id (mt/id :people :id)
                          :target             {:id (mt/id :people :id)
                                               :name_field {:id (mt/id :people :name)}}}]}
              (:param_fields (mt/with-test-user :crowberto
                               (#'api.dashboard/get-dashboard dash-id))))))))

(deftest last-used-parameter-value-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true
                                       dashboards-save-last-used-parameters true]
      (mt/dataset test-data
        (mt/with-column-remappings [orders.user_id people.name]
          (mt/as-admin
            (mt/with-temp
              [:model/Dashboard {dashboard-a-id :id} {:name       "Test Dashboard"
                                                      :creator_id (mt/user->id :crowberto)
                                                      :parameters [{:name    "Name", :slug "name", :id "a" :type :string/contains
                                                                    :default ["default_value"]}]}
               :model/Dashboard {dashboard-b-id :id} {:name       "Test Dashboard"
                                                      :creator_id (mt/user->id :crowberto)
                                                      :parameters [{:name "Name", :slug "name", :id "a" :type :string/contains}]}
               :model/Card {card-id :id} {:database_id   (mt/id)
                                          :query_type    :native
                                          :name          "test question"
                                          :creator_id    (mt/user->id :crowberto)
                                          :dataset_query {:type     :native
                                                          :native   {:query "SELECT COUNT(*) FROM people WHERE {{name}}"
                                                                     :template-tags
                                                                     {"name" {:name         "Name"
                                                                              :display-name "name"
                                                                              :id           "_name_"
                                                                              :type         :dimension
                                                                              :dimension    [:field (mt/id :people :name) nil]
                                                                              :widget-type  :string/contains}}}
                                                          :database (mt/id)}}
               :model/DashboardCard {dashcard-a-id :id} {:parameter_mappings [{:parameter_id "a", :card_id card-id, :target [:dimension [:template-tag "id"]]}]
                                                         :card_id            card-id
                                                         :dashboard_id       dashboard-a-id}
               :model/DashboardCard {dashcard-b-id :id} {:parameter_mappings [{:parameter_id "a", :card_id card-id, :target [:dimension [:template-tag "id"]]}]
                                                         :card_id            card-id
                                                         :dashboard_id       dashboard-b-id}]
              (testing "User's set parameter is saved and sent back in the dashboard response, unique per dashboard."
                ;; api request mimicking a user setting a parameter value
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-a-id dashcard-a-id card-id)
                                                 {:parameters [{:id "a" :value ["initial value"]}]})))
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-b-id dashcard-b-id card-id)
                                                 {:parameters [{:id "a" :value ["initial value"]}]})))
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-a-id dashcard-a-id card-id)
                                                 {:parameters [{:id "a" :value ["new value"]}]})))
                (is (= {:dashboard-a {:a ["new value"]}
                        :dashboard-b {:a ["initial value"]}}
                       {:dashboard-a (:last_used_param_values (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-a-id)))
                        :dashboard-b (:last_used_param_values (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-b-id)))})))
              (testing "If a User unsets a parameter's value, the default is NOT used."
                ;; api request mimicking a user clearing parameter value, and no default exists
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-a-id dashcard-a-id card-id)
                                                 {:parameters [{:id "a" :value nil}]})))
                (is (= {}
                       (:last_used_param_values (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-a-id)))))
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-a-id dashcard-a-id card-id)
                                                 {:parameters [{:id "a" :value nil :default ["default value"]}]})))
                (is (= {:a nil}
                       (:last_used_param_values (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-a-id)))))))))))))

(deftest last-used-parameter-value-disabled-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true
                                       dashboards-save-last-used-parameters false]
      (mt/dataset test-data
        (mt/with-column-remappings [orders.user_id people.name]
          (mt/as-admin
            (mt/with-temp
              [:model/Dashboard {dashboard-a-id :id} {:name       "Test Dashboard"
                                                      :creator_id (mt/user->id :crowberto)
                                                      :parameters [{:name    "Name", :slug "name", :id "a" :type :string/contains
                                                                    :default ["default_value"]}]}
               :model/Dashboard {dashboard-b-id :id} {:name       "Test Dashboard"
                                                      :creator_id (mt/user->id :crowberto)
                                                      :parameters [{:name "Name", :slug "name", :id "a" :type :string/contains}]}
               :model/Card {card-id :id} {:database_id   (mt/id)
                                          :query_type    :native
                                          :name          "test question"
                                          :creator_id    (mt/user->id :crowberto)
                                          :dataset_query {:type     :native
                                                          :native   {:query "SELECT COUNT(*) FROM people WHERE {{name}}"
                                                                     :template-tags
                                                                     {"name" {:name         "Name"
                                                                              :display-name "name"
                                                                              :id           "_name_"
                                                                              :type         :dimension
                                                                              :dimension    [:field (mt/id :people :name) nil]
                                                                              :widget-type  :string/contains}}}
                                                          :database (mt/id)}}
               :model/DashboardCard {dashcard-a-id :id} {:parameter_mappings [{:parameter_id "a", :card_id card-id, :target [:dimension [:template-tag "id"]]}]
                                                         :card_id            card-id
                                                         :dashboard_id       dashboard-a-id}
               :model/DashboardCard {dashcard-b-id :id} {:parameter_mappings [{:parameter_id "a", :card_id card-id, :target [:dimension [:template-tag "id"]]}]
                                                         :card_id            card-id
                                                         :dashboard_id       dashboard-b-id}]
              (testing "User's set parameter is not saved when saving is disabled"
                ;; api request mimicking a user setting a parameter value
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-a-id dashcard-a-id card-id)
                                                 {:parameters [{:id "a" :value ["initial value"]}]})))
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-b-id dashcard-b-id card-id)
                                                 {:parameters [{:id "a" :value ["initial value"]}]})))
                (is (some? (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query" dashboard-a-id dashcard-a-id card-id)
                                                 {:parameters [{:id "a" :value ["new value"]}]})))
                (is (= {:dashboard-a nil
                        :dashboard-b nil}
                       {:dashboard-a (:last_used_param_values (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-a-id)))
                        :dashboard-b (:last_used_param_values (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-b-id)))}))))))))))

(deftest fetch-dashboard-test
  (testing "GET /api/dashboard/:id"
    (testing "fetch a dashboard WITH a dashboard card on it"
      (mt/with-temp [:model/Dashboard           {dashboard-id :id
                                                 :as          dashboard}    {:name "Test Dashboard"}
                     :model/Card                {card-id :id
                                                 :as     card}         {:name "Dashboard Test Card"}
                     :model/DashboardTab {dashtab-id :id}   {:name "Test Dashboard Tab" :position 0 :dashboard_id dashboard-id}
                     :model/DashboardCard       dashcard           {:dashboard_id dashboard-id :card_id card-id :dashboard_tab_id dashtab-id}
                     :model/User                {user-id :id}      {:first_name "Test" :last_name "User"
                                                                    :email      "test@example.com"}
                     :model/Revision            _                  {:user_id  user-id
                                                                    :model    "Dashboard"
                                                                    :model_id dashboard-id
                                                                    :object   (revision/serialize-instance dashboard
                                                                                                           dashboard-id
                                                                                                           dashboard)}]
        (with-dashboards-in-readable-collection! [dashboard-id]
          (api.card-test/with-cards-in-readable-collection! [card-id]
            (is (=? {:name                       "Test Dashboard"
                     :creator_id                 (mt/user->id :rasta)
                     :collection                 true
                     :collection_id              true
                     :collection_authority_level nil
                     :can_write                  false
                     :param_fields               {}
                     :last-edit-info             {:timestamp true :id true :first_name "Test" :last_name "User" :email "test@example.com"}
                     :tabs                       [{:name "Test Dashboard Tab" :position 0 :id dashtab-id :dashboard_id dashboard-id}]
                     :dashcards                  [{:size_x                     4
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
                                                                                       :can_write              false ;; hydrate :can_write for issue #35077
                                                                                       :collection_id          true
                                                                                       :display                "table"
                                                                                       :entity_id              (:entity_id card)
                                                                                       :visualization_settings {}
                                                                                       :result_metadata        nil})
                                                   :series                     []}]}
                    (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))))))))))

(deftest fetch-dashboard-test-2
  (testing "GET /api/dashboard/:id"
    (testing "a dashboard that has link cards on it"
      (let [link-card-info-from-resp
            (fn [resp]
              (->> resp
                   :dashcards
                   (map (fn [dashcard] (or (get-in dashcard [:visualization_settings :link :entity])
                                           ;; get for link card
                                           (get-in dashcard [:visualization_settings :link]))))))]
        (mt/with-temp
          [:model/Dashboard dashboard {:name "Test Dashboard"}]
          (dashboard-subscription-test/with-link-card-fixture-for-dashboard dashboard [{:keys [collection-id
                                                                                               database-id
                                                                                               table-id
                                                                                               dashboard-id
                                                                                               card-id
                                                                                               model-id]}]
            (is (= [{:id collection-id :model "collection" :name "Linked collection name"  :description "Linked collection desc"  :display nil
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
              (mt/with-no-data-perms-for-all-users!
                (is (= #{{:restricted true} {:url "https://metabase.com"}}
                       (set (link-card-info-from-resp
                             (mt/user-http-request :lucky :get 200 (format "dashboard/%d" (:id dashboard)))))))))))))))

(deftest fetch-dashboard-test-3
  (testing "GET /api/dashboard/:id"
    (testing "fetch a dashboard with a param in it"
      (mt/with-temp [:model/Table         {table-id :id} {}
                     :model/Field         {field-id :id display-name :display_name} {:table_id table-id}

                     :model/Dashboard     {dashboard-id :id} {:name "Test Dashboard"}
                     :model/Card          {card-id :id
                                           :as     card}     {:name "Dashboard Test Card"}
                     :model/DashboardCard dashcard           {:dashboard_id       dashboard-id
                                                              :card_id            card-id
                                                              :parameter_mappings [{:card_id      1
                                                                                    :parameter_id "foo"
                                                                                    :target       [:dimension [:field field-id nil]]}]}]
        (with-dashboards-in-readable-collection! [dashboard-id]
          (api.card-test/with-cards-in-readable-collection! [card-id]
            (is (=? {:name                       "Test Dashboard"
                     :creator_id                 (mt/user->id :rasta)
                     :collection_id              true
                     :collection_authority_level nil
                     :can_write                  false
                     :param_fields               {:foo [{:id               field-id
                                                         :table_id         table-id
                                                         :display_name     display-name
                                                         :base_type        "type/Text"
                                                         :semantic_type    nil
                                                         :has_field_values "search"
                                                         :name_field       nil
                                                         :dimensions       []}]}
                     :tabs                       []
                     :dashcards                  [{:size_x                     4
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
                                                   :series                     []}]}
                    (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))))))))))

(deftest fetch-dashboard-test-4
  (testing "GET /api/dashboard/:id"
    (testing "fetch a dashboard from an official collection includes the collection type"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {:name "Test Dashboard"}
                     :model/Card          {card-id :id}      {:name "Dashboard Test Card"}
                     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
        (with-dashboards-in-readable-collection! [dashboard-id]
          (api.card-test/with-cards-in-readable-collection! [card-id]
            (is (nil?
                 (-> (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))
                     :collection_authority_level)))
            (let [collection-id (:collection_id (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))]
              (t2/update! :model/Collection collection-id {:authority_level "official"}))
            (is (= "official"
                   (-> (dashboard-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id)))
                       :collection_authority_level)))))))))

(deftest fetch-dashboard-permissions-test
  (testing "GET /api/dashboard/:id"
    (testing "Fetch Dashboard with a series, should fail if the User doesn't have access to the Collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection          {coll-id :id}      {:name "Collection 1"}
                       :model/Dashboard           {dashboard-id :id} {:name       "Test Dashboard"
                                                                      :creator_id (mt/user->id :crowberto)}
                       :model/Card                {card-id :id}      {:name          "Dashboard Test Card"
                                                                      :collection_id coll-id}
                       :model/Card                {card-id2 :id}     {:name          "Dashboard Test Card 2"
                                                                      :collection_id coll-id}
                       :model/DashboardCard       {dbc_id :id}       {:dashboard_id dashboard-id, :card_id card-id}
                       :model/DashboardCardSeries _                  {:dashboardcard_id dbc_id, :card_id card-id2
                                                                      :position         0}]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "dashboard/%d" dashboard-id)))))))))

(deftest fetch-dashboard-in-personal-collection-test
  (testing "GET /api/dashboard/:id"
    (let [crowberto-personal-coll (t2/select-one :model/Collection :personal_owner_id (mt/user->id :crowberto))]
      (mt/with-temp
        [:model/Dashboard {dash-id :id} {:collection_id (:id crowberto-personal-coll)}]
        (is (= (assoc crowberto-personal-coll :is_personal true :effective_location "/")
               (:collection (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" dash-id)))))))))

(deftest dashboard-entity-id-test
  (testing "Dashboard endpoints accept entity IDs"
    (mt/with-temp [:model/Dashboard {dashboard-id :id dashboard-entity-id :entity_id}
                   {:name "Test Dashboard"}]
      (with-dashboards-in-readable-collection! [dashboard-id]

        (testing "GET /api/dashboard/:id works with entity ID"
          (is (=? {:name "Test Dashboard"}
                  (dashboard-response (mt/user-http-request :rasta :get 200 (str "dashboard/" dashboard-entity-id))))))

        (testing "GET /api/dashboard/:id/query_metadata works with entity ID"
          (is (map? (mt/user-http-request :rasta :get 200
                                          (str "dashboard/" dashboard-entity-id "/query_metadata")))))))))

(deftest ^:parallel fetch-a-dashboard-with-param-linked-to-a-field-filter-that-is-not-existed
  (testing "when fetching a dashboard that has a param linked to a field filter that no longer exists, we shouldn't throw an error (#15494)"
    (mt/with-temp
      [:model/Card          {card-id :id} {:name "Native card"
                                           :database_id   (mt/id)
                                           :dataset_query (mt/native-query
                                                            {:query "SELECT category FROM products LIMIT 10;"})
                                           :type          :model}
       :model/Dashboard     {dash-id :id} {:parameters [{:name      "Text"
                                                         :slug      "text"
                                                         :id        "_TEXT_"
                                                         :type      :string/=
                                                         :sectionId "string"}]}
       :model/DashboardCard {}            {:dashboard_id       dash-id
                                           :card_id            card-id
                                           :parameter_mappings [{:parameter_id "_TEXT_"
                                                                 :card_id      card-id
                                                                 :target       [:dimension [:template-tag "not-existed-filter"]]}]}]
      (mt/with-log-messages-for-level [messages [metabase.parameters.params :error]]
        (is (some? (mt/user-http-request :rasta :get 200 (str "dashboard/" dash-id))))
        (is (=? [{:level   :error
                  :message "Could not find matching field clause for target: [:dimension [:template-tag not-existed-filter]]"}]
                (messages)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             PUT /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-test
  (testing "PUT /api/dashboard/:id"
    (mt/test-helpers-set-global-values!
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}]
          (with-dashboards-in-writeable-collection! [dashboard-id]
            (testing "GET before update"
              (is (=? {:name          "Test Dashboard"
                       :creator_id    (mt/user->id :rasta)
                       :collection    false
                       :collection_id true}
                      (dashboard-response (t2/select-one :model/Dashboard :id dashboard-id)))))

            (testing "PUT response"
              (let [put-response (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                                       {:name        "My Cool Dashboard"
                                                        :description "Some awesome description"
                                                        :cache_ttl   1234
                                                        ;; these things should fail to update
                                                        :creator_id  (mt/user->id :trashbird)})
                    get-response (mt/user-http-request :rasta :get 200 (format "dashboard/%d" dashboard-id))]
                (is (=? {:name           "My Cool Dashboard"
                         :dashcards      []
                         :tabs           []
                         :description    "Some awesome description"
                         :creator_id     (mt/user->id :rasta)
                         :cache_ttl      1234
                         :last-edit-info {:timestamp true :id true :first_name "Rasta"
                                          :last_name "Toucan" :email "rasta@metabase.com"}
                         :collection     true
                         :collection_id  true}
                        (dashboard-response put-response)))
                (testing "A PUT should return the updated value so a follow-on GET is not needed (#34828)"
                  (is (= (update put-response :last-edit-info dissoc :timestamp)
                         (update get-response :last-edit-info dissoc :timestamp))))))

            (testing "GET after update"
              (is (=? {:name          "My Cool Dashboard"
                       :description   "Some awesome description"
                       :cache_ttl     1234
                       :creator_id    (mt/user->id :rasta)
                       :collection    false
                       :collection_id true
                       :view_count    1}
                      (dashboard-response (t2/select-one :model/Dashboard :id dashboard-id)))))

            (testing "No-op PUT: Do not return 500"
              (mt/with-temp [:model/Card {card-id :id} {}
                             :model/DashboardCard dashcard {:card_id card-id, :dashboard_id dashboard-id}]
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
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name               "Test Dashboard"
                                                                :auto_apply_filters enabled?}]
              (testing "Can set it"
                (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                      {:auto_apply_filters (not enabled?)})
                (is (= (not enabled?)
                       (t2/select-one-fn :auto_apply_filters :model/Dashboard :id dashboard-id))))
              (testing "If not in put it is not changed"
                (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                      {:description "foo"})
                (is (= (not enabled?)
                       (t2/select-one-fn :auto_apply_filters :model/Dashboard :id dashboard-id)))))))))))

(deftest update-dashboard-guide-columns-test
  (testing "PUT /api/dashboard/:id"
    (testing "allow `:caveats` and `:points_of_interest` to be empty strings, and `:show_in_getting_started` should be a boolean"
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}]
        (with-dashboards-in-writeable-collection! [dashboard-id]
          (is (=? {:name                    "Test Dashboard"
                   :creator_id              (mt/user->id :rasta)
                   :collection              true
                   :collection_id           true
                   :dashcards               []
                   :tabs                    []
                   :caveats                 ""
                   :points_of_interest      ""
                   :cache_ttl               1337
                   :last-edit-info
                   {:timestamp true, :id true, :first_name "Rasta"
                    :last_name "Toucan", :email "rasta@metabase.com"}
                   :show_in_getting_started true}
                  (dashboard-response (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                                            {:caveats                 ""
                                                             :points_of_interest      ""
                                                             :cache_ttl               1337
                                                             :show_in_getting_started true})))))))))

(deftest update-dashboard-clear-description-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we clear the description of a Dashboard? (#4738)"
      (mt/with-temp [:model/Dashboard dashboard {:description "What a nice Dashboard"}]
        (with-dashboards-in-writeable-collection! [dashboard]
          (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard)) {:description nil})
          (is (= nil
                 (t2/select-one-fn :description :model/Dashboard :id (u/the-id dashboard))))

          (testing "Set to a blank description"
            (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard)) {:description ""})
            (is (= ""
                   (t2/select-one-fn :description :model/Dashboard :id (u/the-id dashboard))))))))))

(deftest update-dashboard-change-collection-id-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we change the Collection a Dashboard is in (assuming we have the permissions to do so)?"
      (dashboard-test/with-dash-in-collection! [_db collection dash]
        (mt/with-temp [:model/Collection new-collection]
          ;; grant Permissions for both new and old collections
          (doseq [coll [collection new-collection]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
          ;; now make an API call to move collections
          (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dash)) {:collection_id (u/the-id new-collection)})
          ;; Check to make sure the ID has changed in the DB
          (is (= (t2/select-one-fn :collection_id :model/Dashboard :id (u/the-id dash))
                 (u/the-id new-collection))))))))

(deftest update-dashboard-change-collection-id-test-2
  (testing "PUT /api/dashboard/:id"
    (testing "if we don't have the Permissions for the old collection, we should get an Exception"
      (mt/with-non-admin-groups-no-root-collection-perms
        (dashboard-test/with-dash-in-collection! [_db _collection dash]
          (mt/with-temp [:model/Collection new-collection]
            ;; grant Permissions for only the *new* collection
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
            ;; now make an API call to move collections. Should fail
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dash))
                                         {:collection_id (u/the-id new-collection)})))))))))

(deftest update-dashboard-change-collection-id-test-3
  (testing "PUT /api/dashboard/:id"
    (testing "if we don't have the Permissions for the new collection, we should get an Exception"
      (mt/with-non-admin-groups-no-root-collection-perms
        (dashboard-test/with-dash-in-collection! [_db collection dash]
          (mt/with-temp [:model/Collection new-collection]
            ;; grant Permissions for only the *old* collection
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            ;; now make an API call to move collections. Should fail
            (is (=? {:message "You do not have curate permissions for this Collection."}
                    (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dash))
                                          {:collection_id (u/the-id new-collection)})))))))))

(deftest update-dashboard-width-setting-test
  (testing "PUT /api/dashboard/:id"
    (testing "We can change the dashboard's width between 'fixed' and 'full' settings."
      (mt/with-temp [:model/Dashboard dashboard {}]
        (with-dashboards-in-writeable-collection! [dashboard]
          (testing "the default dashboard width value is 'fixed'."
            (is (= "fixed"
                   (t2/select-one-fn :width :model/Dashboard :id (u/the-id dashboard)))))

          (testing "changing the width setting to 'full' works."
            (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard)) {:width "full"})
            (is (= "full"
                   (t2/select-one-fn :width :model/Dashboard :id (u/the-id dashboard)))))

          (testing "values that are not 'fixed' or 'full' error."
            (is (=? {:specific-errors {:width ["should be either \"fixed\" or \"full\", received: 1200"]}
                     :errors          {:width "enum of fixed, full"}}
                    (mt/user-http-request :rasta :put 400 (str "dashboard/" (u/the-id dashboard)) {:width 1200})))))))))

(deftest update-dashboard-add-time-granularity-param
  (testing "PUT /api/dashboard/:id"
    (testing "We can add a time granularity parameter to a dashboard"
      (mt/with-temp [:model/Dashboard dashboard {}]
        (with-dashboards-in-writeable-collection! [dashboard]
          (testing "the dashboard starts with no parameters."
            (is (= []
                   (t2/select-one-fn :parameters :model/Dashboard :id (u/the-id dashboard)))))

          (testing "adding a new time granularity parameter works."
            (let [params [{:name      "Time Unit"
                           :slug      "time_unit"
                           :id        "927e929"
                           :type      :temporal-unit
                           :sectionId "temporal-unit"
                           :temporal_units [:week :month]}]]
              (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard)) {:parameters params})
              (is (= params
                     (t2/select-one-fn :parameters :model/Dashboard :id (u/the-id dashboard))))))

          (testing "Update dashboard with parameters works (#50371)"
            (let [put-response (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                                     {:archived :true})]
              (is (=? {:archived true
                       :parameters
                       [{:name      "Time Unit"
                         :slug      "time_unit"
                         :id        "927e929"
                         :type      "temporal-unit"
                         :sectionId "temporal-unit"
                         :temporal_units ["week" "month"]}]}
                      put-response)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    UPDATING DASHBOARD CARD IN DASHCARD                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashcard-reference-in-dashboard-test
  (testing "PUT /api/dashboard/:id"
    (testing "Let creators swap out dashboard questions with a different question (#36497)"
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                     :model/Card {card-id        :id
                                  card-entity-id :entity_id} {:name "Original Card"}
                     :model/DashboardCard {dashcard-entity-id :entity_id
                                           :as                dashcard} {:dashboard_id dashboard-id
                                                                         :card_id      card-id}]
        (let [{original-dashcard-entity-id          :entity_id
               {original-card-entity-id :entity_id} :card} (-> (mt/user-http-request :rasta :get 200 (str "dashboard/" dashboard-id))
                                                               dashboard-response
                                                               (get-in [:dashcards 0]))]
          (testing "Check that the before state is as expected -- it looks just like our fixture data"
            (testing "Before the update the dashcard is the same as the one we started with"
              (is (= dashcard-entity-id original-dashcard-entity-id)))
            (testing "Before the update, the card on the dashcard is the "
              (is (= card-entity-id original-card-entity-id))))
          (mt/with-temp [:model/Card {new-card-id            :id
                                      swapped-card-entity-id :entity_id} {:name "Swapped Card"}]
            ;; Update the card_id.
            (let [updated-card-payload {:dashcards [(assoc
                                                     (select-keys dashcard [:id :entity_id :size_x :size_y :row :col])
                                                     :card_id new-card-id)]}
                  {updated-dashcard-entity-id          :entity_id
                   {updated-card-entity-id :entity_id} :card} (-> (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                                                                        updated-card-payload)
                                                                  dashboard-response
                                                                  (get-in [:dashcards 0]))]
              (testing "After the update the dashcard is the same as the one we started with"
                (is (= dashcard-entity-id updated-dashcard-entity-id)))
              (testing "After the update, the card on the dashcard is updated to our newly swapped card"
                (is (= swapped-card-entity-id updated-card-entity-id))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    UPDATING DASHBOARD COLLECTION POSITIONS                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-change-collection-position-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we change the Collection position of a Dashboard?"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/Dashboard  dashboard {:collection_id (u/the-id collection)}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                {:collection_position 1})
          (is (= 1
                 (t2/select-one-fn :collection_position :model/Dashboard :id (u/the-id dashboard))))

          (testing "...and unset (unpin) it as well?"
            (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                  {:collection_position nil})
            (is (= nil
                   (t2/select-one-fn :collection_position :model/Dashboard :id (u/the-id dashboard))))))

        (testing "we shouldn't be able to if we don't have permissions for the Collection"
          (mt/with-temp [:model/Collection collection {}
                         :model/Dashboard  dashboard {:collection_id (u/the-id collection)}]
            (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dashboard))
                                  {:collection_position 1})
            (is (= nil
                   (t2/select-one-fn :collection_position :model/Dashboard :id (u/the-id dashboard)))))

          (mt/with-temp [:model/Collection collection {}
                         :model/Dashboard  dashboard {:collection_id (u/the-id collection), :collection_position 1}]
            (mt/user-http-request :rasta :put 403 (str "dashboard/" (u/the-id dashboard))
                                  {:collection_position nil})
            (is (= 1
                   (t2/select-one-fn :collection_position :model/Dashboard :id (u/the-id dashboard))))))))))

(deftest update-dashboard-position-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (letfn [(move-dashboard! [dashboard new-position]
                (mt/user-http-request :rasta :put 200 (str "dashboard/" (u/the-id dashboard))
                                      {:collection_position new-position}))
              (items []
                (api.card-test/get-name->collection-position :rasta collection))]
        (testing "Check that we can update a dashboard's position in a collection of only dashboards"
          (api.card-test/with-ordered-items collection [:model/Dashboard a
                                                        :model/Dashboard b
                                                        :model/Dashboard c
                                                        :model/Dashboard d]
            (move-dashboard! b 4)
            (is (= {"a" 1, "c" 2, "d" 3, "b" 4}
                   (items)))))

        (testing "Check that updating a dashboard at position 3 to position 1 will increment the positions before 3, not after"
          (api.card-test/with-ordered-items collection [:model/Card      a
                                                        :model/Pulse     b
                                                        :model/Dashboard c
                                                        :model/Dashboard d]
            (move-dashboard! c 1)
            (is (= {"c" 1, "a" 2, "b" 3, "d" 4}
                   (items)))))

        (testing "Check that updating position 1 to 3 will cause b and c to be decremented"
          (api.card-test/with-ordered-items collection [:model/Dashboard a
                                                        :model/Card      b
                                                        :model/Pulse     c
                                                        :model/Dashboard d]
            (move-dashboard! a 3)
            (is (= {"b" 1, "c" 2, "a" 3, "d" 4}
                   (items)))))

        (testing "Check that updating position 1 to 4 will cause a through c to be decremented"
          (api.card-test/with-ordered-items collection [:model/Dashboard a
                                                        :model/Card      b
                                                        :model/Pulse     c
                                                        :model/Pulse     d]
            (move-dashboard! a 4)
            (is (= {"b" 1, "c" 2, "d" 3, "a" 4}
                   (items)))))

        (testing "Check that updating position 4 to 1 will cause a through c to be incremented"
          (api.card-test/with-ordered-items collection [:model/Card      a
                                                        :model/Pulse     b
                                                        :model/Card      c
                                                        :model/Dashboard d]
            (move-dashboard! d 1)
            (is (= {"d" 1, "a" 2, "b" 3, "c" 4}
                   (items)))))))))

(deftest move-dashboard-to-different-collection-test
  (testing "Check that moving a dashboard to another collection will fixup both collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection-1 {}
                     :model/Collection collection-2 {}]
        (api.card-test/with-ordered-items collection-1 [:model/Dashboard a
                                                        :model/Card      b
                                                        :model/Card      c
                                                        :model/Pulse     d]
          (api.card-test/with-ordered-items collection-2 [:model/Pulse     e
                                                          :model/Pulse     f
                                                          :model/Dashboard g
                                                          :model/Card      h]
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
        (mt/with-temp [:model/Collection collection]
          (mt/with-model-cleanup [:model/Dashboard]
            (api.card-test/with-ordered-items collection [:model/Card  a
                                                          :model/Pulse b
                                                          :model/Card  d]
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (is (= {"a" 1
                      "b" 2
                      "d" 3}
                     (api.card-test/get-name->collection-position :rasta collection)))
              (mt/user-http-request :rasta :post 200 "dashboard" {:name                "c"
                                                                  :collection_id       (u/the-id collection)
                                                                  :collection_position 3})
              (is (= {"a" 1
                      "b" 2
                      "c" 3
                      "d" 4}
                     (api.card-test/get-name->collection-position :rasta collection))))))))))

(deftest insert-dashboard-no-position-test
  (testing "POST /api/dashboard"
    (testing "Check that adding a new Dashboard without a position, leaves the existing positions unchanged"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection]
          (api.card-test/with-ordered-items collection [:model/Dashboard a
                                                        :model/Card      b
                                                        :model/Pulse     d]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (is (= {"a" 1
                    "b" 2
                    "d" 3}
                   (api.card-test/get-name->collection-position :rasta collection)))
            (mt/with-model-cleanup [:model/Dashboard]
              (mt/user-http-request :rasta :post 200 "dashboard" {:name          "c"
                                                                  :collection_id (u/the-id collection)})
              (is (= {"a" 1
                      "b" 2
                      "c" nil
                      "d" 3}
                     (api.card-test/get-name->collection-position :rasta collection))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           DELETE /api/dashboard/:id                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id}]
    (with-dashboards-in-writeable-collection! [dashboard-id]
      (is (= nil
             (mt/user-http-request :rasta :delete 204 (format "dashboard/%d" dashboard-id))))
      (is (= nil
             (t2/select-one :model/Dashboard :id dashboard-id))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/copy                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest copy-dashboard-test
  (mt/with-model-cleanup [:model/Dashboard]
    (testing "POST /api/dashboard/:id/copy"
      (testing "A plain copy with nothing special"
        (mt/with-temp [:model/Dashboard dashboard {:name        "Test Dashboard"
                                                   :description "A description"
                                                   :width       "full"
                                                   :creator_id  (mt/user->id :rasta)}]
          (let [response (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" (:id dashboard)))]
            (is (=? {:name          "Test Dashboard"
                     :description   "A description"
                     :width         "full"
                     :creator_id    (mt/user->id :rasta)
                     :collection    false
                     :collection_id false}
                    (dashboard-response response)))
            (is (some? (:entity_id response)))
            (is (not=  (:entity_id dashboard) (:entity_id response))
                "The copy should have a new entity ID generated")))))))

(deftest copy-dashboard-with-dashboard-questions
  (testing "`is_deep_copy=true` works for dashboards regardless of whether they have dashboard questions"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:collection_id coll-id
                                              :dashboard_id dash-id
                                              :database_id (mt/id)
                                              :dataset_query (mt/$ids
                                                               {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table $$orders
                                                                           :aggregation  [[:avg $orders.total]]
                                                                           :breakout     [!month.orders.created_at]}})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id card-id}]
      (let [response (mt/user-http-request :rasta :post 200
                                           (format "dashboard/%d/copy" dash-id)
                                           {:is_deep_copy true})]
        (is (some? (:id response)))
        (is (not= dash-id (:id response)))
        (let [copied-cards (t2/select :model/Card :dashboard_id (:id response))]
          (is (= 1 (count copied-cards)))
          (is (not= card-id (:id (first copied-cards))))))))
  (testing "`is_deep_copy=false` errors for dashboards containing dashboard questions"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:collection_id coll-id
                                              :dashboard_id dash-id}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id card-id}]
      (is (= "You cannot do a shallow copy of this dashboard because it contains Dashboard Questions."
             (mt/user-http-request :rasta :post 400
                                   (format "dashboard/%d/copy" dash-id)
                                   {:is_deep_copy false})))))
  (testing "`is_deep_copy=false` works for a dashboard without any dashboard questions"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id card-id}]
      (let [response (mt/user-http-request :rasta :post 200
                                           (format "dashboard/%d/copy" dash-id)
                                           {:is_deep_copy false})]
        (is (some? (:id response)))
        (is (not= dash-id (:id response)))
        (is (zero? (t2/count :model/Card :dashboard_id (:id response)))))))
  (testing "`is_deep_copy=false` works for a dashboard with archived dashboard questions"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:collection_id coll-id
                                              :dashboard_id dash-id
                                              :database_id (mt/id)
                                              :archived true
                                              :dataset_query (mt/$ids
                                                               {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table $$orders
                                                                           :aggregation  [[:avg $orders.total]]
                                                                           :breakout     [!month.orders.created_at]}})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id card-id}]
      (let [response (mt/user-http-request :rasta :post 200
                                           (format "dashboard/%d/copy" dash-id)
                                           {:is_deep_copy false})]
        (is (some? (:id response)))
        (is (not= dash-id (:id response)))
        ;; Verify no cards were copied
        (is (zero? (t2/count :model/Card :dashboard_id (:id response))))
        (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id response))))))))

(deftest copy-dashboard-test-2
  (mt/with-model-cleanup [:model/Dashboard]
    (testing "POST /api/dashboard/:id/copy"
      (testing "Ensure name / description / user set when copying"
        (mt/with-temp [:model/Dashboard dashboard  {:name        "Test Dashboard"
                                                    :description "An old description"}]
          (let [response (mt/user-http-request :crowberto :post 200 (format "dashboard/%d/copy" (:id dashboard))
                                               {:name        "Test Dashboard - Duplicate"
                                                :description "A new description"})]
            (is (=? {:name          "Test Dashboard - Duplicate"
                     :description   "A new description"
                     :creator_id    (mt/user->id :crowberto)
                     :collection_id false
                     :collection    false}
                    (dashboard-response response)))
            (is (some? (:entity_id response)))
            (is (not= (:entity_id dashboard) (:entity_id response))
                "The copy should have a new entity ID generated")))))))

(deftest copy-dashboard-test-3
  (testing "Deep copy: POST /api/dashboard/:id/copy"
    (mt/dataset test-data
      (mt/with-temp
        [:model/Collection source-coll {:name "Source collection"}
         :model/Collection dest-coll   {:name "Destination collection"}
         :model/Dashboard  dashboard {:name          "Dashboard to be Copied"
                                      :description   "A description"
                                      :collection_id (u/the-id source-coll)
                                      :creator_id    (mt/user->id :rasta)}
         :model/Card       total-card  {:name "Total orders per month"
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
                                                      :breakout     [!month.orders.created_at]}})}
         :model/Card      avg-card  {:name "Average orders per month"
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
                                                   :breakout     [!month.orders.created_at]}})}
         :model/Card          model {:name "A model"
                                     :collection_id (u/the-id source-coll)
                                     :type :model
                                     :dataset_query
                                     (mt/$ids
                                       {:database (mt/id)
                                        :type :query
                                        :query {:source-table $$orders
                                                :limit 4}})}
         :model/DashboardCard dashcard {:dashboard_id (u/the-id dashboard)
                                        :card_id    (u/the-id total-card)
                                        :size_x 6, :size_y 6}
         :model/DashboardCard _textcard {:dashboard_id (u/the-id dashboard)
                                         :visualization_settings
                                         {:virtual_card
                                          {:display :text}
                                          :text "here is some text"}}
         :model/DashboardCard _        {:dashboard_id (u/the-id dashboard)
                                        :card_id    (u/the-id model)
                                        :size_x 6, :size_y 6}
         :model/DashboardCardSeries _ {:dashboardcard_id (u/the-id dashcard)
                                       :card_id (u/the-id avg-card)
                                       :position 0}]
        (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/DashboardCardSeries]
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
                (is (every? #(= (:type %) :question) copied-cards)
                    "Copied a model")))))))))

(deftest copy-dashboard-test-4
  (testing "Deep copy: POST /api/dashboard/:id/copy"
    (mt/dataset test-data
      (testing "When there are cards the user lacks write perms for"
        (mt/with-temp [:model/Collection source-coll {:name "Source collection"}
                       :model/Collection no-read-coll {:name "Crowberto lacks write coll"}
                       :model/Collection dest-coll   {:name "Destination collection"}
                       :model/Dashboard  dashboard {:name          "Dashboard to be Copied"
                                                    :description   "A description"
                                                    :collection_id (u/the-id source-coll)
                                                    :creator_id    (mt/user->id :rasta)}
                       :model/Card       total-card  {:name "Total orders per month"
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
                                                                    :breakout     [!month.orders.created_at]}})}
                       :model/Card      avg-card  {:name "Average orders per month"
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
                                                                 :breakout     [!month.orders.created_at]}})}
                       :model/Card          card {:name "A card"
                                                  :collection_id (u/the-id source-coll)
                                                  :dataset_query
                                                  (mt/$ids
                                                    {:database (mt/id)
                                                     :type :query
                                                     :query {:source-table $$orders
                                                             :limit 4}})}
                       :model/DashboardCard dashcard {:dashboard_id (u/the-id dashboard)
                                                      :card_id    (u/the-id total-card)
                                                      :size_x 6, :size_y 6}
                       :model/DashboardCard _        {:dashboard_id (u/the-id dashboard)
                                                      :card_id    (u/the-id card)
                                                      :size_x 6, :size_y 6}
                       :model/DashboardCardSeries _ {:dashboardcard_id (u/the-id dashcard)
                                                     :card_id (u/the-id avg-card)
                                                     :position 0}]
          (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/DashboardCardSeries]
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
                  (is (empty? (t2/select :model/DashboardCardSeries :card_id [:in (map :id copied-cards)]))))
                (testing "Response includes uncopied cards"
                  ;; cards might be full cards or just a map {:id 1} due to permissions Any card with lack of
                  ;; permissions is just {:id 1}. Cards in a series which you have permissions for, but the base card
                  ;; you lack permissions for are also not copied, but you can see the whole card.
                  (is (= 2 (->> resp :uncopied count))))))))))))

(deftest copy-dashboard-test-5
  (testing "Deep copy: POST /api/dashboard/:id/copy"
    (mt/dataset test-data
      (testing "When source and destination are the same"
        (mt/with-temp [:model/Collection source-coll {:name "Source collection"}
                       :model/Dashboard  dashboard {:name          "Dashboard to be Copied"
                                                    :description   "A description"
                                                    :collection_id (u/the-id source-coll)
                                                    :creator_id    (mt/user->id :rasta)}
                       :model/Card       total-card  {:name "Total orders per month"
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
                                                                    :breakout     [!month.orders.created_at]}})}
                       :model/Card      avg-card  {:name "Average orders per month"
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
                                                                 :breakout     [!month.orders.created_at]}})}
                       :model/Card          card {:name "A card"
                                                  :collection_id (u/the-id source-coll)
                                                  :dataset_query
                                                  (mt/$ids
                                                    {:database (mt/id)
                                                     :type :query
                                                     :query {:source-table $$orders
                                                             :limit 4}})}
                       :model/DashboardCard dashcard {:dashboard_id (u/the-id dashboard)
                                                      :card_id    (u/the-id total-card)
                                                      :size_x 6, :size_y 6}
                       :model/DashboardCard _        {:dashboard_id (u/the-id dashboard)
                                                      :card_id    (u/the-id card)
                                                      :size_x 6, :size_y 6}
                       :model/DashboardCardSeries _ {:dashboardcard_id (u/the-id dashcard)
                                                     :card_id (u/the-id avg-card)
                                                     :position 0}]
          (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/DashboardCardSeries]
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

(defn- dashcards-by-position
  "Returns dashcards for a dashboard ordered by their position instead of creation like [[dashboard/dashcards]] does."
  [dashboard-or-id]
  (let [dashboard (t2/hydrate (if (map? dashboard-or-id)
                                dashboard-or-id
                                (t2/select-one :model/Dashboard dashboard-or-id))
                              :dashcards)]
    (sort dashboard-card/dashcard-comparator (:dashcards dashboard))))

(deftest copy-dashboard-with-tab-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "for a dashboard that has tabs"
      (with-simple-dashboard-with-tabs [{:keys [dashboard-id]}]
        (mt/with-model-cleanup [:model/Dashboard]
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
                          (dashcards-by-position dashboard-id))
                     (map #(select-keys % [:dashboard_tab_id :card_id :row :col :size_x :size_y :dashboard_tab_id])
                          (for [card (dashcards-by-position new-dash-id)]
                            (assoc card :dashboard_tab_id (new->old-tab-id (:dashboard_tab_id card))))))))
            (testing "new tabs should have the same name and position"
              (is (= (map #(dissoc % :id) original-tabs)
                     (map #(dissoc % :id) new-tabs))))))))))

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
    (let [dashcards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                     {:card_id 3 :card (card-model {:id 3})}
                     ;; this guy does not even reach the discard pile
                     {:action_id 123}]]
      (binding [*readable-card-ids* #{1 2 3}]
        (is (= {:copy {1 {:id 1} 2 {:id 2} 3 {:id 3}}
                :reference {}
                :discard []}
               (#'api.dashboard/cards-to-copy true dashcards))))))
  (testing "Identifies cards which cannot be copied"
    (testing "If they are in a series"
      (let [dashcards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                       {:card_id 3 :card (card-model {:id 3})}]]
        (binding [*readable-card-ids* #{1 3}]
          (is (= {:copy {1 {:id 1} 3 {:id 3}}
                  :reference {}
                  :discard [{:id 2}]}
                 (#'api.dashboard/cards-to-copy true dashcards))))))
    (testing "When the base of a series lacks permissions"
      (let [dashcards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                       {:card_id 3 :card (card-model {:id 3})}]]
        (binding [*readable-card-ids* #{3}]
          (is (= {:copy {3 {:id 3}}
                  :reference {}
                  :discard [{:id 1} {:id 2}]}
                 (#'api.dashboard/cards-to-copy true dashcards)))))))
  (testing "Identifies cards to be referenced"
    (let [dashcards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                     {:card_id 3 :card (card-model {:id 3})}]]
      (binding [*readable-card-ids* #{1 2 3}]
        (is (= {:reference {1 {:id 1}
                            2 {:id 2}
                            3 {:id 3}}
                :copy {}
                :discard []}
               (#'api.dashboard/cards-to-copy false dashcards))))))
  (testing "Identifies cards that cannot be referenced"
    (let [dashcards [{:card_id 1 :card (card-model {:id 1}) :series [(card-model {:id 2})]}
                     {:card_id 3 :card (card-model {:id 3})}]]
      (binding [*readable-card-ids* #{1 3}]
        (is (= {:reference {1 {:id 1}
                            3 {:id 3}}
                :copy {}
                :discard [{:id 2}]}
               (#'api.dashboard/cards-to-copy false dashcards)))))))

(deftest update-cards-for-copy-test
  (testing "Returns the original dashcards for referenced dashcards"
    (let [dashcards [{:card_id 1 :card {:id 1} :series [{:id 2}]}
                     {:card_id 3 :card {:id 3}}]]
      (is (= dashcards
             (api.dashboard/update-cards-for-copy dashcards
                                                  nil
                                                  {1 {:id 1}
                                                   2 {:id 2}
                                                   3 {:id 3}}
                                                  nil))))
    (testing "with tab-ids updated if dashboard has tab"
      (is (= [{:card_id 1 :card {:id 1} :dashboard_tab_id 10}
              {:card_id 3 :card {:id 3} :dashboard_tab_id 20}]
             (api.dashboard/update-cards-for-copy [{:card_id 1 :card {:id 1} :dashboard_tab_id 1}
                                                   {:card_id 3 :card {:id 3} :dashboard_tab_id 2}]
                                                  nil
                                                  {1 {:id 1}
                                                   2 {:id 2}
                                                   3 {:id 3}}
                                                  {1 10
                                                   2 20})))))
  (testing "When copy style is deep"
    (let [dashcards [{:card_id 1 :card {:id 1} :series [{:id 2} {:id 3}]}]]
      (testing "Can omit series cards"
        (is (= [{:card_id 5 :card {:id 5} :series [{:id 6}]}]
               (api.dashboard/update-cards-for-copy dashcards
                                                    {1 {:id 5}
                                                     2 {:id 6}}
                                                    nil
                                                    nil)))))
    (testing "Can omit whole card with series if not copied"
      (let [dashcards [{:card_id 1 :card {} :series [{:id 2} {:id 3}]}
                       {:card_id 4 :card {} :series [{:id 5} {:id 6}]}]]
        (is (= [{:card_id 7 :card {:id 7} :series [{:id 8} {:id 9}]}]
               (api.dashboard/update-cards-for-copy dashcards
                                                    {1 {:id 7}
                                                     2 {:id 8}
                                                     3 {:id 9}
                                                     ;; not copying id 4 which is the base of the following two
                                                     5 {:id 10}
                                                     6 {:id 11}}
                                                    nil
                                                    nil)))))
    (testing "Updates parameter mappings to new card ids"
      (let [dashcards [{:card_id            1
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
               (api.dashboard/update-cards-for-copy dashcards
                                                    {1 {:id 2}}
                                                    nil
                                                    nil)))))
    (testing "Does not think action cards are text cards"
      (let [dashcards [{:card_id 1 :card {:id 1}}
                       {:visualization_settings {:virtual_card {:display "text"}
                                                 :text         "whatever"}}
                       {:visualization_settings {:virtual_card {:display "heading"}
                                                 :text         "keep me!"}}
                       {:action_id 123}]]
        (is (= (butlast dashcards)
               (api.dashboard/update-cards-for-copy dashcards
                                                    {1 {:id 1}}
                                                    nil
                                                    nil)))))))

(deftest copy-dashboard-cards-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "Ensure dashboard cards and parameters are copied (#23685)"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id}  {:name       "Test Dashboard"
                                                               :parameters [{:name "Category ID"
                                                                             :slug "category_id"
                                                                             :id   "_CATEGORY_ID_"
                                                                             :type :category}
                                                                            {:name "Unit"
                                                                             :slug "unit"
                                                                             :id   "_unit_"
                                                                             :type :temporal-unit}]}
                     :model/Card          {card-id :id} {}
                     :model/Card          {card-id2 :id} {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id       dashboard-id
                                                             :card_id            card-id
                                                             :parameter_mappings [{:parameter_id "random-id"
                                                                                   :card_id      card-id
                                                                                   :target       [:dimension [:field (mt/id :venues :name) nil]]}
                                                                                  {:parameter_id "also-random"
                                                                                   :card_id      card-id
                                                                                   :target       [:dimension [:field (mt/id :orders :created_at) {:temporal-unit "month"}]]}]}
                     :model/DashboardCard _ {:dashboard_id dashboard-id, :card_id card-id2}] {}
        (let [copy-id (u/the-id (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" dashboard-id)))]
          (try
            (is (= 2
                   (count (t2/select-pks-set :model/DashboardCard, :dashboard_id copy-id))))
            (is (=? [{:name "Category ID" :slug "category_id" :id "_CATEGORY_ID_" :type :category}
                     {:name "Unit", :slug "unit", :id "_unit_", :type :temporal-unit}]
                    (t2/select-one-fn :parameters :model/Dashboard :id copy-id)))
            (is (=? [{:parameter_id "random-id"
                      :card_id      card-id
                      :target       [:dimension [:field (mt/id :venues :name) nil]]}
                     {:parameter_id "also-random"
                      :card_id      card-id
                      :target       [:dimension [:field (mt/id :orders :created_at) {:temporal-unit :month}]]}]
                    (t2/select-one-fn :parameter_mappings :model/DashboardCard :id dashcard-id)))
            (finally
              (t2/delete! :model/Dashboard :id copy-id))))))))

(deftest copy-dashboard-into-correct-collection-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "Ensure the correct collection is set when copying"
      (dashboard-test/with-dash-in-collection! [_db collection dash]
        (mt/with-temp [:model/Collection new-collection]
          ;; grant Permissions for both new and old collections
          (doseq [coll [collection new-collection]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
          (let [response (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" (u/the-id dash)) {:collection_id (u/the-id new-collection)})]
            (try
              ;; Check to make sure the ID of the collection is correct
              (is (= (t2/select-one-fn :collection_id :model/Dashboard :id
                                       (u/the-id response))
                     (u/the-id new-collection)))
              (finally
                (t2/delete! :model/Dashboard :id (u/the-id response))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PUT /api/dashboard/:id/cards                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-add-card-parameter-mapping-permissions-fixtures! [f]
  (mt/with-temp-copy-of-db
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:parameters [{:name "Category ID"
                                                                        :slug "category_id"
                                                                        :id   "_CATEGORY_ID_"
                                                                        :type "category"}]}
                     :model/Card      {card-id :id} {:database_id   (mt/id)
                                                     :table_id      (mt/id :venues)
                                                     :dataset_query (mt/mbql-query venues)}]
        (let [mappings [{:parameter_id "_CATEGORY_ID_"
                         :target       [:dimension [:field (mt/id :venues :category_id) nil]]}]]
          ;; TODO -- check series as well?
          (f {:dashboard-id dashboard-id
              :card-id      card-id
              :mappings     mappings
              :add-card!    (fn [expected-status-code]
                              (mt/user-http-request :rasta
                                                    :put expected-status-code (format "dashboard/%d" dashboard-id)
                                                    {:dashcards [{:id                 -1
                                                                  :card_id            card-id
                                                                  :row                0
                                                                  :col                0
                                                                  :size_x             4
                                                                  :size_y             4
                                                                  :parameter_mappings mappings}]
                                                     :tabs      []}))
              :dashcards    (fn [] (t2/select :model/DashboardCard :dashboard_id dashboard-id))}))))))

(defn- dashcard-like-response
  [id]
  (t2/hydrate (t2/select-one :model/DashboardCard :id id) :series))

(defn- current-cards
  "Returns the current ordered cards of a dashboard."
  [dashboard-id]
  (-> (t2/select-one :model/Dashboard dashboard-id)
      (t2/hydrate [:dashcards :series])
      :dashcards))

(defn- tabs
  "Returns the tabs of a dashboard."
  [dashboard-id]
  (-> (t2/select-one :model/Dashboard dashboard-id)
      (t2/hydrate :tabs)
      :tabs))

(defn do-with-update-cards-parameter-mapping-permissions-fixtures! [f]
  (do-with-add-card-parameter-mapping-permissions-fixtures!
   (fn [{:keys [dashboard-id card-id mappings]}]
     (mt/with-temp [:model/DashboardCard dashboard-card {:dashboard_id       dashboard-id
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
                                                             (format "dashboard/%d" dashboard-id)
                                                             {:dashcards [(assoc dashcard-info :parameter_mappings new-mappings)]
                                                              :tabs      []}))
             :update-size!           (fn []
                                       (mt/user-http-request :rasta :put 200
                                                             (format "dashboard/%d" dashboard-id)
                                                             {:dashcards [new-dashcard-info]
                                                              :tabs      []}))}))))))

(deftest e2e-update-dashboard-cards-and-tabs-test
  (testing "PUT /api/dashboard/:id with updating dashboard and create/update/delete of dashcards and tabs in a single req"
    (mt/test-helpers-set-global-values!
      (mt/with-temp
        [:model/Dashboard               {dashboard-id :id}  {}
         :model/Card                    {card-id-1 :id}     {}
         :model/Card                    {card-id-2 :id}     {}
         :model/DashboardTab     {dashtab-id-1 :id}  {:name "Tab 1" :dashboard_id dashboard-id :position 0}
         :model/DashboardTab     {dashtab-id-2 :id}  {:name "Tab 2" :dashboard_id dashboard-id :position 1}
         :model/DashboardTab     {dashtab-id-3 :id}  {:name "Tab 3" :dashboard_id dashboard-id :position 2}
         :model/DashboardCard           {dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id-1, :dashboard_tab_id dashtab-id-1}
         :model/DashboardCard           {dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id-1, :dashboard_tab_id dashtab-id-2}
         :model/DashboardCard           {dashcard-id-3 :id} {:dashboard_id dashboard-id, :card_id card-id-1, :dashboard_tab_id dashtab-id-2}]
        (let [resp (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                                         {:name      "Updated dashboard name"
                                          :tabs      [{:id   dashtab-id-1
                                                       :name "Tab 1 edited"}
                                                      {:id   dashtab-id-2
                                                       :name "Tab 2"}
                                                      {:id   -1
                                                       :name "New tab"}]
                                          :dashcards [{:id               dashcard-id-1
                                                       :size_x           4
                                                       :size_y           4
                                                       :col              1
                                                       :row              1
                                                      ;; initialy was in tab1, now in tab 2
                                                       :dashboard_tab_id dashtab-id-2
                                                       :card_id          card-id-1}
                                                      {:id               dashcard-id-2
                                                       :dashboard_tab_id dashtab-id-2
                                                       :size_x           2
                                                       :size_y           2
                                                       :col              2
                                                       :row              2}
                                                      ;; remove the dashcard3 and create a new card using negative numbers
                                                      ;; and assign into the newly created dashcard
                                                      {:id               -1
                                                       :size_x           1
                                                       :size_y           1
                                                       :col              3
                                                       :row              3
                                                       :dashboard_tab_id -1
                                                       :card_id          card-id-2}]})]
          (testing "name got updated correctly"
            (is (= "Updated dashboard name"
                   (t2/select-one-fn :name :model/Dashboard :id dashboard-id)
                   (:name resp))))

          (testing "tabs got updated correctly "
            (is (=? [{:id           dashtab-id-1
                      :dashboard_id dashboard-id
                      :name         "Tab 1 edited"
                      :position     0}
                     {:id           dashtab-id-2
                      :dashboard_id dashboard-id
                      :name         "Tab 2"
                      :position 1}
                     {:id           (mt/malli=? [:fn pos-int?])
                      :dashboard_id dashboard-id
                      :name         "New tab"
                      :position     2}]
                    (:tabs resp)))
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
                       {:id               (mt/malli=? [:fn pos-int?])
                        :size_x           1
                        :size_y           1
                        :col              3
                        :row              3
                        :dashboard_tab_id new-tab-id
                        :card_id           card-id-2}]
                      (:dashcards resp))))
            (testing "dashcard 3 got deleted"
              (is (nil? (t2/select-one :model/DashboardCard :id dashcard-id-3))))))))))

(deftest e2e-update-cards-only-test
  (testing "PUT /api/dashboard/:id/cards with create/update/delete in a single req"
    (mt/test-helpers-set-global-values!
      (mt/with-temp
        [:model/Dashboard           {dashboard-id :id}  {}
         :model/Card                {card-id-1 :id}     {}
         :model/Card                {card-id-2 :id}     {}
         :model/DashboardCard       {dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id-1}
         :model/DashboardCard       {dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id-1}
         :model/DashboardCard       {dashcard-id-3 :id} {:dashboard_id dashboard-id, :card_id card-id-1}
         :model/Card                {series-id-1 :id}   {:name "Series Card 1"}
         :model/Card                {series-id-2 :id}   {:name "Series Card 2"}
         :model/DashboardCardSeries _                   {:dashboardcard_id dashcard-id-1, :card_id series-id-1
                                                         :position         0}]
        ;; send a request that update and create and delete some cards at the same time
        (let [get-revision-count (fn [] (t2/count :model/Revision :model_id dashboard-id :model "Dashboard"))
              revisions-before   (get-revision-count)
              cards              (:dashcards (mt/user-http-request
                                              :crowberto :put 200 (format "dashboard/%d" dashboard-id)
                                              {:dashcards [{:id      dashcard-id-1
                                                            :size_x  4
                                                            :size_y  4
                                                            :col     1
                                                            :row     1
                                                            ;; update series for card 1
                                                            :series  [{:id series-id-2}]
                                                            :card_id card-id-1}
                                                           {:id     dashcard-id-2
                                                            :size_x 2
                                                            :size_y 2
                                                            :col    2
                                                            :row    2}
                                                           ;; remove the dashcard3 and create a new card using negative numbers
                                                           {:id      -1
                                                            :size_x  1
                                                            :size_y  1
                                                            :col     3
                                                            :row     3
                                                            :card_id card-id-2
                                                            :series  [{:id series-id-1}]}]
                                               :tabs      []}))
              updated-card-1     {:id           dashcard-id-1
                                  :card_id      card-id-1
                                  :dashboard_id dashboard-id
                                  :size_x       4
                                  :size_y       4
                                  :action_id    nil
                                  :row          1
                                  :col          1
                                  :series       [{:name "Series Card 2"}]}
              updated-card-2     {:id           dashcard-id-2
                                  :card_id      card-id-1
                                  :dashboard_id dashboard-id
                                  :size_x       2
                                  :size_y       2
                                  :action_id    nil
                                  :row          2
                                  :col          2
                                  :series       []}
              new-card           {:card_id      card-id-2
                                  :dashboard_id dashboard-id
                                  :size_x       1
                                  :size_y       1
                                  :action_id    nil
                                  :row          3
                                  :col          3
                                  :series       [{:name "Series Card 1"}]}
              revisions-after    (get-revision-count)]
          (is (=? [updated-card-1
                   updated-card-2
                   new-card]
                  cards))
          (is (nil? (t2/select-one :model/DashboardCard :id dashcard-id-3))
              "dashcard 3 is deleted")
          (testing "only one revision is created from the request"
            (is (= 1 (- revisions-after revisions-before)))))))))

(deftest e2e-update-tabs-only-test
  (testing "PUT /api/dashboard/:id/cards with create/update/delete tabs in a single req"
    (with-simple-dashboard-with-tabs [{:keys [dashboard-id dashtab-id-1 dashtab-id-2]}]
      (with-dashboards-in-writeable-collection! [dashboard-id]
        ;; send a request that update and create and delete some cards at the same time
        (is (some? (t2/select-one :model/DashboardTab :id dashtab-id-2)))
        (let [tabs (:tabs (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                                                {:tabs  [{:name "Tab new"
                                                          :id   -1}
                                                         {:name "Tab 1 moved to second position"
                                                          :id   dashtab-id-1}]
                                                 :dashcards []}))]

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
    (mt/with-temp
      [:model/Dashboard     {dashboard-id :id}  {}
       :model/Card          {card-id-1 :id}     {}
       :model/Card          {card-id-2 :id}     {}
       :model/DashboardCard {dashcard-1-id :id} {:card_id      card-id-1
                                                 :dashboard_id dashboard-id}]
      ;; create 2 tabs, assign the existing dashcard to the 1st tab
      ;; create 2 new dashcards, 1 for each tab
      (let [resp (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                                       {:tabs      [{:id   -1
                                                     :name "New Tab 1"}
                                                    {:id   -2
                                                     :name "New Tab 2"}]
                                        :dashcards [{:id               dashcard-1-id
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
        (is (=? {:dashcards [{:id               dashcard-1-id
                              :card_id          card-id-1
                              :dashboard_id     dashboard-id
                              :dashboard_tab_id tab-1-id}
                             {:id               pos-int?
                              :card_id          card-id-1
                              :dashboard_id     dashboard-id
                              :dashboard_tab_id tab-1-id}
                             {:id               pos-int?
                              :card_id          card-id-2
                              :dashboard_id     dashboard-id
                              :dashboard_tab_id tab-2-id}]
                 :tabs      [{:id           tab-1-id
                              :dashboard_id dashboard-id
                              :name         "New Tab 1"
                              :position     0}
                             {:id           tab-2-id
                              :dashboard_id dashboard-id
                              :name         "New Tab 2"
                              :position     1}]}
                (update resp :dashcards #(sort dashboard-card/dashcard-comparator %))))))))

(deftest update-cards-error-handling-test
  (testing "PUT /api/dashboard/:id"
    (with-simple-dashboard-with-tabs [{:keys [dashboard-id]}]
      (testing "if a dashboard has tabs, check if all cards from the request has a tab_id"
        (is (= "This dashboard has tab, makes sure every card has a tab"
               (mt/user-http-request :crowberto :put 400 (format "dashboard/%d" dashboard-id)
                                     {:dashcards (conj
                                                  (current-cards dashboard-id)
                                                  {:id     -1
                                                   :size_x 4
                                                   :size_y 4
                                                   :col    1
                                                   :row    1})
                                      :tabs      (tabs dashboard-id)})))))))

(deftest update-tabs-track-snowplow-test
  (mt/with-temp
    [:model/Dashboard               {dashboard-id :id}  {}
     :model/DashboardTab     {dashtab-id-1 :id}  {:name "Tab 1" :dashboard_id dashboard-id :position 0}
     :model/DashboardTab     {dashtab-id-2 :id}  {:name "Tab 2" :dashboard_id dashboard-id :position 1}
     :model/DashboardTab     _                   {:name "Tab 3" :dashboard_id dashboard-id :position 2}]
    (testing "create and delete tabs events are tracked"
      (snowplow-test/with-fake-snowplow-collector
        (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                              {:tabs      [{:id   dashtab-id-1
                                            :name "Tab 1 edited"}
                                           {:id   dashtab-id-2
                                            :name "Tab 2"}
                                           {:id   -1
                                            :name "New tab 1"}
                                           {:id   -2
                                            :name "New tab 2"}]
                               :dashcards []})
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
        (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                              {:tabs      (tabs dashboard-id)
                               :dashcards []})
        (is (= 0 (count (snowplow-test/pop-event-data-and-user-id!))))))))

;;; -------------------------------------- Create dashcards tests ---------------------------------------

(deftest simple-creation-with-no-additional-series-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                 :model/Card {card-id :id}] {}
    (with-dashboards-in-writeable-collection! [dashboard-id]
      (api.card-test/with-cards-in-readable-collection! [card-id]
        (let [resp (:dashcards (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                                                     {:dashcards [{:id                     -1
                                                                   :card_id                card-id
                                                                   :row                    4
                                                                   :col                    4
                                                                   :size_x                 4
                                                                   :size_y                 4
                                                                   :parameter_mappings     [{:parameter_id "abc"
                                                                                             :card_id      123
                                                                                             :hash         "abc"
                                                                                             :target       "foo"}]
                                                                   :visualization_settings {}}]
                                                      :tabs      []}))]
          ;; extra sure here because the dashcard we given has a negative id
          (testing "the inserted dashcards has ids auto-generated"
            (is (pos-int? (:id (first resp)))))
          (is (=? {:size_x                     4
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
                      (t2/select [:model/DashboardCard :size_x :size_y :col :row :parameter_mappings :visualization_settings]
                                 :dashboard_id dashboard-id)))))))))

(deftest can-update-card-parameter-with-legacy-field-and-expression-test
  (testing "PUT /api/dashboard/:id/cards accepts legacy field as parameter's target"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id}      {}]
      (let [resp (:cards (mt/user-http-request :crowberto :put 200 (format "dashboard/%d/cards" dashboard-id)
                                               {:cards [{:id                     -1
                                                         :card_id                card-id
                                                         :row                    0
                                                         :col                    0
                                                         :size_x                 4
                                                         :size_y                 4
                                                         :parameter_mappings     [{:parameter_id "abc"
                                                                                   :card_id card-id
                                                                                   :target [:dimension [:field-id (mt/id :venues :id)]]}]}]}))]
        (is (some? (t2/select-one :model/DashboardCard (:id (first resp))))))))

  (testing "PUT /api/dashboard/:id/cards accepts expression as parammeter's target"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id}      {:dataset_query (mt/mbql-query venues {:expressions {"A" [:+ (mt/$ids $venues.price) 1]}})}]
      (let [resp (:cards (mt/user-http-request :crowberto :put 200 (format "dashboard/%d/cards" dashboard-id)
                                               {:cards [{:id                     -1
                                                         :card_id                card-id
                                                         :row                    0
                                                         :col                    0
                                                         :size_x                 4
                                                         :size_y                 4
                                                         :parameter_mappings     [{:parameter_id "abc"
                                                                                   :card_id card-id
                                                                                   :target [:dimension [:expression "A"]]}]}]}))]
        (is (some? (t2/select-one :model/DashboardCard (:id (first resp)))))))))

(deftest new-dashboard-card-with-additional-series-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                 :model/Card      {card-id :id} {}
                 :model/Card      {series-id-1 :id} {:name "Series Card"}]
    (with-dashboards-in-writeable-collection! [dashboard-id]
      (api.card-test/with-cards-in-readable-collection! [card-id series-id-1]
        (let [dashboard-cards (:dashcards (mt/user-http-request :crowberto :put 200 (format "dashboard/%d" dashboard-id)
                                                                {:dashcards [{:id      -1
                                                                              :card_id card-id
                                                                              :row     4
                                                                              :col     4
                                                                              :size_x  4
                                                                              :size_y  4
                                                                              :series  [{:id series-id-1}]}]
                                                                 :tabs      []}))]
          (is (=? [{:row                        4
                    :col                        4
                    :size_x                     4
                    :size_y                     4
                    :parameter_mappings         []
                    :visualization_settings     {}
                    :series                     [{:name                   "Series Card"
                                                  :description            nil
                                                  :dataset_query          (:dataset_query api.card-test/card-defaults)
                                                  :display                "table"
                                                  :visualization_settings {}}]
                    :created_at                 true
                    :updated_at                 true}]
                  (remove-ids-and-booleanize-timestamps dashboard-cards)))
          (is (= [{:size_x 4
                   :size_y 4
                   :col    4
                   :row    4}]
                 (map (partial into {})
                      (t2/select [:model/DashboardCard :size_x :size_y :col :row], :dashboard_id dashboard-id))))
          (is (= #{0}
                 (t2/select-fn-set :position :model/DashboardCardSeries, :dashboardcard_id (:id (first dashboard-cards))))))))))

(deftest dashcard-action-create-update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (doseq [action-type [:http :implicit :query]]
        (mt/with-actions [{:keys [action-id]} {:type action-type :visualization_settings {:hello true}}]
          (testing (str "Creating dashcard with action: " action-type)
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
              (is (partial= [{:visualization_settings {:label "Update"}
                              :action_id              action-id
                              :card_id                nil}]
                            (:dashcards (mt/user-http-request :crowberto :put 200 (format "dashboard/%s" dashboard-id)
                                                              {:dashcards [{:id                     -1
                                                                            :size_x                 1
                                                                            :size_y                 1
                                                                            :row                    1
                                                                            :col                    1
                                                                            :card_id                nil
                                                                            :action_id              action-id
                                                                            :visualization_settings {:label "Update"}}]
                                                               :tabs      []}))))
              (is (partial= {:dashcards [{:action (cond-> {:visualization_settings {:hello true}
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
          (mt/with-temp-env-var-value! [mb-encryption-secret-key encrypt-db?]
            (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-actions enable-actions?}}
              (mt/with-actions [{:keys [action-id]} {:type :query :visualization_settings {:hello true}}]
                (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                               :model/DashboardCard _ {:action_id action-id, :dashboard_id dashboard-id}]
                  (is (partial= {:dashcards [{:action {:database_enabled_actions enable-actions?}}]}
                                (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))))))))))

(deftest add-card-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (do-with-add-card-parameter-mapping-permissions-fixtures!
       (fn [{:keys [card-id mappings add-card! dashcards]}]
         (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
         (is (=? {:message "You must have data permissions to add a parameter referencing the Table \"VENUES\"."}
                 (add-card! 403)))
         (is (= []
                (dashcards)))
         (testing "Permissions for a different table in the same DB should not count"
           (data-perms/set-table-permission! (perms-group/all-users) (mt/id :categories) :perms/create-queries :query-builder)
           (is (=? {:message  "You must have data permissions to add a parameter referencing the Table \"VENUES\"."}
                   (add-card! 403)))
           (is (= []
                  (dashcards))))
         (testing "If they have data permissions, it should be ok"
           (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
           (is (=? [{:card_id            card-id
                     :parameter_mappings [{:parameter_id "_CATEGORY_ID_"
                                           :target       ["dimension" ["field" (mt/id :venues :category_id) nil]]}]}]
                   (:dashcards (add-card! 200))))
           (is (=? [{:card_id            card-id
                     :parameter_mappings mappings}]
                   (dashcards)))))))))

(deftest adding-archived-cards-to-dashboard-is-not-allowed
  (mt/with-temp
    [:model/Dashboard {dashboard-id :id} {}
     :model/Card      {card-id :id}      {:archived true}]
    (is (= "The object has been archived."
           (:message (mt/user-http-request :rasta :put 404 (format "dashboard/%d" dashboard-id)
                                           {:dashcards [{:id                     -1
                                                         :card_id                card-id
                                                         :row                    4
                                                         :col                    4
                                                         :size_x                 4
                                                         :size_y                 4
                                                         :parameter_mappings     [{:parameter_id "abc"
                                                                                   :card_id      123
                                                                                   :hash         "abc"
                                                                                   :target       "foo"}]
                                                         :visualization_settings {}}]
                                            :tabs      []}))))))

;;; -------------------------------------- Update dashcards only tests ---------------------------------------

(deftest update-cards-test
  (testing "PUT /api/dashboard/:id"
    ;; fetch a dashboard WITH a dashboard card on it
    (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                   :model/Card          {card-id :id} {}
                   :model/DashboardCard {dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id}
                   :model/DashboardCard {dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id}
                   :model/Card          {series-id-1 :id}   {:name "Series Card"}]
      (with-dashboards-in-writeable-collection! [dashboard-id]
        (is (= {:size_x                     4
                :size_y                     4
                :col                        0
                :row                        0
                :series                     []
                :parameter_mappings         []
                :inline_parameters          []
                :visualization_settings     {}
                :created_at                 true
                :updated_at                 true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-1))))
        (is (= {:size_x                     4
                :size_y                     4
                :col                        0
                :row                        0
                :parameter_mappings         []
                :inline_parameters          []
                :visualization_settings     {}
                :series                     []
                :created_at                 true
                :updated_at                 true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-2))))
        ;; TODO adds tests for return
        (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                              {:dashcards [{:id     dashcard-id-1
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
                               :tabs      []})
        (is (= {:size_x                     4
                :size_y                     2
                :col                        0
                :row                        0
                :parameter_mappings         []
                :inline_parameters          []
                :visualization_settings     {}
                :series                     [{:name                   "Series Card"
                                              :description            nil
                                              :display                :table
                                              :type                   :question
                                              :dataset_query          {}
                                              :visualization_settings {}}]
                :created_at                 true
                :updated_at                 true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-1))))
        (is (= {:size_x                     1
                :size_y                     1
                :col                        1
                :row                        3
                :parameter_mappings         []
                :inline_parameters          []
                :visualization_settings     {}
                :series                     []
                :created_at                 true
                :updated_at                 true}
               (remove-ids-and-booleanize-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id-2))))))))

(deftest update-cards-parameter-mapping-permissions-test
  (testing "PUT /api/dashboard/:id"
    (testing "Should check current user's data permissions for the `parameter_mapping`"
      (do-with-update-cards-parameter-mapping-permissions-fixtures!
       (fn [{:keys [dashboard-id card-id original-mappings update-mappings! update-size! new-dashcard-info new-mappings]}]
         (testing "Should *NOT* be allowed to update the `:parameter_mappings` without proper data permissions"
           (is (=? {:message  "You must have data permissions to add a parameter referencing the Table \"VENUES\"."}
                   (update-mappings! 403)))
           (is (= original-mappings
                  (t2/select-one-fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id, :card_id card-id))))
         (testing "Changing another column should be ok even without data permissions."
           (update-size!)
           (is (= (:size_x new-dashcard-info)
                  (t2/select-one-fn :size_x :model/DashboardCard :dashboard_id dashboard-id, :card_id card-id))))
         (testing "Should be able to update `:parameter_mappings` *with* proper data permissions."
           (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
           (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
           (update-mappings! 200)
           (is (= new-mappings
                  (t2/select-one-fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id, :card_id card-id)))))))))

(deftest update-action-cards-test
  (mt/with-actions-enabled
    (testing "PUT /api/dashboard/:id"
      ;; fetch a dashboard WITH a dashboard card on it
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {model-id :id} {:type :model}
                     :model/Card          {model-id-2 :id} {:type :model}
                     :model/Action        {action-id :id} {:model_id model-id :type :implicit :name "action"}
                     ;; Put the **same** card on the dashboard as both an action card and a question card
                     :model/DashboardCard action-card {:dashboard_id dashboard-id
                                                       :action_id action-id
                                                       :card_id model-id}
                     :model/DashboardCard question-card {:dashboard_id dashboard-id, :card_id model-id}]
        (with-dashboards-in-writeable-collection! [dashboard-id]
          ;; TODO adds test for return
          ;; Update **both** cards to use the new card id
          (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dashboard-id)
                                {:dashcards [(assoc action-card :card_id model-id-2)
                                             (assoc question-card :card_id model-id-2)]
                                 :tabs      []})
          (testing "Both updated card ids should be reflected after making the dashcard changes."
            (is (partial= [{:card_id model-id-2}
                           {:card_id model-id-2}]
                          (t2/select :model/DashboardCard :dashboard_id dashboard-id {:order-by [:id]})))))))))

(deftest update-tabs-test
  (with-simple-dashboard-with-tabs [{:keys [dashboard-id dashtab-id-1 dashtab-id-2]}]
    (testing "change tab name and change the position"
      (is (=? [{:id       dashtab-id-2
                :name     "Tab 2"}
               {:id       dashtab-id-1
                :name     "Tab 1 edited"}]
              (:tabs (mt/user-http-request :crowberto :put 200 (format "dashboard/%d" dashboard-id)
                                           {:tabs      [{:id   dashtab-id-2
                                                         :name "Tab 2"}
                                                        {:id   dashtab-id-1
                                                         :name "Tab 1 edited"}]
                                            :dashcards (current-cards dashboard-id)})))))))

;;; -------------------------------------- Delete dashcards tests ---------------------------------------

(deftest delete-cards-test
  (testing "PUT /api/dashboard/id to delete"
    (testing "partial delete"
      ;; fetch a dashboard WITH a dashboard card on it
      (mt/with-temp [:model/Dashboard           {dashboard-id :id}   {}
                     :model/Card                {card-id :id}        {}
                     :model/Card                {series-id-1 :id}    {}
                     :model/Card                {series-id-2 :id}    {}
                     :model/DashboardCard       {dashcard-id-1 :id}  {:dashboard_id dashboard-id, :card_id card-id}
                     :model/DashboardCard       {_dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id}
                     :model/DashboardCard       {dashcard-id-3 :id}  {:dashboard_id dashboard-id, :card_id card-id}
                     :model/DashboardCardSeries _                    {:dashboardcard_id dashcard-id-1, :card_id series-id-1, :position 0}
                     :model/DashboardCardSeries _                    {:dashboardcard_id dashcard-id-1, :card_id series-id-2, :position 1}
                     :model/DashboardCardSeries _                    {:dashboardcard_id dashcard-id-3, :card_id series-id-1, :position 0}]
        (with-dashboards-in-writeable-collection! [dashboard-id]
          (is (= 3
                 (count (t2/select-pks-set :model/DashboardCard, :dashboard_id dashboard-id))))
          (is (=? {:dashcards [{:id     dashcard-id-3
                                :series [{:id series-id-1}]}]
                   :tabs      []}
                  (mt/user-http-request :rasta :put 200
                                        (format "dashboard/%d" dashboard-id) {:dashcards [(dashcard-like-response dashcard-id-3)]
                                                                              :tabs      []})))
          (is (= 1
                 (count (t2/select-pks-set :model/DashboardCard, :dashboard_id dashboard-id)))))))

    (testing "prune"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {card-id :id}      {}
                     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}
                     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
        (with-dashboards-in-writeable-collection! [dashboard-id]
          (is (= 2
                 (count (t2/select-pks-set :model/DashboardCard, :dashboard_id dashboard-id))))
          (is (=? {:tabs      []
                   :dashcards []}
                  (mt/user-http-request :rasta :put 200
                                        (format "dashboard/%d" dashboard-id) {:dashcards []
                                                                              :tabs      []})))
          (is (= 0
                 (count (t2/select-pks-set :model/DashboardCard, :dashboard_id dashboard-id)))))))))

(deftest delete-tabs-test
  (testing "PUT /api/dashboard/:id to delete"
    (testing "partial delete"
      (with-simple-dashboard-with-tabs [{:keys [dashboard-id dashtab-id-1 dashtab-id-2]}]
        (testing "we have 2 tabs, each has 1 card to begin with"
          (is (= 2
                 (t2/count :model/DashboardCard, :dashboard_id dashboard-id)))
          (is (= 2
                 (t2/count :model/DashboardTab :dashboard_id dashboard-id))))
        (is (=? {:tabs [{:id dashtab-id-1}]}
                (mt/user-http-request :rasta :put 200
                                      (format "dashboard/%d" dashboard-id)
                                      {:tabs      [(t2/select-one :model/DashboardTab :id dashtab-id-1)]
                                       :dashcards (remove #(= (:dashboard_tab_id %) dashtab-id-2) (current-cards dashboard-id))})))
        (testing "deteted 1 tab, we should have"
          (testing "1 card left"
            (is (= 1
                   (t2/count :model/DashboardCard :dashboard_id dashboard-id))))
          (testing "1 tab left"
            (is (= 1
                   (t2/count :model/DashboardTab :dashboard_id dashboard-id)))))))
    (testing "prune"
      (with-simple-dashboard-with-tabs [{:keys [dashboard-id]}]
        (testing "we have 2 tabs, each has 1 card to begin with"
          (is (= 2
                 (t2/count :model/DashboardCard, :dashboard_id dashboard-id)))
          (is (= 2
                 (t2/count :model/DashboardTab :dashboard_id dashboard-id))))
        (is (=? {:tabs      []
                 :dashcards []}
                (mt/user-http-request :rasta :put 200
                                      (format "dashboard/%d" dashboard-id)
                                      {:tabs      []
                                       :dashcards []})))
        (testing "dashboard should be empty"
          (testing "0 card left"
            (is (= 0
                   (t2/count :model/DashboardCard :dashboard_id dashboard-id))))
          (testing "0 tab left"
            (is (= 0
                   (t2/count :model/DashboardTab :dashboard_id dashboard-id)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-dashboard []
  {:public_uuid       (str (random-uuid))
   :made_public_by_id (mt/user->id :crowberto)})

;;; -------------------------------------- POST /api/dashboard/:id/public_link ---------------------------------------

(deftest share-dashboard-test
  (mt/with-temporary-setting-values [enable-public-sharing true]
    (testing "Test that we can share a Dashboard"
      (mt/with-temp [:model/Dashboard dashboard]
        (let [{uuid :uuid} (mt/user-http-request :crowberto :post 200
                                                 (format "dashboard/%d/public_link" (u/the-id dashboard)))]
          (is (t2/exists? :model/Dashboard :id (u/the-id dashboard), :public_uuid uuid))
          (testing "Test that if a Dashboard has already been shared we reuse the existing UUID"
            (is (= uuid
                   (:uuid (mt/user-http-request :crowberto :post 200
                                                (format "dashboard/%d/public_link" (u/the-id dashboard))))))))))

    (mt/with-temp [:model/Dashboard dashboard]
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
        (mt/with-temp [:model/Dashboard dashboard (shared-dashboard)]
          (mt/user-http-request :crowberto :delete 204 (format "dashboard/%d/public_link" (u/the-id dashboard)))
          (is (= false
                 (t2/exists? :model/Dashboard :id (u/the-id dashboard), :public_uuid (:public_uuid dashboard))))))

      (testing "Test that we *cannot* unshare a Dashboard if we are not admins"
        (mt/with-temp [:model/Dashboard dashboard (shared-dashboard)]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 (format "dashboard/%d/public_link" (u/the-id dashboard)))))))

      (testing "Test that we get a 404 if Dashboard isn't shared"
        (mt/with-temp [:model/Dashboard dashboard]
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404 (format "dashboard/%d/public_link" (u/the-id dashboard)))))))

      (testing "Test that we get a 404 if Dashboard doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE))))))))

;;
(deftest fetch-public-dashboards-test
  (testing "GET /api/dashboard/public"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Dashboard _dashboard (shared-dashboard)]
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
      (mt/with-temporary-setting-values [enable-embedding-static true]
        (mt/with-temp [:model/Dashboard _ {:enable_embedding true}]
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
  [x]
  (walk/postwalk (fn [form]
                   (if (instance? (Class/forName "[B") form)
                     (codec/base64-encode form)
                     form))
                 x))

(deftest ^:parallel dashcard->query-hashes-test
  (doseq [[dashcard expected]
          [[{:card {:dataset_query {:database 1}}}
            ["k9Y1XOETkQ31kX+S9DXW/cbDPGF7v4uS5f6dZsXjMRs="
             "I6mv3dlN4xat/6R+KQVTLDqNe8/B0oymcDnW/aKppwY="]]

           [{:card   {:dataset_query {:database 2}}
             :series [{:dataset_query {:database 3}}
                      {:dataset_query {:database 4}}]}
            ["WbWqdd3zu9zvVCVWh8X9ASWLqtaB1rZlU0gKLEuCK0I="
             "ysJFZA3Gd0vKIlrZWJDYBLCIQBf10X6QjuFtV/8QzbE="
             "pjdBPUgWnbVvMf0VsETyeB6smRC8SYejyTZIVPh2m3I="
             "wf9reZSm1Pz+WDHRYtZXmfQ39U+17mq7u28MqPR8fQI="
             "rP5XFvxpRDCPXeM0A2Z7uoUkH0zwV0Z0o22obH3c1Uk="
             "r+C7dsdRXBN32GK+QHLA/n9pr1hzjteFzDCVezLzImQ="]]]]
    (testing (pr-str dashcard)
      (is (= expected
             (base-64-encode-byte-arrays (#'api.dashboard/dashcard->query-hashes dashcard)))))))

(deftest ^:parallel dashcards->query-hashes-test
  (is (= ["k9Y1XOETkQ31kX+S9DXW/cbDPGF7v4uS5f6dZsXjMRs="
          "I6mv3dlN4xat/6R+KQVTLDqNe8/B0oymcDnW/aKppwY="
          "WbWqdd3zu9zvVCVWh8X9ASWLqtaB1rZlU0gKLEuCK0I="
          "ysJFZA3Gd0vKIlrZWJDYBLCIQBf10X6QjuFtV/8QzbE="
          "pjdBPUgWnbVvMf0VsETyeB6smRC8SYejyTZIVPh2m3I="
          "wf9reZSm1Pz+WDHRYtZXmfQ39U+17mq7u28MqPR8fQI="
          "rP5XFvxpRDCPXeM0A2Z7uoUkH0zwV0Z0o22obH3c1Uk="
          "r+C7dsdRXBN32GK+QHLA/n9pr1hzjteFzDCVezLzImQ="]
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
  (mt/with-temp [:model/Dashboard {dashboard-id :id}]
    (is (= #{:cards}
           (-> (mt/user-http-request :crowberto :get 200 (format "dashboard/%s/related" dashboard-id)) keys set)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Chain Filter Endpoints                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-chain-filter-fixtures
  ([f]
   (do-with-chain-filter-fixtures nil f))

  ([dashboard-values f]
   (mt/with-temp
     [:model/Card          {source-card-id :id} (merge (mt/card-with-source-metadata-for-query (mt/mbql-query categories {:limit 5}))
                                                       {:database_id (mt/id)
                                                        :table_id    (mt/id :categories)})
      :model/Dashboard     dashboard (merge {:parameters [{:name "Category Name"
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
                                                          {:name                 "Static Category"
                                                           :slug                 "static_category"
                                                           :id                   "_STATIC_CATEGORY_"
                                                           :type                 "category"
                                                           :values_source_type   "static-list"
                                                           :values_source_config {:values ["African" "American" "Asian"]}}
                                                          {:name                 "Static Category label"
                                                           :slug                 "static_category_label"
                                                           :id                   "_STATIC_CATEGORY_LABEL_"
                                                           :type                 "category"
                                                           :values_source_type   "static-list"
                                                           :values_source_config {:values [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}}
                                                          {:id                   "_CARD_"
                                                           :type                 "category"
                                                           :name                 "CATEGORY"
                                                           :values_source_type   "card"
                                                           :values_source_config {:card_id     source-card-id
                                                                                  :value_field (mt/$ids $categories.name)}}
                                                          {:name "Not Category Name"
                                                           :slug "not_category_name"
                                                           :id   "_NOT_CATEGORY_NAME_"
                                                           :type :string/!=}
                                                          {:name    "Category Contains"
                                                           :slug    "category_contains"
                                                           :id      "_CATEGORY_CONTAINS_"
                                                           :type    :string/contains
                                                           :options {:case-sensitive false}}
                                                          {:name "Name", :slug "name", :id "_name_", :type :string/=}
                                                          {:name "Not Name", :slug "notname", :id "_notname_", :type :string/!=}
                                                          {:name "Contains", :slug "contains", :id "_contains_", :type :string/contains}]}
                                            dashboard-values)
      :model/Card          card {:database_id   (mt/id)
                                 :table_id      (mt/id :venues)
                                 :dataset_query (mt/mbql-query venues)}
      :model/Card          card2 {:database_id   (mt/id)
                                  :query_type    :native
                                  :name          "test question"
                                  :creator_id    (mt/user->id :crowberto)
                                  :dataset_query {:database (mt/id)
                                                  :type     :native
                                                  :native   {:query "SELECT COUNT(*) FROM categories WHERE {{name}} AND {{noname}}"
                                                             :template-tags
                                                             {"name"     {:name         "name"
                                                                          :display-name "Name"
                                                                          :id           "_CARD_ID_"
                                                                          :type         :dimension
                                                                          :dimension    [:field (mt/id :categories :name) nil]
                                                                          :widget-type  :string/=}
                                                              "notname"  {:name         "notname"
                                                                          :display-name "Not Name"
                                                                          :id           "_CARD_NOTNAME_"
                                                                          :type         :dimension
                                                                          :dimension    [:field (mt/id :categories :name) nil]
                                                                          :widget-type  :string/!=}
                                                              "contains" {:name         "contains"
                                                                          :display-name "Name Contains"
                                                                          :id           "_CARD_CONTAINS_"
                                                                          :type         :dimension
                                                                          :dimension    [:field (mt/id :categories :name) nil]
                                                                          :widget-type  :string/contains
                                                                          :options      {:case-sensitive false}}}}}}
      :model/DashboardCard dashcard {:card_id            (:id card)
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
                                                           :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                          {:parameter_id "_NOT_CATEGORY_NAME_"
                                                           :card_id      (:id card)
                                                           :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                          {:parameter_id "_CATEGORY_CONTAINS_"
                                                           :card_id      (:id card)
                                                           :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}
      :model/DashboardCard dashcard2 {:card_id      (:id card2)
                                      :dashboard_id (:id dashboard)
                                      :parameter_mappings
                                      [{:parameter_id "_name_", :card_id (:id card2), :target [:dimension [:template-tag "name"]]}
                                       {:parameter_id "_notname_", :card_id (:id card2), :target [:dimension [:template-tag "notname"]]}
                                       {:parameter_id "_contains_", :card_id (:id card2), :target [:dimension [:template-tag "contains"]]}]}]
     (f {:dashboard  dashboard
         :card       card
         :dashcard   dashcard
         :card2      card2
         :dashcard2  dashcard2
         :param-keys {:category-name         "_CATEGORY_NAME_"
                      :category-id           "_CATEGORY_ID_"
                      :price                 "_PRICE_"
                      :id                    "_ID_"
                      :static-category       "_STATIC_CATEGORY_"
                      :static-category-label "_STATIC_CATEGORY_LABEL_"
                      :card                  "_CARD_"
                      :not-category-name     "_NOT_CATEGORY_NAME_"
                      :category-contains     "_CATEGORY_CONTAINS_"}}))))

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
          (with-redefs [chain-filter/use-cached-field-values? (constantly false)]
            (binding [qp.perms/*card-id* nil] ;; this situation was observed when running constrained chain filters.
              (is (= {:values [["African"] ["American"] ["Artisan"] ["Asian"]] :has_more_values false}
                     (chain-filter-test/take-n-values 4 (mt/user-http-request :rasta :get 200 url)))))))))

    (let [url (chain-filter-values-url dashboard (:category-name param-keys) (:price param-keys) 4)]
      (testing (str "\nGET /api/" url "\n")
        (testing "\nShow me names of categories that have expensive venues (price = 4), while I lack permisisons."
          (with-redefs [chain-filter/use-cached-field-values? (constantly false)]
            (binding [qp.perms/*card-id* nil]
              (is (= {:values [["Japanese"] ["Steakhouse"]], :has_more_values false}
                     (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))))))))

(deftest dashboard-chain-filter-test
  (testing "GET /api/dashboard/:id/params/:param-key/values"
    (mt/with-full-data-perms-for-all-users!
      (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
        ;; make sure we have a clean start
        (field-values/clear-field-values-for-field! (mt/id :categories :name))
        (testing "Show me names of categories"
          (is (= {:values          [["African"] ["American"] ["Artisan"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 (chain-filter-values-url
                                                                                           (:id dashboard)
                                                                                           (:category-name param-keys)))))))
        (mt/let-url [url (chain-filter-values-url dashboard (:category-name param-keys) (:price param-keys) 4)]
          (testing "\nShow me names of categories that have expensive venues (price = 4)"
            (is (= {:values          [["Japanese"] ["Steakhouse"]]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))
        ;; this is the format the frontend passes multiple values in (pass the parameter multiple times), and our
        ;; middleware does the right thing and converts the values to a vector
        (mt/let-url [url (chain-filter-values-url dashboard (:category-name param-keys))]
          (testing "\nmultiple values"
            (testing "Show me names of categories that have (somewhat) expensive venues (price = 3 *or* 4)"
              (is (= {:values          [["American"] ["Asian"] ["BBQ"]]
                      :has_more_values false}
                     (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url
                                                                              (keyword (:price param-keys)) 3
                                                                              (keyword (:price param-keys)) 4))))))))
      (testing "Should require perms for the Dashboard"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection]
            (with-chain-filter-fixtures [{:keys [dashboard param-keys]} {:collection_id (:id collection)}]
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 (chain-filter-values-url
                                                            (:id dashboard)
                                                            (:category-name param-keys)))))))))

      (testing "Should work if Dashboard has multiple mappings for a single param"
        (with-chain-filter-fixtures [{:keys [dashboard card dashcard param-keys]}]
          (mt/with-temp [:model/Card          card-2 (dissoc card :id :entity_id)
                         :model/DashboardCard _dashcard-2 (-> dashcard
                                                              (dissoc :id :card_id :entity_id)
                                                              (assoc  :card_id (:id card-2)))]
            (is (= {:values          [["African"] ["American"] ["Artisan"]]
                    :has_more_values false}
                   (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                        (mt/user-http-request :rasta :get 200)
                        (chain-filter-test/take-n-values 3)))))))

      (testing "should check perms for the Fields in question"
        (mt/with-temp-copy-of-db
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
            (mt/with-no-data-perms-for-all-users!
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
              (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
              ;; HACK: we currently 403 on chain-filter calls that require running a MBQL
              ;; but 200 on calls that we could just use the cache.
              ;; It's not ideal and we definitely need to have a consistent behavior
              (with-redefs [chain-filter/use-cached-field-values? (fn [_] false)]
                (is (= {:values          [["African"] ["American"] ["Artisan"]]
                        :has_more_values false}
                       (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                            (mt/user-http-request :rasta :get 200)
                            (chain-filter-test/take-n-values 3)))))))))

      (testing "missing data perms should not affect perms for the Fields in question when users have collection access"
        (mt/with-temp-copy-of-db
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
            (mt/with-no-data-perms-for-all-users!
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
              (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :no)
              (is (= {:values          [["African"] ["American"] ["Artisan"]]
                      :has_more_values false}
                     (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                          (mt/user-http-request :rasta :get 200)
                          (chain-filter-test/take-n-values 3)))))))))))

(deftest chain-filter-can-fetch-remapped-values-from-model
  (testing "Remapping works with aggregated queries on models #53059"
    (mt/with-temp
      [:model/Card {saved-query-id :id} {:database_id   (mt/id)
                                         :table_id      (mt/id :orders)
                                         :dataset_query (mt/mbql-query orders)}
       :model/Card {card-id :id}        {:database_id   (mt/id)
                                         :table_id      (str "card__" saved-query-id)
                                         :dataset_query {:database (mt/id)
                                                         :type     :query
                                                         :query    {:source-table (str "card__" saved-query-id)
                                                                    :aggregation  [[:count]]}}}
       :model/Dashboard {dash-id :id}   {:parameters    [{:id   "__ID__"
                                                          :name "ID"
                                                          :type "id"
                                                          :slug "id"}]}
       :model/DashboardCard _           {:card_id            card-id
                                         :dashboard_id       dash-id
                                         :parameter_mappings [{:parameter_id "__ID__"
                                                               :card_id      card-id
                                                               :target       [:dimension
                                                                              [:field
                                                                               "PRODUCT_ID"
                                                                               {:base-type :type/Integer}]]}]}]
      (mt/with-column-remappings [orders.product_id products.title]
        (is (=? {:values         [[(mt/malli=? pos-int?) "Aerodynamic Bronze Hat"]
                                  [(mt/malli=? pos-int?) "Aerodynamic Concrete Bench"]
                                  [(mt/malli=? pos-int?) "Aerodynamic Concrete Lamp"]]
                 :has_more_values false}
                (chain-filter-test/take-n-values
                 3
                 (mt/user-http-request :rasta :get 200 (chain-filter-values-url dash-id "__ID__")))))))))

(deftest chain-filter-result-can-have-mixed-of-remapped-and-non-remapped-values-test
  (testing (str "getting values of a parameter that maps to 2 id fields: "
                "one with remapped values, one with raw id shouldn't fail #44231")
    (mt/with-temp
      [:model/Card {orders-card-id :id}   {:database_id   (mt/id)
                                           :table_id      (mt/id :orders)
                                           :dataset_query (mt/mbql-query orders)}
       :model/Card {products-card-id :id} {:database_id   (mt/id)
                                           :table_id      (mt/id :products)
                                           :dataset_query (mt/mbql-query products)}
       :model/Dashboard {dash-id :id}     {:parameters    [{:id   "__ID__"
                                                            :name "ID"
                                                            :type "id"
                                                            :slug "id"}]}
       :model/DashboardCard _             {:card_id            orders-card-id
                                           :dashboard_id       dash-id
                                           :parameter_mappings [{:parameter_id "__ID__"
                                                                 :card_id      orders-card-id
                                                                 :target       [:dimension (mt/$ids orders $product_id)]}]}
       :model/DashboardCard _             {:card_id            products-card-id
                                           :dashboard_id       dash-id
                                           :parameter_mappings [{:parameter_id "__ID__"
                                                                 :card_id      products-card-id
                                                                 :target       [:dimension (mt/$ids products $id)]}]}]
      (mt/with-column-remappings [products.id products.title]
        (is (=? {:values         [[(mt/malli=? pos-int?) "Aerodynamic Bronze Hat"]
                                  [(mt/malli=? pos-int?) "Aerodynamic Concrete Bench"]
                                  [(mt/malli=? pos-int?) "Aerodynamic Concrete Lamp"]]
                 :has_more_values false}
                (chain-filter-test/take-n-values
                 3
                 (mt/user-http-request :rasta :get 200 (chain-filter-values-url dash-id "__ID__")))))))))

(deftest can-filter-on-series-params
  (let [mp (mt/metadata-provider)]
    (mt/with-temp
      [:model/Card          _ (merge (mt/card-with-source-metadata-for-query (mt/mbql-query categories {:limit 5}))
                                     {:database_id (mt/id)
                                      :table_id    (mt/id :categories)})
       :model/Dashboard     dashboard {:parameters [{:name "Category"
                                                     :slug "category"
                                                     :id   "_CATEGORY_"
                                                     :type "category"}]}
       :model/Card          card {:database_id   (mt/id)
                                  :table_id      (mt/id :venues)
                                  :dataset_query (mt/mbql-query venues)}
       :model/Card          model {:database_id   (mt/id)
                                   :table_id      (mt/id :products)
                                   :dataset_query (mt/mbql-query products)}
       :model/Card          card2 {:database_id   (mt/id)
                                   :table_id      (mt/id :venues)
                                   :dataset_query (-> (lib/query mp (lib.metadata/card mp (:id model)))
                                                      lib.convert/->legacy-MBQL)}
       :model/DashboardCard dashcard {:card_id            (:id card)
                                      :dashboard_id       (:id dashboard)
                                      :parameter_mappings [{:parameter_id "_CATEGORY_"
                                                            :card_id      (:id card2)
                                                            :target       [:dimension [:field "CATEGORY" {:base-type :type/Text}] {:stage-number 0}]}]}
       :model/DashboardCardSeries _ {:card_id (:id card2)
                                     :dashboardcard_id (:id dashcard)
                                     :position 0}]
      ;; make sure we have a clean start
      (field-values/clear-field-values-for-field! (mt/id :categories :name))
      (testing "Can get field values for parameters tied to series #58328"
        (is (= {:values          [["Doohickey"] ["Gadget"] ["Gizmo"]]
                :has_more_values false}
               (->> (chain-filter-values-url
                     (:id dashboard)
                     "_CATEGORY_")
                    (mt/user-http-request :rasta :get 200)
                    (chain-filter-test/take-n-values 3))))))))

(deftest block-data-should-not-expose-field-values
  (testing "block data perms should not allow access to field values (private#196)"
    (when config/ee-available?
      (mt/with-premium-features #{:advanced-permissions}
        (mt/with-temp-copy-of-db
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
            (mt/with-no-data-perms-for-all-users!
              (is (= "You don't have permissions to do that."
                     (->> (chain-filter-values-url (:id dashboard) (:category-name param-keys))
                          (mt/user-http-request :rasta :get 403))))
              (testing "search"
                (is (= "You don't have permissions to do that."
                       (->> (chain-filter-search-url (:id dashboard) (:category-name param-keys) "BBQ")
                            (mt/user-http-request :rasta :get 403))))))))))))

(deftest dashboard-with-static-list-parameters-test
  (testing "A dashboard that has parameters that has static values"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "we could get the values"
        (is (= {:has_more_values false
                :values          [["African"] ["American"] ["Asian"]]}
               (mt/user-http-request :rasta :get 200
                                     (chain-filter-values-url (:id dashboard) (:static-category param-keys)))))

        (is (= {:has_more_values false
                :values          [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}
               (mt/user-http-request :rasta :get 200
                                     (chain-filter-values-url (:id dashboard) (:static-category-label param-keys))))))

      (testing "we could search the values"
        (is (= {:has_more_values false
                :values          [["African"]]}
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
      (is (= "nullable sequence of parameter must be a map with :id and :type keys"
             (get-in (mt/user-http-request :rasta :post 400 "dashboard"
                                           {:name       "a dashboard"
                                            :parameters [{:id                    "_value_"
                                                          :name                  "value"
                                                          :type                  "category"
                                                          :values_source_type    "random-type"
                                                          :values_source_config {"values" [1 2 3]}}]})
                     [:errors :parameters])))
      (is (= "nullable sequence of parameter must be a map with :id and :type keys"
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
    (mt/dataset test-data
      ;; Note that we can directly query the values for the model, but this is
      ;; nonsensical from a dashboard standpoint as the returned values aren't
      ;; usable for filtering...
      (mt/with-temp [:model/Card {model-id :id :as native-card} {:database_id   (mt/id)
                                                                 :name          "Native Query"
                                                                 :dataset_query (mt/native-query
                                                                                  {:query "SELECT category FROM products LIMIT 10;"})
                                                                 :type          :model}]
        (let [metadata (-> (:dataset_query native-card)
                           qp/process-query :data :results_metadata :columns)]
          (is (seq metadata) "Did not get metadata")
          (t2/update! 'Card {:id model-id}
                      {:result_metadata (assoc-in metadata [0 :id]
                                                  (mt/id :products :category))}))
        ;; ...so instead we create a question on top of this model (note that
        ;; metadata must be present on the model) and use the question on the
        ;; dashboard.
        (mt/with-temp [:model/Card {question-id :id} {:database_id   (mt/id)
                                                      :name          "card on native query"
                                                      :dataset_query {:type     :query
                                                                      :database (mt/id)
                                                                      :query    {:source-table (str "card__" model-id)}}
                                                      :type          :model}
                       :model/Dashboard dashboard {:name       "Dashboard"
                                                   :parameters [{:name      "Native Dropdown"
                                                                 :slug      "native_dropdown"
                                                                 :id        "_NATIVE_CATEGORY_NAME_"
                                                                 :type      :string/=
                                                                 :sectionId "string"}]}
                       :model/DashboardCard _dashcard {:parameter_mappings
                                                       [{:parameter_id "_NATIVE_CATEGORY_NAME_"
                                                         :card_id      question-id
                                                         :target       [:dimension
                                                                        [:field "CATEGORY" {:base-type :type/Text}]]}]
                                                       :card_id      question-id
                                                       :dashboard_id (:id dashboard)}]
          (let [url (format "dashboard/%d/params/%s/values" (u/the-id dashboard) "_NATIVE_CATEGORY_NAME_")]
            (is (=? {:values          [["Doohickey"]
                                       ["Gadget"]
                                       ["Gizmo"]
                                       ["Widget"]]
                     :has_more_values false}
                    (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-search-test
  (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (let [url (chain-filter-search-url dashboard (:category-name param-keys) "bar")]
        (testing (str "\n" url)
          (testing "\nShow me names of categories that include 'bar' (case-insensitive)"
            (is (= {:values          [["Bar"] ["Gay Bar"] ["Juice Bar"]]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))))

      (mt/let-url [url (chain-filter-search-url dashboard (:category-name param-keys) "house" (:price param-keys) 4)]
        (testing "\nShow me names of categories that include 'house' that have expensive venues (price = 4)"
          (is (= {:values          [["Steakhouse"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))

      (testing "Should require a non-empty query"
        (doseq [query ["   " "\n"]]
          (mt/let-url [url (chain-filter-search-url dashboard (:category-name param-keys) query)]
            (is (=? {:errors {:query "value must be a non-blank string."}}
                    (mt/user-http-request :rasta :get 400 url)))))
        (doseq [query [nil ""]]
          (mt/let-url [url (chain-filter-search-url dashboard (:category-name param-keys) query)]
            (is (= "API endpoint does not exist."
                   (mt/user-http-request :rasta :get 404 url)))))))

    (testing "Should require perms for the Dashboard"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection]
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]} {:collection_id (:id collection)}]
            (let [url (chain-filter-search-url dashboard (:category-name param-keys) "s")]
              (testing (str "\n" url)
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :get 403 url)))))))))))

(deftest chain-filter-not-found-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id}]
    (testing "GET /api/dashboard/:id/params/:param-key/values returns 400 if param not found"
      (mt/user-http-request :rasta :get 400 (format "dashboard/%d/params/non-existing-param/values" dashboard-id)))

    (testing "GET /api/dashboard/:id/params/:param-key/search/:query returns 400 if param not found"
      (mt/user-http-request :rasta :get 400 (format "dashboard/%d/params/non-existing-param/search/bar" dashboard-id)))))

(deftest chain-filter-invalid-parameters-test
  (testing "GET /api/dashboard/:id/params/:param-key/values"
    (testing "If some Dashboard parameters do not have valid Field IDs, we should ignore them"
      (with-chain-filter-fixtures [{:keys [dashcard card dashboard]}]
        (t2/update! :model/DashboardCard (:id dashcard)
                    {:parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                           :card_id      (:id card)
                                           :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                          {:parameter_id "_PRICE_"
                                           :card_id      (:id card)}]})
        (testing "Since the _PRICE_ param is not mapped to a valid Field, it should get ignored"
          (mt/let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_" "_PRICE_" 4)]
            (is (= {:values          [["African"] ["American"] ["Artisan"]]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))))))

(deftest chain-filter-human-readable-values-remapping-test
  (testing "Chain filtering for Fields that have Human-Readable values\n"
    (chain-filter-test/with-human-readable-values-remapping
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (mt/let-url [url (chain-filter-values-url dashboard "_CATEGORY_ID_" "_PRICE_" 4)]
            (is (= {:values          [[40 "Japanese"]
                                      [67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
          (mt/let-url [url (chain-filter-search-url dashboard "_CATEGORY_ID_" "house" "_PRICE_" 4)]
            (is (= {:values          [[67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-field-to-field-remapping-test
  (testing "Chain filtering for Fields that have a Field -> Field remapping\n"
    (with-chain-filter-fixtures [{:keys [dashboard]}]
      (testing "GET /api/dashboard/:id/params/:param-key/values"
        (mt/let-url [url (chain-filter-values-url dashboard "_ID_")]
          (is (= {:values          [[29 "20th Century Cafe"]
                                    [8 "25°"]
                                    [93 "33 Taps"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
        (mt/let-url [url (chain-filter-values-url dashboard "_ID_" "_PRICE_" 4)]
          (is (= {:values          [[55 "Dal Rae Restaurant"]
                                    [61 "Lawry's The Prime Rib"]
                                    [16 "Pacific Dining Car - Santa Monica"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))

      (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
        (mt/let-url [url (chain-filter-search-url dashboard "_ID_" "fish")]
          (is (= {:values          [[90 "Señor Fish"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
        (mt/let-url [url (chain-filter-search-url dashboard "_ID_" "sushi" "_PRICE_" 4)]
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
          (mt/let-url [url (chain-filter-values-url dashboard "_CATEGORY_ID_" "_PRICE_" 4)]
            (is (= {:values          [[40 "Japanese"]
                                      [67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
          (mt/let-url [url (chain-filter-search-url dashboard "_CATEGORY_ID_" "house" "_PRICE_" 4)]
            (is (= {:values          [[67 "Steakhouse"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

(deftest chain-filter-multiple-test
  (testing "Chain filtering works when a few filters are specified"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "GET /api/dashboard/:id/params/:param-key/values"
        (mt/let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                                  (:not-category-name param-keys) "American")]
          (is (= {:values          [["African"] ["Artisan"] ["Asian"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
        (mt/let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                                  (:category-contains param-keys) "m")]
          (is (= {:values          [["American"] ["Comedy Club"] ["Dim Sum"]]
                  :has_more_values false}
                 (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
        (testing "contains is case insensitive"
          (mt/let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                                    (:not-category-name param-keys) "American"
                                                    (:category-contains param-keys) "am")]
            (is (= {:values          [["Latin American"] ["Ramen"]]
                    :has_more_values false}
                   (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))))))

(deftest chain-filter-template-tags
  (testing "Chain filtering works for a native query with template tags"
    (with-chain-filter-fixtures [{:keys [dashboard]}]
      (mt/let-url [url (chain-filter-values-url dashboard "_name_")]
        (is (= {:values          [["African"] ["American"] ["Artisan"]]
                :has_more_values false}
               (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
      (mt/let-url [url (chain-filter-values-url dashboard "_name_" "_notname_" "American")]
        (is (= {:values          [["African"] ["Artisan"] ["Asian"]]
                :has_more_values false}
               (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url)))))
      (mt/let-url [url (chain-filter-values-url dashboard "_name_" "_contains_" "am")]
        (is (= {:values          [["American"] ["Latin American"] ["Ramen"]]
                :has_more_values false}
               (chain-filter-test/take-n-values 3 (mt/user-http-request :rasta :get 200 url))))))))

(deftest chain-filter-should-use-cached-field-values-test
  (testing "Chain filter endpoints should use cached FieldValues if applicable (#13832)"
    ;; ignore the cache entries added by #23699
    (mt/with-temp-vals-in-db :model/FieldValues (t2/select-one-pk :model/FieldValues :field_id (mt/id :categories :name) :hash_key nil) {:values ["Good" "Bad"]}
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (mt/let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_")]
            (is (= {:values          [["Bad"] ["Good"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url))))
          (testing "Shouldn't use cached FieldValues if the request has any additional constraints"
            (mt/let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_" "_PRICE_" 4)]
              (is (= {:values          [["Japanese"] ["Steakhouse"]]
                      :has_more_values false}
                     (mt/user-http-request :rasta :get 200 url))))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:query"
          (mt/let-url [url (chain-filter-search-url dashboard "_CATEGORY_NAME_" "ood")]
            (is (= {:values          [["Good"]]
                    :has_more_values false}
                   (mt/user-http-request :rasta :get 200 url)))))))))

;; See the commented-out test below which calls this helper, and the TODO on why it's disabled.
#_(defn- card-fields-from-table-metadata
    [card-id]
    (:fields (mt/user-http-request :rasta :get 200 (format "/table/card__%d/query_metadata" card-id))))

(deftest parameter-values-from-card-test
  (testing "getting values"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "It uses the results of the card's query execution"
        (mt/let-url [url (chain-filter-values-url dashboard (:card param-keys))]
          (is (= {:values          [["African"] ["American"] ["Artisan"] ["Asian"] ["BBQ"]]
                  :has_more_values false}
                 (mt/user-http-request :rasta :get 200 url)))))

      (testing "it only returns search matches"
        (mt/let-url [url (chain-filter-search-url dashboard (:card param-keys) "afr")]
          (is (= {:values          [["African"]]
                  :has_more_values false}
                 (mt/user-http-request :rasta :get 200 url))))))))

(deftest parameter-values-from-card-test-2
  (testing "fallback to chain-filter"
    (let [mock-chain-filter-result {:has_more_values true
                                    :values [["chain-filter"]]}]
      (with-redefs [parameters.dashboard/chain-filter (constantly mock-chain-filter-result)]
        (testing "if value-field not found in source card"
          (mt/with-temp [:model/Card       {card-id :id} {}
                         :model/Dashboard  dashboard     {:parameters    [{:id                   "abc"
                                                                           :type                 "category"
                                                                           :name                 "CATEGORY"
                                                                           :values_source_type   "card"
                                                                           :values_source_config {:card_id     card-id
                                                                                                  :value_field (mt/$ids $venues.name)}}]}]
            (mt/let-url [url (chain-filter-values-url dashboard "abc")]
              (is (= mock-chain-filter-result (mt/user-http-request :rasta :get 200 url))))))

        (testing "if card is archived"
          (mt/with-temp [:model/Card       {card-id :id} {:archived true}
                         :model/Dashboard  dashboard     {:parameters    [{:id                   "abc"
                                                                           :type                 "category"
                                                                           :name                 "CATEGORY"
                                                                           :values_source_type   "card"
                                                                           :values_source_config {:card_id     card-id
                                                                                                  :value_field (mt/$ids $venues.name)}}]}]
            (mt/let-url [url (chain-filter-values-url dashboard "abc")]
              (is (= mock-chain-filter-result (mt/user-http-request :rasta :get 200 url))))))))))

(deftest parameter-values-from-card-test-3
  (testing "users must have permissions to read the collection that source card is in"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp
        [:model/Collection coll1 {:name "Source card collection"}
         :model/Card       {source-card-id :id} {:collection_id (:id coll1)
                                                 :database_id   (mt/id)
                                                 :table_id      (mt/id :venues)
                                                 :dataset_query (mt/mbql-query venues {:limit 5})}
         :model/Collection coll2 {:name "Dashboard collections"}
         :model/Dashboard  {dashboard-id :id} {:collection_id (:id coll2)
                                               :parameters    [{:id                   "abc"
                                                                :type                 "category"
                                                                :name                 "CATEGORY"
                                                                :values_source_type   "card"
                                                                :values_source_config {:card_id     source-card-id
                                                                                       :value_field (mt/$ids $venues.name)}}]}]
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
          (is (some? (mt/user-http-request :rasta :get 200 (chain-filter-search-url dashboard-id "abc" "red")))))))))

(deftest parameter-values-from-card-test-4
  ;; TODO: Re-enable this test, or delete it. Now that mapping dashboard filters to fields on cards is powered by MLv2,
  ;; the FE does not use the /api/table/:card__id/query_metadata API call to determine the fields which can be filtered
  ;; on a saved question. It uses `Lib.filterableColumns` instead, which given a saved question with aggregations in the
  ;; last stage will return the pre-aggregation columns on that last stage. That allows linking the dashboard filter not
  ;; to the aggregations and breakouts, but to the pre-aggregation columns which feed into the aggregations.
  ;; This is typically what's wanted for filtering an aggregated query in a dashboard: filtering SUM(subtotal) to a
  ;; time range, product category, etc.
  ;; This test should either (1) be rehabilitated to use MLv2 to get the set of columns for filtering a dashcard (like
  ;; the FE); or (2) just be dropped if it's not providing value.
  #_(testing "field selection should compatible with field-id from /api/table/:card__id/query_metadata"
    ;; FE use the id returned by /api/table/:card__id/query_metadata
    ;; for the `values_source_config.value_field`, so we need to test to make sure
    ;; the id is a valid field that we could use to retrieve values.
      (mt/with-temp
      ;; card with agggregation and binning columns
        [Card {mbql-card-id :id} (merge (mt/card-with-source-metadata-for-query
                                         (mt/mbql-query venues
                                           {:limit 5
                                            :aggregation [:count]
                                            :breakout [[:field %latitude {:binning {:strategy :num-bins :num-bins 10}}]]}))
                                        {:name        "MBQL question"
                                         :database_id (mt/id)
                                         :table_id    (mt/id :venues)})
         Card {native-card-id :id} (merge (mt/card-with-source-metadata-for-query
                                           (mt/native-query {:query "select name from venues;"}))
                                          {:name        "Native question"
                                           :database_id (mt/id)
                                           :table_id    (mt/id :venues)})]

        (let [mbql-card-fields   (card-fields-from-table-metadata mbql-card-id)
              native-card-fields (card-fields-from-table-metadata native-card-id)
              _ (prn "mbql-card-fields" mbql-card-fields)
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
          (mt/with-temp [Dashboard {dash-id :id} {:parameters parameters}]
            (doseq [param parameters]
              (mt/let-url [url (chain-filter-values-url dash-id (:id param))]
                (is (some? (mt/user-http-request :rasta :get 200 url))))))))))

(deftest valid-filter-fields-test
  (testing "GET /api/dashboard/params/valid-filter-fields"
    (letfn [(result= [expected {:keys [filtered filtering]}]
              (testing (format "\nGET dashboard/params/valid-filter-fields")
                (is (= expected
                       (mt/user-http-request :rasta :get 200 "dashboard/params/valid-filter-fields"
                                             :filtered filtered :filtering filtering)))))]
      (mt/$ids
        (testing (format "\nvenues.price = %d categories.name = %d\n" %venues.price %categories.name)
          (result= {%venues.price [%categories.name]}
                   {:filtered [%venues.price], :filtering [%categories.name]})
          (testing "Multiple Field IDs for each param"
            (result= {%venues.price    (sort [%venues.price %categories.name])
                      %categories.name (sort [%venues.price %categories.name])}
                     {:filtered [%venues.price %categories.name], :filtering [%categories.name %venues.price]}))
          (testing "filtered-ids cannot be nil"
            (is (= {:errors {:filtered "vector of value must be an integer greater than zero."}
                    :specific-errors
                    {:filtered ["missing required key, received: nil"]}}
                   (mt/user-http-request :rasta :get 400 "dashboard/params/valid-filter-fields" :filtering [%categories.name]))))))
      (testing "should check perms for the Fields in question"
        (mt/with-temp-copy-of-db
          (perms.test-util/with-no-data-perms-for-all-users!
            (is (= "You don't have permissions to do that."
                   (mt/$ids (mt/user-http-request :rasta :get 403 "dashboard/params/valid-filter-fields"
                                                  :filtered [%venues.price] :filtering [%categories.name]))))))))))

(deftest uuid-id-column-is-not-implicitly-remapped-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :native-parameters :uuid-type
                                    :test/uuids-in-create-table-statements
                                    :test/dynamic-dataset-loading)
    (testing "Values for uuid fields are searched using test pattern (#59020)"
      (mt/dataset
        uuid-dogs
        (mt/with-temp
          [:model/Card          card      {:dataset_query (let [mp (mt/metadata-provider)]
                                                            (-> (lib/query mp (lib.metadata/table mp (mt/id :dogs)))
                                                                (lib.convert/->legacy-MBQL)))}
           :model/Dashboard     dashboard {:parameters [{:name      "Text"
                                                         :slug      "text"
                                                         :id        "_text_"
                                                         :type      "string/="
                                                         :sectionId "string"
                                                         :default   ["Doohickey"]}]}
           :model/DashboardCard _dashcard {:parameter_mappings     [{:parameter_id "_text_"
                                                                     :card_id      (:id card)
                                                                     :target
                                                                     [:dimension [:field (mt/id :dogs :id) nil]]}]
                                           :card_id                (:id card)
                                           :visualization_settings {}
                                           :dashboard_id           (:id dashboard)}]
          (is (=? {:values [["27e164bc-54f8-47a0-a85a-9f0e90dd7667"]
                            ["3a0c0508-6b00-40ff-97f6-549666b2d16b"]]}
                  (mt/user-http-request :rasta :get 200 (format "/dashboard/%d/params/%s/search/%s"
                                                                (:id dashboard)
                                                                "_text_"
                                                              ;; a0 is part of first 2 rows of queried table
                                                                "a0")))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             POST /api/dashboard/:dashboard-id/card/:card-id/query                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn dashboard-card-query-url
  "The URL for a request to execute a query for a Card on a Dashboard."
  [dashboard-id card-id dashcard-id]
  (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id))

(defn- dashboard-card-query-expected-results-schema [& {:keys [row-count], :or {row-count 100}}]
  [:map
   [:database_id [:= (mt/id)]]
   [:row_count   [:= row-count]]
   [:data        [:map
                  [:rows :any]]]])

(deftest dashboard-card-query-test
  (testing "POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
    (mt/with-temp-copy-of-db
      (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard, {card-id :id} :card, {dashcard-id :id} :dashcard}]
        (letfn [(url [& {:keys [dashboard-id card-id]
                         :or   {dashboard-id dashboard-id
                                card-id      card-id}}]
                  (dashboard-card-query-url dashboard-id card-id dashcard-id))
                (dashboard-card-query-expected-results-schema [& {:keys [row-count], :or {row-count 100}}]
                  [:map
                   [:database_id [:= (mt/id)]]
                   [:row_count   [:= row-count]]
                   [:data        [:map
                                  [:rows :any]]]])]
          (testing "Should return Card results"
            (is (malli= (dashboard-card-query-expected-results-schema)
                        (mt/user-http-request :rasta :post 202 (url))))
            (testing "Should *not* require create query permissions"
              (mt/with-no-data-perms-for-all-users!
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :no)
                (is (malli= (dashboard-card-query-expected-results-schema)
                            (mt/user-http-request :rasta :post 202 (url)))))))

          (testing "Validation"
            (testing "404s"
              (testing "Should return 404 if Dashboard doesn't exist"
                (is (= "Not found."
                       (mt/user-http-request :rasta :post 404 (url :dashboard-id Integer/MAX_VALUE)))))
              (testing "Should return 404 if Card doesn't exist"
                (is (= "Not found."
                       (mt/user-http-request :rasta :post 404 (url :card-id Integer/MAX_VALUE))))))

            (testing "perms"
              (mt/with-temp [:model/Collection {collection-id :id}]
                (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
                (testing "Should return error if current User doesn't have read perms for the Dashboard"
                  (mt/with-temp-vals-in-db :model/Dashboard dashboard-id {:collection_id collection-id}
                    (is (= "You don't have permissions to do that."
                           (mt/user-http-request :rasta :post 403 (url))))))
                (testing "Should return error if current User doesn't have query perms for the Card"
                  (mt/with-temp-vals-in-db :model/Card card-id {:collection_id collection-id}
                    (is (= "You don't have permissions to do that."
                           (mt/user-http-request :rasta :post 403 (url))))))))))))))

;; see also [[metabase.query-processor.dashboard-test]]
(deftest dashboard-card-query-parameters-test
  (testing "POST /api/dashboard/:dashboard-id/card/:card-id/query"
    (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard, {card-id :id} :card, {dashcard-id :id} :dashcard}]
      (let [url (dashboard-card-query-url dashboard-id card-id dashcard-id)]
        (testing "parameters"
          (testing "Should respect valid parameters"
            (is (malli= (dashboard-card-query-expected-results-schema :row-count 6)
                        (mt/user-http-request :rasta :post 202 url
                                              {:parameters [{:id    "_PRICE_"
                                                             :value 4}]})))
            (is (malli= (dashboard-card-query-expected-results-schema :row-count 100)
                        (mt/user-http-request :rasta :post 202 url
                                              {:parameters [{:id    "_PRICE_"
                                                             :value nil}]})))
            (testing "New parameter types"
              (testing :number/=
                (is (malli= (dashboard-card-query-expected-results-schema :row-count 94)
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
            (is (= {:errors {:parameters "nullable sequence of value must be a parameter map with an 'id' key"},
                    :specific-errors {:parameters ["invalid type, received: {:_PRICE_ 3}"]}}
                   (mt/user-http-request :rasta :post 400 url
                                         {:parameters {"_PRICE_" 3}}))))
          (testing "Should ignore parameters that are valid for the Dashboard but not part of this Card (no mapping)"
            (testing "Sanity check"
              (is (malli= (dashboard-card-query-expected-results-schema :row-count 6)
                          (mt/user-http-request :rasta :post 202 url
                                                {:parameters [{:id    "_PRICE_"
                                                               :value 4}]}))))
            (mt/with-temp-vals-in-db :model/DashboardCard dashcard-id {:parameter_mappings []}
              (is (malli= (dashboard-card-query-expected-results-schema :row-count 100)
                          (mt/user-http-request :rasta :post 202 url
                                                {:parameters [{:id    "_PRICE_"
                                                               :value 4}]})))))

          ;; don't let people try to be sneaky and get around our validation by passing in a different `:target`
          (testing "Should ignore incorrect `:target` passed in to API endpoint"
            (is (malli= (dashboard-card-query-expected-results-schema :row-count 6)
                        (mt/user-http-request :rasta :post 202 url
                                              {:parameters [{:id     "_PRICE_"
                                                             :target [:dimension [:field (mt/id :venues :id) nil]]
                                                             :value  4}]})))))))))

;; see also [[metabase.query-processor.dashboard-test]]
(deftest dashboard-native-card-query-parameters-test
  (testing "POST /api/dashboard/:dashboard-id/card/:card-id/query"
    (mt/dataset test-data
      (let [query (mt/native-query {:query         "SELECT * FROM \"PRODUCTS\" WHERE {{cat}}"
                                    :template-tags {"cat" {:id           "__cat__"
                                                           :name         "cat"
                                                           :display-name "Cat"
                                                           :type         :dimension
                                                           :dimension    [:field (mt/id :products :category) nil]
                                                           :widget-type  :string/=
                                                           :default      ["Gizmo"]}}})]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query query}
                       :model/Dashboard     {dashboard-id :id} {:parameters [{:name      "Text"
                                                                              :slug      "text"
                                                                              :id        "_text_"
                                                                              :type      "string/="
                                                                              :sectionId "string"
                                                                              :default   ["Doohickey"]}]}
                       :model/DashboardCard {dashcard-id :id} {:parameter_mappings     [{:parameter_id "_text_"
                                                                                         :card_id      card-id
                                                                                         :target       [:dimension [:template-tag "cat"]]}]
                                                               :card_id                card-id
                                                               :visualization_settings {}
                                                               :dashboard_id           dashboard-id}]
          (let [url (dashboard-card-query-url dashboard-id card-id dashcard-id)]
            (testing "Sanity check: we can apply a parameter to a native query"
              (is (malli= (dashboard-card-query-expected-results-schema :row-count 53)
                          (mt/user-http-request :rasta :post 202 url
                                                {:parameters [{:id    "_text_"
                                                               :value ["Gadget"]}]}))))
            (testing "if the parameter is specified with a nil value the default should not apply"
              (is (malli= (dashboard-card-query-expected-results-schema :row-count 200)
                          (mt/user-http-request :rasta :post 202 url
                                                {:parameters [{:id    "_text_"
                                                               :value nil}]}))))
            (testing "if the parameter isn't specified the default should apply"
              (is (malli= (dashboard-card-query-expected-results-schema :row-count 51)
                          (mt/user-http-request :rasta :post 202 url
                                                {:parameters []}))))))))))

(defn- parse-export-format-results [^bytes results export-format]
  (with-open [is (java.io.ByteArrayInputStream. results)]
    (streaming.test-util/parse-result export-format is)))

(deftest dashboard-card-query-export-format-test
  (testing "POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"
    (mt/test-helpers-set-global-values!
      (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard, {card-id :id} :card, {dashcard-id :id} :dashcard}]
        (doseq [export-format [:csv :json :xlsx]
                body-type     [:json :form-encoded]]
          (testing (format "Export format = %s JSON body type = %s" export-format body-type)
            (let [url (format "%s/%s" (dashboard-card-query-url dashboard-id card-id dashcard-id) (name export-format))
                  params [{:id    "_PRICE_"
                           :value 4}]]
              (is (= (streaming.test-util/process-query-basic-streaming
                      export-format
                      (mt/mbql-query venues {:filter [:= $price 4]}))
                     (parse-export-format-results
                      (mt/user-real-request :rasta :post 200 url
                                            {:request-options {:as      :byte-array
                                                               :headers {"content-type" (case body-type
                                                                                          :json         "application/json"
                                                                                          :form-encoded "application/x-www-form-urlencoded")}}}
                                            {:format_rows true
                                             :parameters  (cond-> params
                                                            (= body-type :form-encoded) json/encode)})
                      export-format))))))))))

(defn- dashcard-pivot-query-endpoint [dashboard-id card-id dashcard-id]
  (format "dashboard/pivot/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id))

(deftest dashboard-card-query-pivot-test
  (testing "POST /api/dashboard/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
    (mt/test-drivers (api.pivots/applicable-drivers)
      (mt/dataset test-data
        (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                       :model/Card          {card-id :id} (api.pivots/pivot-card)
                       :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id :card_id card-id}]
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
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id action-id
                                                                 :card_id model-id}]
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
                (is (=? {:message #"Error executing Action: .* Error building query parameter map: Error determining value for parameter \"id\": You'll need to pick a value for 'ID' before this query can run."}
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
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id action-id
                                                                 :card_id model-id}]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                       dashboard-id
                                       dashcard-id)]
              (testing "Should be able to execute an action"
                (is (= {:the_parameter 1}
                       (mt/user-http-request :crowberto :post 200 execute-path
                                             {:parameters {"id" 1}}))))
              (testing "Should handle errors"
                (is (= {:remote-status 400
                        :message       "oops"}
                       (mt/user-http-request :crowberto :post 400 execute-path
                                             {:parameters {"id" 1 "fail" "true"}}))))
              (testing "Extra parameter should fail gracefully"
                (is (partial= {:message "No destination parameter found for #{\"extra\"}. Found: #{\"id\" \"fail\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path
                                                    {:parameters {"extra" 1}}))))
              (testing "Missing parameter should fail gracefully"
                (is (has-valid-action-execution-error-message?
                     (mt/user-http-request :crowberto :post 400 execute-path
                                           {:parameters {}}))))
              (testing "Sending an invalid number should fail gracefully"
                (is (has-valid-action-execution-error-message?
                     (mt/user-http-request :crowberto :post 400 execute-path
                                           {:parameters {"id" "BAD"}})))))))))))

(deftest dashcard-implicit-action-execution-insert-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Executing dashcard insert"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/create"}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :card_id model-id
                                                                 :action_id action-id}]
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
                                                    {:parameters {}})))))))))))

(deftest dashcard-implicit-action-execution-update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Executing dashcard update"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/update"}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :card_id model-id
                                                                 :action_id action-id}]
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
                                                    {:parameters {"id" 1}})))))))))))

(deftest dashcard-implicit-action-execution-delete-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Executing dashcard delete"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/delete"}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :card_id model-id
                                                                 :action_id action-id}]
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
      (mt/with-actions [_ {:type :model :dataset_query (mt/mbql-query users)}
                        {:keys [action-id model-id]} {:type                   :implicit
                                                      :visualization_settings {:fields {"name" {:id     "name"
                                                                                                :hidden true}}}}]
        (testing "Supplying a hidden parameter value should fail gracefully for GET /api/dashboard/:id/dashcard/:id/execute"
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id    action-id
                                                                 :card_id      model-id}]
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
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :actions) :mysql)
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
        [["types"
          (map #(dissoc % ::good ::bad) types)
          [["init"]]]]
        (mt/with-actions-enabled
          (mt/with-actions [{card-id :id} {:type :model :dataset_query (mt/mbql-query types)}
                            {:keys [action-id]} {:type :implicit :kind "row/create"}]
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                           :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                   :action_id action-id
                                                                   :card_id card-id}]
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
                  (mt/with-actions [{card-id :id} {:type :model :dataset_query (mt/mbql-query types)}
                                    {:keys [action-id]} (custom-action-for-field field-name)]
                    (mt/with-temp [:model/DashboardCard {custom-dashcard-id :id} {:dashboard_id dashboard-id
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
                  (mt/with-actions [{card-id :id} {:type :model :dataset_query (mt/mbql-query types)}
                                    {action-id :action-id} (custom-action-for-field field-name)]
                    (mt/with-temp [:model/DashboardCard {custom-dashcard-id :id} {:dashboard_id dashboard-id
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
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id action-id
                                                                 :card_id model-id}]
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
                (mt/with-no-data-perms-for-all-users!
                  (data-perms/set-database-permission! (perms-group/all-users) (mt/db) :perms/view-data :unrestricted)
                  (data-perms/set-database-permission! (perms-group/all-users) (mt/db) :perms/create-queries :no)
                  (mt/with-actions-enabled
                    (is (contains? #{{:ID 76, :NAME "Birds"}
                                     {:id 76, :name "Birds"}}
                                   (-> (mt/user-http-request :rasta :post 200 execute-path
                                                             {:parameters {"name" "Birds"}})
                                       :created-row))))))
              (testing "Works with execute rights on the DB"
                (mt/with-full-data-perms-for-all-users!
                  (mt/with-actions-enabled
                    (is (contains? #{{:ID 77, :NAME "Avians"}
                                     {:id 77, :name "Avians"}}
                                   (-> (mt/user-http-request :rasta :post 200 execute-path
                                                             {:parameters {"name" "Avians"}})
                                       :created-row)))))))))))))

(deftest dashcard-custom-action-execution-auth-test
  (mt/with-temp-copy-of-db
    (mt/with-actions-test-data
      (mt/with-actions [{:keys [action-id model-id]} {}]
        (testing "Executing dashcard with action"
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id action-id
                                                                 :card_id model-id}]
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
                (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :unrestricted
                                                               :create-queries :query-builder}}
                  (mt/with-actions-enabled
                    (is (= {:rows-affected 1}
                           (mt/user-http-request :rasta :post 200 execute-path
                                                 {:parameters {"id" 1}})))))))))))))

(deftest dashcard-execution-fetch-prefill-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Prefetching dashcard update"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :card_id model-id
                                                                 :action_id action-id}]
            (let [path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "It succeeds with appropriate parameters"
                (is (partial= {:id 1 :name "African"}
                              (mt/user-http-request :crowberto :get 200
                                                    path :parameters (json/encode {"id" 1})))))
              (testing "Missing pk parameter should fail gracefully"
                (is (partial= "Missing primary key parameter: \"id\""
                              (mt/user-http-request
                               :crowberto :get 400
                               path :parameters (json/encode {"name" 1}))))))))))))

(deftest dashcard-implicit-action-only-expose-and-allow-model-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-test-data-tables #{"venues" "categories"}
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{card-id :id} {:type :model :dataset_query (mt/mbql-query venues {:fields [$id $name]})}
                          {:keys [action-id]} {:type :implicit :kind "row/update"}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id action-id
                                                                 :card_id card-id}]
            (testing "Dashcard should only have id and name params"
              (is (partial= {:dashcards [{:action {:parameters [{:id "id"} {:id "name"}]}}]}
                            (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "Prefetch should limit to id and name"
                (let [values (mt/user-http-request :crowberto :get 200 execute-path :parameters (json/encode {:id 1}))]
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
        (mt/with-actions [{card-id :id} {:type :model, :dataset_query (mt/mbql-query venues {:fields [$id $name $price]})}
                          {:keys [action-id]} {:type :implicit
                                               :kind "row/update"
                                               :visualization_settings {:fields {"id"    {:id     "id"
                                                                                          :hidden false}
                                                                                 "name"  {:id     "name"
                                                                                          :hidden false}
                                                                                 "price" {:id     "price"
                                                                                          :hidden true}}}}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                 :action_id action-id
                                                                 :card_id card-id}]
            (testing "Dashcard should only have id and name params"
              (is (partial= {:dashcards [{:action {:parameters [{:id "id"} {:id "name"}]}}]}
                            (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" dashboard-id)))))
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute" dashboard-id dashcard-id)]
              (testing "Prefetch should only return non-hidden fields"
                (is (= {:id 1 :name "Red Medicine"} ; price is hidden
                       (mt/user-http-request :crowberto :get 200 execute-path :parameters (json/encode {:id 1})))))
              (testing "Update should only allow name"
                (is (= {:rows-updated [1]}
                       (mt/user-http-request :crowberto :post 200 execute-path {:parameters {"id" 1 "name" "Blueberries"}})))
                (is (partial= {:message "No destination parameter found for #{\"price\"}. Found: #{\"id\" \"name\"}"}
                              (mt/user-http-request :crowberto :post 400 execute-path {:parameters {"id" 1 "name" "Blueberries" "price" 1234}})))))))))))

(deftest dashcard-action-execution-granular-auth-test
  (when config/ee-available?
    (mt/with-temp-copy-of-db
      (mt/with-actions-test-data-and-actions-enabled
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (testing "Executing dashcard with action"
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                           :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                   :action_id action-id
                                                                   :card_id model-id}]
              (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                         dashboard-id
                                         dashcard-id)]
                (testing "with :advanced-permissions feature flag"
                  (mt/with-premium-features #{:advanced-permissions}
                    (testing "for non-magic group"
                      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                                     :model/PermissionsGroupMembership _ {:user_id  (mt/user->id :rasta)
                                                                          :group_id group-id}]
                        (data-perms.graph/update-data-perms-graph!* [group-id (mt/id) :view-data] :blocked)
                        (data-perms.graph/update-data-perms-graph!* [(:id (perms-group/all-users)) (mt/id) :view-data] :blocked)
                        (is (partial= {:message "You don't have permissions to do that."}
                                      (mt/user-http-request :rasta :post 403 execute-path
                                                            {:parameters {"id" 1}}))
                            "Data permissions should be required")))))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                GET /api/dashboard/:id/params/:param-key/values                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest param-values-no-field-ids-test
  (testing "Ensure param value lookup works for values where field ids are not provided, but field refs are."
    ;; This is a common case for nested queries
    (mt/dataset test-data
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-table-permission! (perms-group/all-users) (mt/id :people) :perms/create-queries :query-builder)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (let [query (mt/native-query {:query "select * from people"})]
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name       "Test Dashboard"
                                                                :parameters [{:name      "User Source"
                                                                              :slug      "user_source"
                                                                              :id        "_USER_SOURCE_"
                                                                              :type      :string/=
                                                                              :sectionId "string"}
                                                                             {:name      "City is not"
                                                                              :slug      "city_name"
                                                                              :id        "_CITY_IS_NOT_"
                                                                              :type      :string/!=
                                                                              :sectionId "string"}]}
                           :model/Card {native-card-id :id} (mt/card-with-source-metadata-for-query query)
                           :model/Card {final-card-id :id} {:dataset_query {:query    {:source-table (str "card__" native-card-id)}
                                                                            :type     :query
                                                                            :database (mt/id)}}
                           :model/DashboardCard {_ :id} {:dashboard_id       dashboard-id
                                                         :card_id            final-card-id
                                                         :parameter_mappings [{:card_id      final-card-id
                                                                               :parameter_id "_USER_SOURCE_"
                                                                               :target       [:dimension
                                                                                              [:field "SOURCE" {:base-type :type/Text}]]}
                                                                              {:card_id      final-card-id
                                                                               :parameter_id "_CITY_IS_NOT_"
                                                                               :target       [:dimension
                                                                                              [:field "CITY" {:base-type :type/Text}]]}]}]
              (let [param    "_USER_SOURCE_"
                    url      (str "dashboard/" dashboard-id "/params/" param "/values")
                    response (mt/user-http-request :rasta :get 200 url)]
                (is (= {:values          [["Affiliate"] ["Facebook"] ["Google"] ["Organic"] ["Twitter"]]
                        :has_more_values false}
                       response)))
              (let [param    "_CITY_IS_NOT_"
                    url      (str "dashboard/" dashboard-id "/params/" param "/values")
                    response (mt/user-http-request :rasta :get 200 url)]
                (is (= {:values          [["Abbeville"] ["Aberdeen"] ["Abilene"] ["Abiquiu"] ["Ackworth"]]
                        :has_more_values true}
                       (update response :values (partial take 5))))))))))))

(deftest param-values-expression-test
  (testing "Ensure param value lookup works for when the value is an expression"
    (mt/dataset test-data
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name       "Test Dashboard"
                                                              :parameters [{:name      "Vendor Title"
                                                                            :slug      "vendor_title"
                                                                            :id        "_VENDOR_TITLE_"
                                                                            :type      :string/=
                                                                            :sectionId "string"}]}
                         :model/Card {base-card-id :id} {:dataset_query {:database (mt/id)
                                                                         :type     :query
                                                                         :query    {:source-table (mt/id :products)}}}
                         :model/Card {final-card-id :id} {:dataset_query {:database (mt/id)
                                                                          :type     :query
                                                                          :query    {:expressions  {"VendorTitle" [:concat
                                                                                                                   [:field
                                                                                                                    "VENDOR"
                                                                                                                    {:base-type :type/Text}]
                                                                                                                   "🦜🦜🦜"
                                                                                                                   [:field
                                                                                                                    "TITLE"
                                                                                                                    {:base-type :type/Text}]]},
                                                                                     :source-table (format "card__%s" base-card-id)}}}
                         :model/DashboardCard {_ :id} {:dashboard_id       dashboard-id
                                                       :card_id            final-card-id
                                                       :parameter_mappings [{:card_id      final-card-id
                                                                             :parameter_id "_VENDOR_TITLE_"
                                                                             :target       [:dimension [:expression "VendorTitle"]]}]}]
            (let [param "_VENDOR_TITLE_"
                  url   (str "dashboard/" dashboard-id "/params/" param "/values")
                  {:keys [values has_more_values]} (mt/user-http-request :rasta :get 200 url)]
              (is (false? has_more_values))
              (testing "We have values and they all match the expression concatenation"
                (is (pos? (count values)))
                (is (every? (partial re-matches #"[^🦜]+🦜🦜🦜[^🦜]+") (map first values)))))))))))

(deftest param-values-permissions-test
  (testing "Users without permissions should not see all options in a dashboard filter (private#196)"
    (when config/ee-available?
      (mt/with-premium-features #{:advanced-permissions}
        (mt/with-temp-copy-of-db
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
            (testing "Return values with access"
              (is (=? {:values (comp #(contains? % ["African"]) set)}
                      (mt/user-http-request :rasta :get 200
                                            (str "dashboard/" (:id dashboard) "/params/" (:category-name param-keys) "/values")))))
            (testing "Return values with no self-service (#26874)"
              (mt/with-no-data-perms-for-all-users!
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :no)
                (is (=? {:values (comp #(contains? % ["African"]) set)}
                        (mt/user-http-request :rasta :get 200
                                              (str "dashboard/" (:id dashboard) "/params/" (:category-name param-keys) "/values"))))))
            (testing "Return values for admin"
              (data-perms.graph/update-data-perms-graph!* [(:id (perms-group/all-users)) (mt/id) :view-data] :blocked)
              (is (=? {:values (comp #(contains? % ["African"]) set)}
                      (mt/user-http-request :crowberto :get 200
                                            (str "dashboard/" (:id dashboard) "/params/" (:category-name param-keys) "/values")))))
            (testing "Don't return with block perms."
              (data-perms.graph/update-data-perms-graph!* [(:id (perms-group/all-users)) (mt/id) :view-data] :blocked)
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403
                                           (str "dashboard/" (:id dashboard) "/params/" (:category-name param-keys) "/values")))))))))))

(deftest param-value-remapping-test
  (let [id-param-id   "id-param-id"
        list-param-id "static-labeled-list"]
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:parameters [{:name      "ID"
                                                                      :id        id-param-id
                                                                      :type      :id}
                                                                     {:name                 "Static Category label"
                                                                      :id                   list-param-id
                                                                      :type                 "category"
                                                                      :values_source_type   "static-list"
                                                                      :values_source_config {:values [["A frican" "Af"]
                                                                                                      ["American" "Am"]
                                                                                                      ["A   sian" "As"]]}}]}
                   :model/Card {orders-card-id :id} {:dataset_query (mt/mbql-query orders)}
                   :model/Card {people-card-id :id} {:dataset_query (mt/mbql-query people)}
                   :model/DashboardCard _ {:dashboard_id       dashboard-id
                                           :card_id            orders-card-id
                                           :parameter_mappings [{:parameter_id id-param-id
                                                                 :card_id      orders-card-id
                                                                 :target       [:dimension [:field
                                                                                            (mt/id :orders :user_id)
                                                                                            {:base-type :type/Integer}]
                                                                                {:stage-number 0}]}]}
                   :model/DashboardCard _ {:dashboard_id       dashboard-id
                                           :card_id            people-card-id
                                           :parameter_mappings [{:parameter_id id-param-id
                                                                 :card_id      people-card-id
                                                                 :target       [:dimension [:field
                                                                                            (mt/id :people :id)
                                                                                            {:base-type :type/Integer}]
                                                                                {:stage-number 0}]}]}]
      (let [url #(str "dashboard/" dashboard-id "/params/" %1 "/remapping?value=" %2)]
        (is (= [1 "Hudson Borer"]
               (mt/user-http-request :crowberto :get 200 (url id-param-id 1))))
        (is (= [(str Integer/MAX_VALUE)]
               (mt/user-http-request :crowberto :get 200 (url id-param-id Integer/MAX_VALUE))))
        (is (= ["A   sian" "As"]
               (mt/user-http-request :crowberto :get 200 (url list-param-id "A   sian"))))))))

(deftest broken-subscription-data-logic-test
  (testing "Ensure underlying logic of fixing broken pulses works (#30100)"
    (let [{param-id :id :as param} {:name "Source"
                                    :slug "source"
                                    :id   "_SOURCE_PARAM_ID_"
                                    :type :string/=}]
      (mt/dataset test-data
        (mt/with-temp
          [:model/Card {card-id :id} {:name          "Native card"
                                      :database_id   (mt/id)
                                      :dataset_query {:database (mt/id)
                                                      :type     :query
                                                      :query    {:source-table (mt/id :people)}}
                                      :type          :model}
           :model/Dashboard {dash-id :id} {:name "My Awesome Dashboard"}
           :model/DashboardCard {dash-card-id :id} {:dashboard_id dash-id
                                                    :card_id      card-id}
           ;; Broken pulse
           :model/Pulse {bad-pulse-id :id
                         :as          bad-pulse} {:name         "Bad Pulse"
                                                  :dashboard_id dash-id
                                                  :creator_id   (mt/user->id :trashbird)
                                                  :parameters   [(assoc param :value ["Twitter", "Facebook"])]}
           :model/PulseCard _ {:pulse_id          bad-pulse-id
                               :card_id           card-id
                               :dashboard_card_id dash-card-id}
           :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                       :pulse_id     bad-pulse-id
                                                       :enabled      true}
           :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                           :user_id          (mt/user->id :rasta)}
           :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                           :user_id          (mt/user->id :crowberto)}
           ;; Broken slack pulse
           :model/Pulse {bad-slack-pulse-id :id} {:name         "Bad Slack Pulse"
                                                  :dashboard_id dash-id
                                                  :creator_id   (mt/user->id :trashbird)
                                                  :parameters   [(assoc param :value ["LinkedIn"])]}
           :model/PulseCard _ {:pulse_id          bad-slack-pulse-id
                               :card_id           card-id
                               :dashboard_card_id dash-card-id}
           :model/PulseChannel _ {:channel_type :slack
                                  :pulse_id     bad-slack-pulse-id
                                  :details      {:channel "#my-channel"}
                                  :enabled      true}
           ;; Non broken pulse
           :model/Pulse {good-pulse-id :id} {:name         "Good Pulse"
                                             :dashboard_id dash-id
                                             :creator_id   (mt/user->id :trashbird)}
           :model/PulseCard _ {:pulse_id          good-pulse-id
                               :card_id           card-id
                               :dashboard_card_id dash-card-id}
           :model/PulseChannel {good-pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     good-pulse-id
                                                            :enabled      true}
           :model/PulseChannelRecipient _ {:pulse_channel_id good-pulse-channel-id
                                           :user_id          (mt/user->id :rasta)}
           :model/PulseChannelRecipient _ {:pulse_channel_id good-pulse-channel-id
                                           :user_id          (mt/user->id :crowberto)}]
          (testing "We can identify the broken parameter ids"
            (is (=? [{:archived     false
                      :name         "Bad Pulse"
                      :creator_id   (mt/user->id :trashbird)
                      :id           bad-pulse-id
                      :parameters
                      [{:name "Source" :slug "source" :id "_SOURCE_PARAM_ID_" :type "string/=" :value ["Twitter" "Facebook"]}]
                      :dashboard_id dash-id}
                     {:archived     false
                      :name         "Bad Slack Pulse"
                      :creator_id   (mt/user->id :trashbird)
                      :id           bad-slack-pulse-id
                      :parameters   [{:name  "Source"
                                      :slug  "source"
                                      :id    "_SOURCE_PARAM_ID_"
                                      :type  "string/="
                                      :value ["LinkedIn"]}],
                      :dashboard_id dash-id}]
                    (#'api.dashboard/broken-pulses dash-id {param-id param}))))
          (testing "We can gather all needed data regarding broken params"
            (let [bad-pulses    (mapv
                                 #(update % :affected-users (partial sort-by :email))
                                 (#'api.dashboard/broken-subscription-data dash-id {param-id param}))
                  bad-pulse-ids (set (map :pulse-id bad-pulses))]
              (testing "We only detect the bad pulse and not the good one"
                (is (true? (contains? bad-pulse-ids bad-pulse-id)))
                (is (false? (contains? bad-pulse-ids good-pulse-id))))
              (is (=? [{:pulse-creator     {:email "trashbird@metabase.com"}
                        :dashboard-creator {:email "rasta@metabase.com"}
                        :pulse-id          bad-pulse-id
                        :pulse-name        "Bad Pulse"
                        :dashboard-id      dash-id
                        :bad-parameters    [{:name "Source" :value ["Twitter" "Facebook"]}]
                        :dashboard-name    "My Awesome Dashboard"
                        :affected-users    [{:notification-type :email
                                             :recipient         "Crowberto Corv"}
                                            {:notification-type :email
                                             :recipient         "Rasta Toucan"}]}
                       {:pulse-creator     {:email "trashbird@metabase.com"}
                        :affected-users    [{:notification-type :slack
                                             :recipient         "#my-channel"}]
                        :dashboard-creator {:email "rasta@metabase.com"}
                        :pulse-id          bad-slack-pulse-id
                        :pulse-name        "Bad Slack Pulse"
                        :dashboard-id      dash-id
                        :bad-parameters    [{:name  "Source"
                                             :slug  "source"
                                             :id    "_SOURCE_PARAM_ID_"
                                             :type  "string/="
                                             :value ["LinkedIn"]}]
                        :dashboard-name    "My Awesome Dashboard"}]
                      bad-pulses))))
          (testing "Pulse can be archived"
            (testing "Pulse starts as unarchived"
              (is (false? (:archived bad-pulse))))
            (testing "Pulse is now archived"
              (is (true? (:archived (models.pulse/update-pulse! {:id bad-pulse-id :archived true})))))))))))

(deftest handle-broken-subscriptions-due-to-bad-parameters-test
  (testing "When a subscriptions is broken, archive it and notify the dashboard and subscription creator (#30100)"
    (let [param {:name "Source"
                 :slug "source"
                 :id   "_SOURCE_PARAM_ID_"
                 :type :string/=}]
      (mt/dataset test-data
        (mt/with-temp
          [:model/Card {card-id :id} {:name          "Native card"
                                      :database_id   (mt/id)
                                      :dataset_query {:database (mt/id)
                                                      :type     :query
                                                      :query    {:source-table (mt/id :people)
                                                                 :limit        5
                                                                 :fields       [[:field (mt/id :people :id)
                                                                                 {:base-type :type/BigInteger}]
                                                                                [:field (mt/id :people :name)
                                                                                 {:base-type :type/Text}]
                                                                                [:field (mt/id :people :source)
                                                                                 {:base-type :type/Text}]]}}
                                      :type          :model}
           :model/Dashboard {dash-id        :id
                             dashboard-name :name} {:name       "My Awesome Dashboard"
                                                    :parameters [param]}
           :model/DashboardCard {dash-card-id :id} {:dashboard_id       dash-id
                                                    :card_id            card-id
                                                    :parameter_mappings [{:parameter_id "_SOURCE_PARAM_ID_"
                                                                          :card_id      card-id
                                                                          :target       [:dimension
                                                                                         [:field (mt/id :people :source)
                                                                                          {:base-type :type/Text}]]}]}

           :model/Pulse {bad-pulse-id :id} {:name         "Bad Pulse"
                                            :dashboard_id dash-id
                                            :creator_id   (mt/user->id :trashbird)
                                            :parameters   [(assoc param :value ["Twitter", "Facebook"])]}
           :model/PulseCard _ {:pulse_id          bad-pulse-id
                               :card_id           card-id
                               :dashboard_card_id dash-card-id}
           :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                       :pulse_id     bad-pulse-id
                                                       :enabled      true}
           :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                           :user_id          (mt/user->id :rasta)}
           :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                           :user_id          (mt/user->id :crowberto)}
           ;; Broken slack pulse
           :model/Pulse {bad-slack-pulse-id :id} {:name         "Bad Slack Pulse"
                                                  :dashboard_id dash-id
                                                  :creator_id   (mt/user->id :trashbird)
                                                  :parameters   [(assoc param :value ["LinkedIn"])]}
           :model/PulseCard _ {:pulse_id          bad-slack-pulse-id
                               :card_id           card-id
                               :dashboard_card_id dash-card-id}
           :model/PulseChannel _ {:channel_type :slack
                                  :pulse_id     bad-slack-pulse-id
                                  :details      {:channel "#my-channel"}
                                  :enabled      true}
           ;; Non broken pulse
           :model/Pulse {good-pulse-id :id} {:name         "Good Pulse"
                                             :dashboard_id dash-id
                                             :creator_id   (mt/user->id :trashbird)}
           :model/PulseCard _ {:pulse_id          good-pulse-id
                               :card_id           card-id
                               :dashboard_card_id dash-card-id}
           :model/PulseChannel {good-pulse-channel-id :id} {:channel_type :email
                                                            :pulse_id     good-pulse-id
                                                            :enabled      true}
           :model/PulseChannelRecipient _ {:pulse_channel_id good-pulse-channel-id
                                           :user_id          (mt/user->id :rasta)}
           :model/PulseChannelRecipient _ {:pulse_channel_id good-pulse-channel-id
                                           :user_id          (mt/user->id :crowberto)}]
          (testing "The pulses are active"
            (is (false? (t2/select-one-fn :archived :model/Pulse bad-pulse-id)))
            (is (false? (t2/select-one-fn :archived :model/Pulse good-pulse-id))))
          (mt/with-fake-inbox
            (let [{:keys [parameters]} (dashboard-response (mt/user-http-request
                                                            :rasta :put 200 (str "dashboard/" dash-id)
                                                            {:parameters []}))
                  title            (format "Subscription to %s removed" dashboard-name)
                  ;; Keep only the relevant messages. If not, you might get some other side-effecting email, such
                  ;; as "We've Noticed a New Metabase Login, Rasta".
                  inbox            (update-vals
                                    @mt/inbox
                                    (fn [messages]
                                      (filterv (comp #{title} :subject) messages)))
                  emails-received? (fn [recipient-email]
                                     (testing "The first email was received"
                                       (is (true? (some-> (get-in inbox [recipient-email 0 :body 0 :content])
                                                          (str/includes? title)))))
                                     (testing "The second email (about the broken slack pulse) was received"
                                       (is (true? (some-> (get-in inbox [recipient-email 1 :body 0 :content])
                                                          (str/includes? "#my-channel"))))))]
              (testing "The dashboard parameters were removed"
                (is (empty? parameters)))
              (testing "The broken pulse was archived"
                (is (true? (t2/select-one-fn :archived :model/Pulse bad-pulse-id))))
              (testing "The unbroken pulse is still active"
                (is (false? (t2/select-one-fn :archived :model/Pulse good-pulse-id))))
              (testing "The dashboard and pulse creators were emailed about the removed pulse"
                (is (= #{"trashbird@metabase.com" "rasta@metabase.com"}
                       (set (keys inbox)))))
              (testing "Notification emails were sent to the dashboard and pulse creators"
                (emails-received? "rasta@metabase.com")
                (emails-received? "trashbird@metabase.com")))))))))

(deftest run-mlv2-dashcard-query-test
  (testing "POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id"
    (testing "Should be able to run a query for a DashCard with an MLv2 query (#39024)"
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            venues            (lib.metadata/table metadata-provider (mt/id :venues))
            query             (-> (lib/query metadata-provider venues)
                                  (lib/order-by (lib.metadata/field metadata-provider (mt/id :venues :id)))
                                  (lib/limit 2))]
        (mt/with-temp [:model/Card          {card-id :id}      {:dataset_query query}
                       :model/Dashboard     {dashboard-id :id} {}
                       :model/DashboardCard {dashcard-id :id}  {:card_id card-id, :dashboard_id dashboard-id}]
          (is (=? {:data {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]
                                 [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]}}
                  (mt/user-http-request :crowberto :post 202 (dashboard-card-query-url dashboard-id card-id dashcard-id)))))))))

(deftest ^:parallel format-export-middleware-test
  (testing "The `:format-export?` query processor middleware has the intended effect on file exports."
    (let [q             {:database (mt/id)
                         :type     :native
                         :native   {:query "SELECT 2000 AS number, '2024-03-26'::DATE AS date;"}}
          output-helper {:csv  (fn [output] (->> output csv/read-csv last))
                         :json (fn [output] (->> output (map (juxt :NUMBER :DATE)) last))}]
      (mt/with-temp [:model/Card {card-id :id} {:display :table :dataset_query q}
                     :model/Dashboard {dashboard-id :id} {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                             :card_id      card-id}]
        (doseq [[export-format apply-formatting? expected] [[:csv true ["2,000" "March 26, 2024"]]
                                                            [:csv false ["2000" "2024-03-26"]]
                                                            [:json true ["2,000" "March 26, 2024"]]
                                                            [:json false [2000 "2024-03-26"]]]]
          (testing (format "export_format %s yields expected output for %s exports." apply-formatting? export-format)
            (is (= expected
                   (->> (mt/user-http-request
                         :crowberto :post 200
                         (format "/dashboard/%s/dashcard/%s/card/%s/query/%s" dashboard-id dashcard-id card-id (name export-format))
                         {:format_rows apply-formatting?})
                        ((get output-helper export-format)))))))))))

(deftest can-restore
  (let [can-restore? (fn [dash-id user]
                       (:can_restore (mt/user-http-request user :get 200 (str "dashboard/" dash-id))))]
    (testing "I can restore a simply trashed dashboard"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "A"}
                     :model/Dashboard {dash-id :id} {:name          "My Dashboard"
                                                     :collection_id coll-id}]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id) {:archived true})
        (is (true? (can-restore? dash-id :rasta)))))
    (testing "I can't restore a trashed dashboard if the coll it was from was trashed"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "A"}
                     :model/Dashboard {dash-id :id} {:name          "My Dashboard"
                                                     :collection_id coll-id}]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id) {:archived true})
        (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id) {:archived true})
        (is (false? (can-restore? dash-id :rasta)))))
    (testing "I can't restore a trashed dashboard if it isn't archived in the first place"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "A"}
                     :model/Dashboard {dash-id :id} {:name          "My Dashboard"
                                                     :collection_id coll-id}]
        (is (false? (can-restore? dash-id :crowberto)))))))

(deftest dependent-metadata-test
  (mt/with-temp
    [:model/Dashboard           {dashboard-id :id}  {}
     :model/Dashboard           {link-dash :id}     {}
     :model/Card                {link-card :id}     {:dataset_query (mt/mbql-query reviews)
                                                     :database_id (mt/id)}
     :model/Card                {card-id-1 :id}     {:dataset_query (mt/mbql-query products)
                                                     :database_id (mt/id)}
     :model/Card                {card-id-2 :id}     {:dataset_query
                                                     {:type     :native
                                                      :native   {:query "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */"
                                                                 :template-tags
                                                                 {"id"      {:name         "id"
                                                                             :display-name "Id"
                                                                             :id           "_id_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :people :id) nil]
                                                                             :widget-type  :id
                                                                             :default      nil}
                                                                  "name"    {:name         "name"
                                                                             :display-name "Name"
                                                                             :id           "_name_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :people :name) nil]
                                                                             :widget-type  :category
                                                                             :default      nil}
                                                                  "source"  {:name         "source"
                                                                             :display-name "Source"
                                                                             :id           "_source_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :people :source) nil]
                                                                             :widget-type  :category
                                                                             :default      nil}
                                                                  "user_id" {:name         "user_id"
                                                                             :display-name "User"
                                                                             :id           "_user_id_"
                                                                             :type         :dimension
                                                                             :dimension    [:field (mt/id :orders :user_id) nil]
                                                                             :widget-type  :id
                                                                             :default      nil}}}
                                                      :database (mt/id)}
                                                     :query_type :native
                                                     :database_id (mt/id)}
     :model/DashboardCard       {dashcard-id-1 :id} {:dashboard_id dashboard-id,
                                                     :card_id card-id-1
                                                     :visualization_settings {:column_settings
                                                                              {"[\"name\", 0]" ;; FE reference that must be json formatted
                                                                               {:click_behavior {:type :link
                                                                                                 :linkType "dashboard"
                                                                                                 :targetId link-dash}}}}}
     :model/DashboardCard       _                   {:dashboard_id dashboard-id,
                                                     :card_id card-id-2
                                                     :visualization_settings {:click_behavior {:type :link
                                                                                               :linkType "question"
                                                                                               :targetId link-card}}}
     :model/Card                {series-id-1 :id}   {:name "Series Card 1"
                                                     :dataset_query (mt/mbql-query checkins)
                                                     :database_id (mt/id)}
     :model/Card                {series-id-2 :id}   {:name "Series Card 2"
                                                     :dataset_query (mt/mbql-query venues)
                                                     :database_id (mt/id)}
     :model/DashboardCardSeries _                   {:dashboardcard_id dashcard-id-1,
                                                     :card_id series-id-1
                                                     :position 0}
     :model/DashboardCardSeries _                   {:dashboardcard_id dashcard-id-1,
                                                     :card_id series-id-2
                                                     :position 1}]
    (is (=?
         {:fields (sort-by :id
                           [{:id (mt/id :people :id)}
                            {:id (mt/id :orders :user_id)}
                            {:id (mt/id :people :source)}
                            {:id (mt/id :people :name)}])
          :tables (concat (sort-by :id
                                   [{:id (mt/id :categories)}
                                    {:id (mt/id :users)}
                                    {:id (mt/id :checkins)}
                                    {:id (mt/id :reviews)}
                                    {:id (mt/id :products)
                                     :fields sequential?}
                                    {:id (mt/id :venues)}])
                          (sort-by :id
                                   [{:id (str "card__" card-id-2)
                                     :fields sequential?}]))
          :cards [{:id link-card}]
          :databases [{:id (mt/id) :engine string?}]
          :dashboards [{:id link-dash}]}
         (mt/user-http-request :crowberto :get 200 (str "dashboard/" dashboard-id "/query_metadata"))))))

(deftest dashboard-query-metadata-with-archived-and-deleted-source-card-test
  (testing "Don't throw an error if source card is deleted (#48461)"
    (mt/with-temp
      [:model/Card          {card-id-1 :id}    {:dataset_query (mt/mbql-query products)}
       :model/Card          {card-id-2 :id}    {:dataset_query {:type     :query
                                                                :query    {:source-table (str "card__" card-id-1)}}}
       :model/Dashboard     {dashboard-id :id} {}
       :model/DashboardCard _                  {:card_id      card-id-2
                                                :dashboard_id dashboard-id}]

      (letfn [(query-metadata []
                (-> (mt/user-http-request :crowberto :get 200 (str "dashboard/" dashboard-id "/query_metadata"))
                    (api.test-util/select-query-metadata-keys-for-debugging)))]
        (api.test-util/before-and-after-deleted-card
         card-id-1
         #(testing "Before delete"
            (is (=?
                 {:cards      empty?
                  :fields     empty?
                  :dashboards empty?
                  :tables     [{:id (str "card__" card-id-1)}]
                  :databases  [{:id (mt/id) :engine string?}]}
                 (query-metadata))))
         #(testing "After delete"
            (is (=? {:cards      empty?
                     :fields     empty?
                     :dashboards empty?
                     :tables     empty?
                     :databases  empty?}
                    (query-metadata)))))))))

(deftest dashboard-query-metadata-no-tables-test
  (testing "Don't throw an error if users doesn't have access to any tables #44043"
    (let [original-can-read? mi/can-read?]
      (mt/with-temp [:model/Dashboard dash {}]
        (with-redefs [mi/can-read? (fn [& args]
                                     (if (= :model/Table (apply mi/dispatch-on-model args))
                                       false
                                       (apply original-can-read? args)))]
          (is (map? (mt/user-http-request :crowberto :get 200 (format "dashboard/%d/query_metadata" (:id dash))))))))))

(deftest dashboard-field-params-field-names-test
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
     :model/DashboardCard _         {:dashboard_id       (:id dash)
                                     :card_id            (:id card)
                                     :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                           :target       [:dimension (mt/$ids *categories.name)]}]}]
    (is (=? {:param_fields {(keyword "_CATEGORY_NAME_")
                            [{:semantic_type "type/Name",
                              :table_id (mt/id :categories)
                              :name "NAME",
                              :has_field_values "list",
                              :fk_target_field_id nil,
                              :dimensions (),
                              :id (mt/id :categories :name)
                              :target nil,
                              :display_name "Name",
                              :name_field nil,
                              :base_type "type/Text"}]}}
            (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" (:id dash)))))
    (is (=? {:values #(set/subset? #{["African"] ["BBQ"]} (set %1))}
            (mt/user-http-request :crowberto :get 200 (format "dashboard/%d/params/%s/values" (:id dash) "_CATEGORY_NAME_"))))))

(deftest ^:synchronized dashboard-query-metadata-cached-test
  (let [original-admp   @#'lib.metadata.jvm/application-database-metadata-provider-factory
        uncached-calls  (atom -1)
        expected        [{:name "Some dashboard"}
                         {:tables     [{} {}]
                          :databases  [{}]
                          :fields     []
                          :cards      []
                          :dashboards []}]]
    (mt/with-temp [:model/Dashboard     dash      {:name "Some dashboard"}
                   :model/Card          card      {:name "Card attached to dashcard"
                                                   :dataset_query {:database (mt/id)
                                                                   :type     :query
                                                                   :query    {:source-table (mt/id :categories)}}
                                                   :type :model}
                   :model/DashboardCard _         {:dashboard_id       (:id dash)
                                                   :card_id            (:id card)}]
      (testing "uncached request - get the baseline call count"
        (t2/with-call-count [call-count-fn]
          (is (=? expected
                  [(mt/user-http-request :crowberto :get 200 (format "dashboard/%d" (:id dash)))
                   (mt/user-http-request :crowberto :get 200 (format "dashboard/%d/query_metadata" (:id dash)))]))
          (reset! uncached-calls (call-count-fn))))
      (testing "cached requests"
        (let [provider-counts (atom {})]
          (with-redefs [lib.metadata.jvm/application-database-metadata-provider-factory
                        (fn [database-id]
                          (swap! provider-counts update database-id (fnil inc 0))
                          (original-admp database-id))]
            (t2/with-call-count [call-count-fn]
              (let [load-id (str (random-uuid))]
                (is (=? expected
                        [(mt/user-http-request :crowberto :get 200 (format "dashboard/%d?dashboard_load_id=%s"
                                                                           (:id dash) load-id))
                         (mt/user-http-request :crowberto :get 200
                                               (format "dashboard/%d/query_metadata?dashboard_load_id=%s"
                                                       (:id dash) load-id))])))
              (testing "make fewer AppDB calls than uncached"
                (is (< (call-count-fn) @uncached-calls)))))
          (testing "constructs only 1 MetadataProvider in bulk mode"
            ;; It's needed to compute the query hashes, which is needed for the average duration mechanism.
            (is (= {(mt/id) 1} @provider-counts))))))))

(deftest ^:synchronized dashboard-table-prefetch-test
  (mt/with-temp
    [:model/Dashboard     d   {:name "D"}
     :model/Card          c1  {:name "C1"
                               :dataset_query {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table (mt/id :products)}}}
     :model/Card          c2  {:name "C2"
                               :dataset_query {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table (mt/id :orders)}}}
     :model/DashboardCard dc1 {:dashboard_id       (:id d)
                               :card_id            (:id c1)}
     :model/DashboardCard dc2 {:dashboard_id       (:id d)
                               :card_id            (:id c2)}]
    (let [uncached-calls-count (atom 0)
          cached-calls-count   (atom 0)]
      ;; Get _uncached_ call count of t2/select count for :metadata/table
      (mt/with-dynamic-fn-redefs [t2/select (fn [& args]
                                              (when (= :metadata/table (first args))
                                                (swap! uncached-calls-count inc))
                                              (apply (mt/dynamic-value t2/select) args))]
        (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" (:id d)))
        (mt/user-http-request :crowberto :get 200 (format "dashboard/%d/query_metadata" (:id d))))
      ;; Get _cached_ call count of t2/select count for :metadata/table
      (let [load-id (str (random-uuid))]
        (mt/with-dynamic-fn-redefs [t2/select (fn [& args]
                                                (when (= :metadata/table (first args))
                                                  (swap! cached-calls-count inc))
                                                (apply (mt/dynamic-value t2/select) args))]
          (mt/user-http-request :crowberto :get 200
                                (format "dashboard/%d?dashboard_load_id=%s" (:id d) load-id))
          (mt/user-http-request :crowberto :get 200
                                (format "dashboard/%d/query_metadata?dashboard_load_id=%s" (:id d) load-id))))
      (testing "Call count for :metadata/table is smaller with caching in place"
        ;; with disabled can_run_adhoc_query these numbers might now match. Without disabled it was 5, with disabling
        ;; it is 1
        (is (<= @cached-calls-count @uncached-calls-count)))
      ;; If we need more for _some reason_, this test should be updated accordingly.
      (testing "At most 1 db call should be executed for :metadata/tables"
        (is (<= @cached-calls-count 1)))

      (testing "dashboard card /query calls reuse metadata providers"
        (let [providers               (atom [])
              load-id                 (str (random-uuid))]
          (mt/with-dynamic-fn-redefs [lib.metadata.protocols/table (fn [mp table-id]
                                                                     (swap! providers conj mp)
                                                                     ((mt/dynamic-value lib.metadata.protocols/table) mp table-id))]
            (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query"
                                                       (:id d) (:id dc1) (:id c1))
                                  {"dashboard_load_id" load-id})
            (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query"
                                                       (:id d) (:id dc2) (:id c2))
                                  {"dashboard_load_id" load-id}))
          (let [[p & tail :as seen] @providers]
            (is (>= (count seen) 2))
            (is (every? #(identical? p %) tail))))))))

(deftest querying-a-dashboard-dashcard-updates-last-viewed-at
  (mt/test-helpers-set-global-values!
    (mt/dataset test-data
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:last_viewed_at #t "2000-01-01"}
                     :model/Card {card-id :id} {:dataset_query (mt/native-query
                                                                 {:query "SELECT COUNT(*) FROM \"ORDERS\""
                                                                  :template-tags {}})}
                     :model/DashboardCard {dashcard-id :id} {:card_id card-id
                                                             :dashboard_id dashboard-id}]
        (let [original-last-viewed-at (t2/select-one-fn :last_viewed_at :model/Dashboard dashboard-id)]
          (mt/with-temporary-setting-values [synchronous-batch-updates true]
            (mt/user-http-request :crowberto :post 202
                                  (format "dashboard/%s/dashcard/%s/card/%s/query" dashboard-id dashcard-id card-id)))
          (is (not= original-last-viewed-at (t2/select-one-fn :last_viewed_at :model/Dashboard :id dashboard-id))))))))

;; Exception during scheduled (grouper) update of UserParameterValue is thrown. It is not relevant in context
;; of tested functionality.
;; TODO: Address the exception!
(deftest dependent-dashcard-parameters-test
  (mt/with-temp [:model/Card {card-id :id} {:name "c1"
                                            :dataset_query (mt/mbql-query
                                                             orders
                                                             {:aggregation [[:count]]
                                                              :breakout
                                                              [!day.$created_at]})}
                 :model/Dashboard {dashboard-id :id} {:name "d1"
                                                      :parameters []}
                 :model/DashboardCard {dashcard-id :id} {:card_id card-id
                                                         :dashboard_id dashboard-id
                                                         :parameter_mappings []}]
    (t2/update! :model/Dashboard :id dashboard-id {:parameters [{:name "TIME Gr"
                                                                 :slug "tgr"
                                                                 :id "30d7efb0"
                                                                 :type :temporal-unit
                                                                 :sectionId "temporal-unit"}]})
    (t2/update! :model/DashboardCard :id dashcard-id {:parameter_mappings [{:parameter_id "30d7efb0"
                                                                            :type :temporal-unit
                                                                            :card_id card-id
                                                                            :target [:dimension
                                                                                     (mt/$ids orders !day.$created_at)]}]})
    (testing "Baseline"
      (is (=? [["2016-04-01T00:00:00Z" 1]
               ["2016-05-01T00:00:00Z" 19]]
              (->> (mt/user-http-request
                    :crowberto :post 202
                    (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id)
                    {:parameters [{:id "30d7efb0"
                                   :type "temporal-unit"
                                   :value "month"
                                   :target
                                   [:dimension
                                    (mt/$ids orders !day.$created_at)]}]})
                   mt/rows
                   (take 2)))))
    (mt/user-http-request
     :crowberto :put 200
     (format "card/%d" card-id)
     {:dataset_query (mt/mbql-query
                       orders
                       {:aggregation [[:count]]
                        :breakout
                        [!year.$created_at]})})
    (testing "Mapping is adjusted to new target (#49202)"
      (is (= (mt/$ids orders !year.$created_at)
             (t2/select-one-fn #(get-in % [:parameter_mappings 0 :target 1])
                               :model/DashboardCard :id dashcard-id))))))

(deftest querying-a-dashboard-returns-moderated_status
  (mt/dataset test-data
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:last_viewed_at #t "2000-01-01"}
                   :model/ModerationReview _ {:moderated_item_id dashboard-id
                                              :moderated_item_type "dashboard"
                                              :moderator_id (mt/user->id :crowberto)
                                              :most_recent true
                                              :status "verified"}]
      (is (malli= [:sequential
                   [:map
                    [:most_recent [:= true]]
                    [:moderator_id [:= (mt/user->id :crowberto)]]]]
                  (:moderation_reviews (mt/user-http-request :crowberto :get 200 (str "dashboard/" dashboard-id))))))))

(deftest dashboard-internal-cards-test
  ;; setup:
  ;; - a collection, with a dashboard in it, with two dashboard-internal cards in that dashboard:
  ;;   - one is archived, one is not
  ;; - another dashboard in the root collection
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard {dash-id :id} {:collection_id coll-id}
                 :model/Dashboard {other-dash-id :id} {}
                 :model/Card {card-id :id} {:dashboard_id dash-id}
                 :model/Card {archived-card-id :id} {:dashboard_id dash-id}
                 :model/DashboardCard {_dashcard-id :id} {:card_id card-id
                                                          :dashboard_id dash-id}]
    (mt/user-http-request :crowberto :put 200 (str "card/" archived-card-id) {:archived true})
    (testing "Cannot add a dashboard internal card to another dashboard"
      (mt/user-http-request :crowberto :put 400 (str "dashboard/" other-dash-id)
                            {:dashcards [{:id -1
                                          :size_x 1
                                          :size_y 1
                                          :row 0 :col 0
                                          :card_id card-id
                                          :dashboard_id other-dash-id}]}))
    (testing "Should archive all dashboard internal cards with their dashboard"
      (is (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id)
                                {:archived true}))
      (is (t2/select-one-fn :archived :model/Card :id card-id))
      (testing "And un-archive them with their dashboard, too"
        (is (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id)
                                  {:archived false}))
        (is (not (t2/select-one-fn :archived :model/Card :id card-id)))
        (testing "not the one that was already archived before, though!"
          (is (t2/select-one-fn :archived :model/Card :id archived-card-id)))))
    (testing "Should move dashboard internal cards to new collection along with their dashboard"
      (is (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id)
                                {:collection_id nil}))
      (is (nil? (t2/select-one-fn :collection_id :model/Card :id card-id))))
    (testing "If the dashboard is deleted, its dashboard internal cards are too"
      (t2/delete! :model/Dashboard :id dash-id)
      (is (not (t2/exists? :model/Card :dashboard_id dash-id))))))

(deftest dashboard-questions-are-archived-with-the-dashboard
  (testing "It gets archived with the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:dashboard_id dash-id}]
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id) {:archived "true"})
      (is (t2/select-one-fn :archived :model/Card card-id))))
  (testing "It gets unarchived with the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:dashboard_id dash-id}]
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id) {:archived "true"})
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id) {:archived "false"})
      (is (not (t2/select-one-fn :archived :model/Card card-id)))))
  (testing "It gets archived with the dashboard if the dashboard is archived from a collection"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:dashboard_id dash-id}]
      (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id) {:archived "true"})
      (is (t2/select-one-fn :archived :model/Dashboard dash-id))
      (is (t2/select-one-fn :archived :model/Card card-id))))
  (testing "It gets unarchived with the dashboard if the dashboard is unarchived from a collection"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:dashboard_id dash-id}]
      (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id) {:archived true})
      (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id) {:archived false})
      (is (not (t2/select-one-fn :archived :model/Dashboard dash-id)))
      (is (not (t2/select-one-fn :archived :model/Card card-id))))))

(deftest dashboard-questions-are-archived-when-unused-and-vice-versa
  (testing "The dashboard question is archived when it's removed from the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}]
      (mt/user-http-request :rasta :put 200 (str "dashboard/" dash-id) {:dashcards []})
      (is (not (t2/exists? :model/DashboardCard :card_id card-id :dashboard_id dash-id)))
      (is (t2/select-one-fn :archived :model/Card card-id))))
  (testing "The dashboard question is unarchived when it's re-added to the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:dashboard_id dash-id}]
      (is (mt/user-http-request :rasta :put 200 (str "dashboard/" dash-id) {:dashcards [{:card_id card-id
                                                                                         :id -1
                                                                                         :size_x 10
                                                                                         :size_y 10
                                                                                         :col 0 :row 0}]}))
      (is (t2/exists? :model/DashboardCard :card_id card-id :dashboard_id dash-id))
      (is (not (t2/select-one-fn :archived :model/Card card-id))))))

(deftest dashboard-items-works
  (testing "Dashboard items is empty when the dashboard is a normal dashboard w/o DQs"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}]
      (is (= {:total 0 :data [] :models [] :limit nil :offset nil}
             (mt/user-http-request :rasta :get 200 (str "dashboard/" dash-id "/items"))))))
  (testing "Dashboard items is present when the dashboard has DQs"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}]
      (is (= {:total 1
              :limit nil
              :offset nil
              :data [{:id card-id}]
              :models ["card"]}
             (update (mt/user-http-request :rasta :get 200 (str "dashboard/" dash-id "/items"))
                     :data
                     #(map (fn [card] (select-keys card [:id])) %))))))
  (testing "DQs don't appear twice even if they appear multiple times in the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}]
      (is (= {:total 1
              :data [{:id card-id}]
              :limit nil
              :offset nil
              :models ["card"]}
             (update (mt/user-http-request :rasta :get 200 (str "dashboard/" dash-id "/items"))
                     :data
                     #(map (fn [card] (select-keys card [:id])) %)))))))

(deftest dashboard-items-is-the-same-as-collection-items
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard {dash-id :id} {}
                 :model/Card _ {:collection_id coll-id}
                 :model/Card {dq-id :id} {:dashboard_id dash-id}
                 :model/DashboardCard _ {:card_id dq-id :dashboard_id dash-id}]
    (is (= (set (keys (mt/user-http-request :rasta :get 200 (str "dashboard/" dash-id "/items"))))
           (set (keys (mt/user-http-request :rasta :get 200 (str "collection/" coll-id "/items"))))))
    (is (= (set (keys (first (:data (mt/user-http-request :rasta :get 200 (str "collection/" coll-id "/items"))))))
           (set (keys (first (:data (mt/user-http-request :rasta :get 200 (str "dashboard/" dash-id "/items"))))))))))

(deftest dashboard-update-preserves-unchanged-parameter-cards-test
  (testing "PUT /api/dashboard/:id preserves parameter cards when parameters are unchanged"
    (mt/with-temp [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                                     :table_id      (mt/id :categories)
                                                     :dataset_query (mt/mbql-query categories {:limit 5})}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name                 "Category"
                                                                      :slug                 "category"
                                                                      :id                   "_CATEGORY_"
                                                                      :type                 "category"
                                                                      :values_source_type   "card"
                                                                      :values_source_config {:card_id source-card-id}}]}]
      (with-dashboards-in-writeable-collection! [dashboard-id]
        (testing "Initial parameter cards are created"
          (is (= 1 (t2/count :model/ParameterCard :parameterized_object_type "dashboard"
                             :parameterized_object_id dashboard-id))))

        (testing "Dashboard update with unchanged parameters preserves parameter cards"
          (let [original-param-cards (t2/select :model/ParameterCard
                                                :parameterized_object_type "dashboard"
                                                :parameterized_object_id dashboard-id)]
            (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                  {:name "Updated Dashboard Name"
                                   :description "New description"})

            (let [updated-param-cards (t2/select :model/ParameterCard
                                                 :parameterized_object_type "dashboard"
                                                 :parameterized_object_id dashboard-id)]
              (is (= (count original-param-cards) (count updated-param-cards)))
              (is (= (set (map :id original-param-cards))
                     (set (map :id updated-param-cards)))))))))))

(deftest dashboard-update-with-same-parameters-preserves-parameter-cards-test
  (testing "PUT /api/dashboard/:id preserves parameter cards when parameters list is identical"
    (mt/with-temp [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                                     :table_id      (mt/id :categories)
                                                     :dataset_query (mt/mbql-query categories {:limit 5})}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name                 "Category"
                                                                      :slug                 "category"
                                                                      :id                   "_CATEGORY_"
                                                                      :type                 "category"
                                                                      :values_source_type   "card"
                                                                      :values_source_config {:card_id source-card-id}}
                                                                     {:name                 "Static List"
                                                                      :slug                 "static_list"
                                                                      :id                   "_STATIC_"
                                                                      :type                 "category"
                                                                      :values_source_type   "static-list"
                                                                      :values_source_config {:values ["A" "B" "C"]}}]}]
      (with-dashboards-in-writeable-collection! [dashboard-id]
        (testing "Initial parameter cards are created for card-sourced parameters only"
          (is (= 1 (t2/count :model/ParameterCard :parameterized_object_type "dashboard"
                             :parameterized_object_id dashboard-id))))

        (testing "Dashboard update with identical parameters preserves parameter cards"
          (let [original-param-cards (t2/select :model/ParameterCard
                                                :parameterized_object_type "dashboard"
                                                :parameterized_object_id dashboard-id)
                original-parameters (:parameters (t2/select-one :model/Dashboard :id dashboard-id))]
            (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                  {:parameters original-parameters
                                   :description "Updated description"})

            (let [updated-param-cards (t2/select :model/ParameterCard
                                                 :parameterized_object_type "dashboard"
                                                 :parameterized_object_id dashboard-id)]
              (is (= (count original-param-cards) (count updated-param-cards)))
              (is (= (set (map :id original-param-cards))
                     (set (map :id updated-param-cards)))))))))))

(deftest dashboard-update-mixed-parameter-changes-test
  (testing "PUT /api/dashboard/:id correctly handles mix of unchanged and changed parameters"
    (mt/with-temp [:model/Card {source-card-id-1 :id} {:database_id   (mt/id)
                                                       :table_id      (mt/id :categories)
                                                       :dataset_query (mt/mbql-query categories {:limit 5})}
                   :model/Card {source-card-id-2 :id} {:database_id   (mt/id)
                                                       :table_id      (mt/id :venues)
                                                       :dataset_query (mt/mbql-query venues {:limit 5})}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name                 "Category"
                                                                      :slug                 "category"
                                                                      :id                   "_CATEGORY_"
                                                                      :type                 "category"
                                                                      :values_source_type   "card"
                                                                      :values_source_config {:card_id source-card-id-1}}
                                                                     {:name                 "Venue"
                                                                      :slug                 "venue"
                                                                      :id                   "_VENUE_"
                                                                      :type                 "category"
                                                                      :values_source_type   "card"
                                                                      :values_source_config {:card_id source-card-id-1}}]}]
      (with-dashboards-in-writeable-collection! [dashboard-id]
        (testing "Initial parameter cards are created"
          (is (= 2 (t2/count :model/ParameterCard :parameterized_object_type "dashboard"
                             :parameterized_object_id dashboard-id))))

        (testing "Update with one parameter unchanged, one parameter changed"
          (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                {:parameters [{:name                 "Category"
                                               :slug                 "category"
                                               :id                   "_CATEGORY_"
                                               :type                 "category"
                                               :values_source_type   "card"
                                               :values_source_config {:card_id source-card-id-1}}
                                              {:name                 "Venue"
                                               :slug                 "venue"
                                               :id                   "_VENUE_"
                                               :type                 "category"
                                               :values_source_type   "card"
                                               :values_source_config {:card_id source-card-id-2}}]})

          (let [param-cards (t2/select :model/ParameterCard
                                       :parameterized_object_type "dashboard"
                                       :parameterized_object_id dashboard-id)]
            (is (= 2 (count param-cards)))
            (is (= #{source-card-id-1 source-card-id-2}
                   (set (map :card_id param-cards))))))))))

(deftest dashboard-update-no-parameters-field-preserves-parameter-cards-test
  (testing "PUT /api/dashboard/:id preserves parameter cards when parameters field is not included in update"
    (mt/with-temp [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                                     :table_id      (mt/id :categories)
                                                     :dataset_query (mt/mbql-query categories {:limit 5})}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:name                 "Category"
                                                                      :slug                 "category"
                                                                      :id                   "_CATEGORY_"
                                                                      :type                 "category"
                                                                      :values_source_type   "card"
                                                                      :values_source_config {:card_id source-card-id}}]}]
      (with-dashboards-in-writeable-collection! [dashboard-id]
        (testing "Initial parameter cards are created"
          (is (= 1 (t2/count :model/ParameterCard :parameterized_object_type "dashboard"
                             :parameterized_object_id dashboard-id))))

        (testing "Dashboard update without parameters field preserves parameter cards"
          (let [original-param-cards (t2/select :model/ParameterCard
                                                :parameterized_object_type "dashboard"
                                                :parameterized_object_id dashboard-id)]
            ;; Update dashboard without including parameters field
            (mt/user-http-request :rasta :put 200 (str "dashboard/" dashboard-id)
                                  {:name "Updated Name"
                                   :description "Updated description"
                                   :cache_ttl 3600})

            (let [updated-param-cards (t2/select :model/ParameterCard
                                                 :parameterized_object_type "dashboard"
                                                 :parameterized_object_id dashboard-id)]
              (is (= (count original-param-cards) (count updated-param-cards)))
              (is (= (set (map :id original-param-cards))
                     (set (map :id updated-param-cards)))))))))))

(deftest ^:parallel previous-stage-test
  (testing "binding parameters to different stages is handled correctly"
    (let [mp     (mt/metadata-provider)
          ;; Two stages, both with aggregations
          base   (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     (lib/expression "tax rate" (lib// (lib.metadata/field mp (mt/id :orders :tax))
                                                       (lib.metadata/field mp (mt/id :orders :subtotal))))
                     (lib/aggregate (lib/count))
                     (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :subtotal))))
                     (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :quantity))))
                     (lib/breakout (lib.metadata/field mp (mt/id :products :category)))
                     (lib/breakout (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :orders :created_at))
                                     :month))
                     lib/append-stage)
          [category created-at _count subtotal quantity] (lib/filterable-columns base)
          ;; Second stage: filtering to those categoies and months where a category sold 100 total units;
          ;; *then* aggregating on the avg subtotal per category.
          query  (-> base
                     (lib/filter (lib/>= quantity 100))
                     (lib/aggregate (lib/avg subtotal))
                     (lib/breakout category))]
      (mt/with-temp [:model/Card          card      {:dataset_query (lib/->legacy-MBQL query)}
                     :model/Dashboard     dashboard {:parameters [{:name      "Category"
                                                                   :slug      "category"
                                                                   :id        "_CATEGORY_"
                                                                   :type      "string/="
                                                                   :sectionId "string"
                                                                   :default   ["Doohickey"]}
                                                                  {:name      "Max Tax"
                                                                   :slug      "max_tax"
                                                                   :id        "_MAX_TAX_"
                                                                   :type      "number/<="
                                                                   :sectionId "number"}
                                                                  {:name      "Quarter"
                                                                   :slug      "quarter"
                                                                   :id        "_CREATED_AT_"
                                                                   :type      "date/quarter-year"
                                                                   :sectionId "date"}]}
                     :model/DashboardCard _         {:dashboard_id (:id dashboard)
                                                     :card_id      (:id card)
                                                     :parameter_mappings
                                                     [;; Binding to something on stage 0.
                                                      {:parameter_id "_MAX_TAX_"
                                                       :card_id      (:id card)
                                                       :target       [:dimension
                                                                      [:field (mt/id :orders :tax) nil]
                                                                      {:stage-number 0}]}
                                                      ;; Binding explicitly to stage 1.
                                                      {:parameter_id "_CREATED_AT_"
                                                       :card_id      (:id card)
                                                       :target       [:dimension
                                                                      [:field (:name created-at) {:base-type :type/DateTime
                                                                                                  :inherited-temporal-unit :month}]
                                                                      {:stage-number 1}]}
                                                      ;; No stage number; binds implicitly to the last stage.
                                                      {:parameter_id "_CATEGORY_"
                                                       :card_id      (:id card)
                                                       :target       [:dimension
                                                                      [:field (:name category) {:base-type :type/Text}]]}]}]
        (is (=? {;; Explicit stage 0
                 "_MAX_TAX_"      [{:name      "TAX"
                                    :id        (mt/id :orders :tax)
                                    :base_type :type/Float}]
                 ;; Explicit stage 1
                 "_CREATED_AT_"   [{:name      (:name created-at)
                                    :base_type #(isa? % :type/DateTime)}]
                 ;; Implicit last stage
                 "_CATEGORY_"     [{:name      (:name category)
                                    :base_type :type/Text}]}
                (:param_fields (mt/with-test-user :crowberto
                                 (#'api.dashboard/get-dashboard (:id dashboard))))))))))

(deftest post-update-test
  (mt/with-temp [:model/Collection    {collection-id-1 :id} {}
                 :model/Collection    {collection-id-2 :id} {}
                 :model/Dashboard     {dashboard-id :id}    {:name "Lucky the Pigeon's Lucky Stuff", :collection_id collection-id-1}
                 :model/Card          {card-id :id}         {}
                 :model/Pulse         {pulse-id :id}        {:dashboard_id dashboard-id, :collection_id collection-id-1}
                 :model/DashboardCard {dashcard-id :id}     {:dashboard_id dashboard-id, :card_id card-id}
                 :model/PulseCard     _                     {:pulse_id pulse-id, :card_id card-id, :dashboard_card_id dashcard-id}]
    (testing "Pulse name and collection-id updates"
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" dashboard-id)
                            {:name "Lucky's Close Shaves" :collection_id collection-id-2})
      (is (= "Lucky's Close Shaves"
             (t2/select-one-fn :name :model/Pulse :id pulse-id)))
      (is (= collection-id-2
             (t2/select-one-fn :collection_id :model/Pulse :id pulse-id))))))

(deftest post-update-card-sync-test
  (mt/with-temp [:model/Collection    {collection-id-1 :id} {}
                 :model/Dashboard     {dashboard-id :id}    {:name "Lucky the Pigeon's Lucky Stuff", :collection_id collection-id-1}
                 :model/Card          {card-id :id}         {}
                 :model/Card          {new-card-id :id}     {}
                 :model/Pulse         {pulse-id :id}        {:dashboard_id dashboard-id, :collection_id collection-id-1}
                 :model/DashboardCard {dashcard-id :id}     {:dashboard_id dashboard-id, :card_id card-id}
                 :model/PulseCard     _                     {:pulse_id pulse-id, :card_id card-id, :dashboard_card_id dashcard-id}]
    (testing "PulseCard syncing"
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" dashboard-id)
                            {:dashcards [{:id 100
                                          :card_id new-card-id
                                          :row     0
                                          :col     0
                                          :size_x  4
                                          :size_y  4}]})
      (is (not (nil? (t2/select-one :model/PulseCard :card_id new-card-id)))))))
