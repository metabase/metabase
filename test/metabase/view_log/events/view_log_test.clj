(ns metabase.view-log.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics.sdk :as sdk]
   [metabase.config.core :as config]
   [metabase.dashboards-rest.api-test :as api.dashboard-test]
   [metabase.embedding-rest.api.embed-test :as embed-test]
   [metabase.events.core :as events]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.public-sharing-rest.api-test :as public-test]
   [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.view-log.events.view-log :as events.view-log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn latest-view
  "Returns the most recent view for a given user and model ID"
  [user-id model-id]
  (t2/select-one :model/ViewLog
                 :user_id user-id
                 :model_id model-id
                 {:order-by [[:id :desc]]}))

(deftest card-read-ee-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User user {}
                   :model/Card card {:creator_id (u/id user)}]
      (testing "A basic card read event is recorded in EE"
        (events/publish-event! :event/card-read {:object-id (u/id card) :user-id (u/the-id user), :context :question})
        (is (partial=
             {:user_id  (u/id user)
              :model    "card"
              :model_id (u/id card)
              :has_access true
              :context    :question}
             (latest-view (u/id user) (u/id card))))
        (testing "tenant_id is nil for user without a tenant"
          (is (= nil (:tenant_id (latest-view (u/id user) (u/id card))))))))))

(deftest card-read-tenant-id-test
  (when config/ee-available?
    (mt/with-premium-features #{:audit-app :tenants}
      (mt/with-temp [:model/Tenant tenant {:name "Test Tenant" :slug "test-tenant"}
                     :model/User   user   {:tenant_id (:id tenant)}
                     :model/Card   card   {:creator_id (u/id user)}]
        (testing "tenant_id is populated from current user's tenant"
          (mt/with-current-user (u/id user)
            (events/publish-event! :event/card-read {:object-id (u/id card) :user-id (u/id user) :context :question})
            (is (= (:id tenant)
                   (:tenant_id (latest-view (u/id user) (u/id card)))))))))))

(deftest card-read-oss-no-view-logging-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/User user {}
                   :model/Card card {:creator_id (u/id user)}]
      (testing "A basic card read event is not recorded in OSS"
        (events/publish-event! :event/card-read {:object-id (u/id card) :user-id (u/the-id user) :context :question})
        (is (= nil (latest-view (u/id user) (u/id card)))
            "view log entries should not be made in OSS")))))

(deftest collection-read-ee-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Collection coll {}]
      (testing "A basic collection read event is recorded in EE"
        (events/publish-event! :event/collection-read {:object coll :user-id (mt/user->id :crowberto)})
        (is (partial=
             {:user_id    (mt/user->id :crowberto)
              :model      "collection"
              :model_id   (u/id coll)
              :has_access true
              :context    nil}
             (latest-view (mt/user->id :crowberto) (u/id coll))))))))

(deftest update-view-dashboard-timestamp-test
  ;; the DB might save `last_used_at` with a different level of precision than the JVM does, on some machines
  ;; `offset-date-time` returns nanosecond precision (9 decimal places) but `last_viewed_at` is coming back with
  ;; microsecond precision (6 decimal places). We don't care about such a small difference, just strip it off of the
  ;; times we're comparing.
  (let [now           (-> (t/offset-date-time)
                          (.withNano 0))
        one-hour-ago  (t/minus now (t/hours 1))
        two-hours-ago (t/minus now (t/hours 2))]
    (testing "update with multiple dashboards of the same ids will set timestamp to the latest"
      (mt/with-temp
        [:model/Dashboard {dashboard-id-1 :id} {:last_viewed_at two-hours-ago}]
        (#'events.view-log/update-dashboard-last-viewed-at!* [{:id dashboard-id-1 :timestamp one-hour-ago}
                                                              {:id dashboard-id-1 :timestamp two-hours-ago}])
        (is (= one-hour-ago
               (-> (t2/select-one-fn :last_viewed_at :model/Dashboard dashboard-id-1)
                   t/offset-date-time
                   (.withNano 0))))))

    (testing "if the existing last_viewed_at is greater than the updating values, do not override it"
      (mt/with-temp
        [:model/Dashboard {dashboard-id-2 :id} {:last_viewed_at now}]
        (#'events.view-log/update-dashboard-last-viewed-at!* [{:id dashboard-id-2 :timestamp one-hour-ago}])
        (is (= now
               (-> (t2/select-one-fn :last_viewed_at :model/Dashboard dashboard-id-2)
                   t/offset-date-time
                   (.withNano 0))))))))

(deftest table-read-ee-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User user {}]
      (let [table (t2/select-one :model/Table :id (mt/id :users))]
        (testing "A basic table read event is recorded in EE"
          (events/publish-event! :event/table-read {:object table :user-id (u/id user)})
          (is (partial=
               {:user_id  (u/id user)
                :model    "table"
                :model_id (u/id table)
                :has_access nil
                :context    nil}
               (latest-view (u/id user) (u/id table)))))

        (testing "If a user is bound, has_access is recorded in EE based on the user's current permissions"
          (mt/with-full-data-perms-for-all-users!
            (mt/with-current-user (u/id user)
              (events/publish-event! :event/table-read {:object table :user-id (u/id user)})
              (is (true? (:has_access (latest-view (u/id user) (u/id table))))))

            ;; Bind the user again to flush the perms cache
            (mt/with-current-user (u/id user)
              (data-perms/set-table-permission! (perms-group/all-users) (mt/id :users) :perms/create-queries :no)
              (events/publish-event! :event/table-read {:object table :user-id (u/id user)})
              (is (= false (:has_access (latest-view (u/id user) (u/id table))))))))))))

(deftest dashboard-read-ee-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User          user      {}
                   :model/Dashboard     dashboard {:name "Test Dashboard"}
                   :model/Card          card      {:name "Dashboard Test Card"}
                   :model/DashboardCard _dashcard {:dashboard_id (u/id dashboard) :card_id (u/id card)}]
      (let [dashboard (t2/hydrate dashboard [:dashcards :card])]
        (testing "A basic dashboard read event is recorded in EE"
          (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id (u/id user)})
          (is (partial=
               {:user_id    (u/id user)
                :model      "dashboard"
                :model_id   (u/id dashboard)
                :has_access true
                :context    nil}
               (latest-view (u/id user) (u/id dashboard))))
          (testing "Card read events are not recorded when viewing a dashboard"
            (is (= nil (latest-view (u/id user) (u/id card))))))))))

(deftest card-read-view-count-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-temp [:model/User user {}
                     :model/Card card {:creator_id (u/id user)}]
        (testing "Card read events are recorded by a card's view_count"
          (is (= 0 (:view_count card))
              "view_count should be 0 before the event is published")
          (events/publish-event! :event/card-read {:object-id (:id card) :user-id (u/the-id user) :context :question})
          (is (= 1 (t2/select-one-fn :view_count :model/Card (:id card))))
          (events/publish-event! :event/card-read {:object-id (:id card) :user-id (u/the-id user) :context :question})
          (is (= 2 (t2/select-one-fn :view_count :model/Card (:id card)))))))))

(deftest dashboard-read-view-count-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-temp [:model/User          user      {}
                     :model/Dashboard     dashboard {:creator_id (u/id user)}
                     :model/Card          card      {:name "Dashboard Test Card"}
                     :model/DashboardCard _dashcard {:dashboard_id (u/id dashboard) :card_id (u/id card)}]
        (let [dashboard (t2/hydrate dashboard [:dashcards :card])]
          (testing "Dashboard read events are recorded by a dashboard's view_count"
            (is (= 0 (:view_count dashboard) (:view_count card))
                "view_count should be 0 before the event is published")
            (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id (u/the-id user)})
            (is (= 1 (t2/select-one-fn :view_count :model/Dashboard (:id dashboard))))
            (is (= 0 (t2/select-one-fn :view_count :model/Card (:id card)))
                "view_count for cards on the dashboard should not be incremented")
            (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id (u/the-id user)})
            (is (= 2 (t2/select-one-fn :view_count :model/Dashboard (:id dashboard))))))))))

(deftest table-read-view-count-test
  (mt/test-helpers-set-global-values!
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (mt/with-temp [:model/User  user  {}
                     :model/Table table {}]
        (testing "Card read events are recorded by a card's view_count"
          (is (= 0 (:view_count table))
              "view_count should be 0 before the event is published")
          (events/publish-event! :event/table-read {:object table :user-id (u/the-id user)})
          (is (= 1 (t2/select-one-fn :view_count :model/Table (:id table)))
              "view_count should be incremented")
          (events/publish-event! :event/table-read {:object table :user-id (u/the-id user)})
          (is (= 2 (t2/select-one-fn :view_count :model/Table (:id table)))
              "view_count should be incremented"))))))

(deftest increment-view-counts!*-test
  (mt/with-temp [:model/Card  {card-1-id :id} {}
                 :model/Card  {card-2-id :id} {:view_count 2}
                 :model/Table {table-id :id}  {}]
    (let [call-count (atom 0)
          t2-query-orig t2/query]
      (testing "increment-view-counts!* update the view_count correctly"
        (with-redefs [t2/query (fn [& args] (swap! call-count inc) (apply t2-query-orig args))]
          (#'events.view-log/increment-view-counts!* [;; table-id : 1 views, card-id-1: 2 views, card-id 2: 2 views
                                                      {:model :model/Table :id table-id}
                                                      {:model :model/Card  :id card-1-id}
                                                      {:model :model/Card  :id card-1-id}
                                                      {:model :model/Card  :id card-2-id}
                                                      {:model :model/Card  :id card-2-id}]))
        (is (= 2 ;; one for update card, one for table
               @call-count)
            "and groups db calls by frequency")
        (is (= 1 (t2/select-one-fn :view_count :model/Table table-id))
            "view_count for table-id should be 1")
        (is (= 2 (t2/select-one-fn :view_count :model/Card card-1-id))
            "view_count for card-1 should be 2")
        (is (= 4 ;; 2 old + 2 new
               (t2/select-one-fn :view_count :model/Card card-2-id))
            "view_count for card-2 should be 2")))))

;;; ---------------------------------------- API tests begin -----------------------------------------

(deftest get-collection-view-log-test
  (mt/with-premium-features #{:audit-app}
    (testing "Collection reads via the API are recorded in the view_log"
      (mt/with-temp [:model/Collection coll {}]
        (testing "GET /api/collection/:id/items"
          (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" (u/id coll)))
          (is (partial= {:user_id (mt/user->id :crowberto), :model "collection", :model_id (u/id coll)}
                        (latest-view (mt/user->id :crowberto) (u/id coll)))))))))

(deftest get-card-view-log-test
  (mt/with-premium-features #{:audit-app}
    (testing "Card reads (views) via the API are recorded in the view_log"
      (mt/with-temp [:model/Card card {:name "My Cool Card" :type :question
                                       :dataset_query (mt/mbql-query venues {:limit 1})}]
        (testing "POST /api/card/:id/query"
          (mt/user-http-request :crowberto :post 202 (format "card/%s/query" (u/id card)))
          (is (partial= {:user_id (mt/user->id :crowberto), :model "card", :model_id (u/id card), :context :question}
                        (latest-view (mt/user->id :crowberto) (u/id card)))))))))

(deftest get-dashboard-view-log-test
  (mt/with-premium-features #{:audit-app}
    (testing "Dashboard reads (views) via the API are recorded in the view_log"
      (mt/with-temp [:model/Dashboard dash {}]
        (testing "GET /api/dashboard/:id"
          (mt/user-http-request :crowberto :get 200 (format "dashboard/%s" (u/id dash)))
          (is (partial= {:user_id (mt/user->id :crowberto), :model "dashboard", :model_id (u/id dash)}
                        (latest-view (mt/user->id :crowberto) (u/id dash)))))))))

(deftest dashboard-card-query-view-log-test
  (mt/with-premium-features #{:audit-app}
    (testing "Running a query for a card in a dashboard is recorded in the view_log."
      (mt/with-temp [:model/Dashboard     dash     {}
                     :model/Card          card     {:dataset_query (mt/mbql-query venues {:limit 1})}
                     :model/DashboardCard dashcard {:dashboard_id (:id dash)
                                                    :card_id      (:id card)}]
        (testing "POST /api/dashboard/:dashboard-id/card/:card-id/query"
          (mt/user-http-request :crowberto :post 202
                                (api.dashboard-test/dashboard-card-query-url (:id dash) (:id card) (:id dashcard)))
          (is (partial= {:user_id (mt/user->id :crowberto), :model "card", :model_id (:id card), :context :dashboard}
                        (latest-view (mt/user->id :crowberto) (:id card)))))))))

(deftest get-public-card-logs-view-test
  (mt/with-premium-features #{:audit-app}
    (testing "Viewing a public card logs the correct view log event."
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (public-test/with-temp-public-card [card]
          (testing "GET /api/public/card/:uuid/query"
            (client/client :get 202 (str "public/card/" (:public_uuid card) "/query"))
            (is (partial= {:model "card", :model_id (:id card), :has_access true, :context :question
                           :embedding_route "public"}
                          (latest-view nil (:id card))))))))))

(deftest public-dashboard-card-query-view-log-test
  (mt/with-premium-features #{:audit-app}
    (testing "Running a query for a card in a public dashboard logs the correct view log event."
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (public-test/with-temp-public-dashboard-and-card [dash card dashcard]
          (testing "GET /api/public/dashboard/:uuid/card/:card-id/query"
            (client/client :get 202 (public-test/dashcard-url dash card dashcard))
            (is (partial= {:model "card", :model_id (:id card), :has_access true, :context :dashboard}
                          (latest-view nil (:id card))))))))))

(deftest get-public-dashboard-logs-view-test
  (mt/with-premium-features #{:audit-app}
    (testing "Viewing a public dashboard logs the correct view log event."
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (public-test/with-temp-public-dashboard [dash]
          (testing "GET /api/public/dashboard/:uuid"
            (client/client :get 200 (str "public/dashboard/" (:public_uuid dash)))
            (is (partial= {:model "dashboard", :model_id (:id dash), :has_access true}
                          (latest-view nil (:id dash))))))))))

(deftest get-embedded-card-embedding-logs-view-test
  (mt/with-premium-features #{:audit-app}
    (testing "Viewing an embedding logs the correct view log event."
      (embed-test/with-embedding-enabled-and-new-secret-key!
        (mt/with-temp [:model/Card card {:enable_embedding true
                                         :dataset_query (mt/mbql-query venues {:limit 1})}]
          (testing "GET /api/embed/card/:token/query"
            (client/client :get 202 (str (embed-test/card-url card) "/query"))
            (is (partial= {:model "card", :model_id (:id card), :has_access true
                           :embedding_route "guest-embed"}
                          (latest-view nil (:id card))))))))))

(deftest embedded-dashboard-card-query-view-log-test
  (mt/with-premium-features #{:audit-app}
    (testing "Running a query for a card in a public dashboard logs the correct view log event."
      (embed-test/with-embedding-enabled-and-new-secret-key!
        (mt/with-temp [:model/Dashboard dash {:enable_embedding true}
                       :model/Card          card     {:dataset_query (mt/mbql-query venues {:limit 1})}
                       :model/DashboardCard dashcard {:dashboard_id (:id dash)
                                                      :card_id      (:id card)}]
          (testing "GET /dashboard/:token/dashcard/:dashcard-id/card/:card-id"
            (client/client :get 202 (embed-test/dashcard-url dashcard))
            (is (partial= {:model "card", :model_id (:id card), :has_access true, :context :dashboard}
                          (latest-view nil (:id card))))))))))

(deftest get-embedded-dashboard-logs-view-test
  (mt/with-premium-features #{:audit-app}
    (testing "Viewing an embedding logs the correct view log event."
      (embed-test/with-embedding-enabled-and-new-secret-key!
        (mt/with-temp [:model/Dashboard dash {:enable_embedding true}]
          (testing "GET /api/embed/dashboard/:token"
            (client/client :get 200 (embed-test/dashboard-url dash))
            (is (partial= {:model "dashboard", :model_id (:id dash), :has_access true}
                          (latest-view nil (:id dash))))))))))

(deftest client-and-route-stored-independently-test
  (mt/with-premium-features #{:audit-app}
    (testing "embedding_client comes from header, embedding_route from URI"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (public-test/with-temp-public-card [card]
          (client/client :get 202 (str "public/card/" (:public_uuid card) "/query")
                         {:request-options {:headers {"x-metabase-client" "embedding-sdk-react"}}})
          (let [view (latest-view nil (:id card))]
            (is (= "embedding-sdk-react" (:embedding_client view)))
            (is (= "public" (:embedding_route view)))))))))

(defn- latest-qe
  "Returns the most recent QueryExecution for a given card ID."
  [card-id]
  (t2/select-one :model/QueryExecution
                 :card_id card-id
                 {:order-by [[:id :desc]]}))

(deftest query-execution-tenant-id-test
  (when config/ee-available?
    (testing "tenant_id on query_execution comes from *current-user*"
      (mt/with-temp [:model/Tenant tenant {:name "QE Tenant" :slug "qe-tenant"}
                     :model/User   user   {:tenant_id (:id tenant)}]
        (mt/with-current-user (u/id user)
          (let [query (assoc (mt/mbql-query venues {:limit 1})
                             :info {:executed-by (u/id user)
                                    :query-hash  (qp.util/query-hash (mt/mbql-query venues {:limit 1}))
                                    :context     :question})
                ei    (#'process-userland-query/query-execution-info query)]
            (is (= (:id tenant) (:tenant_id ei))))))))
  (testing "tenant_id nil when user has no tenant"
    (mt/with-temp [:model/User user {}]
      (mt/with-current-user (u/id user)
        (let [query (assoc (mt/mbql-query venues {:limit 1})
                           :info {:executed-by (u/id user)
                                  :query-hash  (qp.util/query-hash (mt/mbql-query venues {:limit 1}))
                                  :context     :question})
              ei    (#'process-userland-query/query-execution-info query)]
          (is (= nil (:tenant_id ei))))))))

(defn- make-test-query
  "Builds a minimal query suitable for `query-execution-info`, with optional overrides merged in."
  [& {:as overrides}]
  (merge (mt/mbql-query venues {:limit 1})
         {:info {:executed-by 1
                 :query-hash  (qp.util/query-hash (mt/mbql-query venues {:limit 1}))
                 :context     :question}}
         overrides))

(deftest query-execution-is-db-routed-test
  (testing "is_db_routed is true when destination-database/id is present"
    (let [ei (#'process-userland-query/query-execution-info
              (make-test-query :destination-database/id 42))]
      (is (true? (:is_db_routed ei)))))
  (testing "is_db_routed is false when destination-database/id is absent"
    (let [ei (#'process-userland-query/query-execution-info (make-test-query))]
      (is (= false (:is_db_routed ei))))))

(deftest query-execution-parameters-test
  (testing "parameters is JSON-encoded when PII retention enabled"
    (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
      (let [params [{:type "text/single" :value "foo"}]
            ei     (#'process-userland-query/query-execution-info
                    (make-test-query :parameters params))]
        (is (string? (:parameters ei)))
        (is (= params (json/decode+kw (:parameters ei)))))))
  (testing "parameters is nil when PII retention disabled"
    (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
      (let [params [{:type "text/single" :value "foo"}]
            ei     (#'process-userland-query/query-execution-info
                    (make-test-query :parameters params))]
        (is (= nil (:parameters ei))))))
  (testing "parameters is nil when absent"
    (let [ei (#'process-userland-query/query-execution-info (make-test-query))]
      (is (= nil (:parameters ei))))))

(deftest query-execution-is-impersonated-test
  (testing "is_impersonated is true when :impersonation/role present"
    (let [ei (#'process-userland-query/query-execution-info
              (make-test-query :impersonation/role "some_role"))]
      (is (true? (:is_impersonated ei)))))
  (testing "is_impersonated is false when absent"
    (let [ei (#'process-userland-query/query-execution-info
              (make-test-query))]
      (is (= false (:is_impersonated ei))))))

(deftest public-card-pii-fields-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (binding [qp.util/*execute-async?* false]
        (testing "PII fields populated when setting enabled"
          (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
            (public-test/with-temp-public-card [card]
              (client/client :get 202 (str "public/card/" (:public_uuid card) "/query")
                             {:request-options {:headers {"x-metabase-embed-referrer" "https://app.example.com/dashboard/1"
                                                          "user-agent"                "TestAgent/1.0"}}})
              (testing "in view_log"
                (let [view (latest-view nil (:id card))]
                  (is (= "app.example.com" (:embedding_hostname view)))
                  (is (= "/dashboard/1"    (:embedding_path view)))
                  (is (= "TestAgent/1.0" (:user_agent view)))
                  (is (= "Unknown device type (unknown/unknown)" (:sanitized_user_agent view)))
                  (is (= "127.0.0.1"      (:ip_address view)))))
              (testing "in query_execution"
                (let [qe (latest-qe (:id card))]
                  (is (= "public"          (:embedding_route qe)))
                  (is (= "app.example.com" (:embedding_hostname qe)))
                  (is (= "/dashboard/1"    (:embedding_path qe)))
                  (is (= "TestAgent/1.0" (:user_agent qe)))
                  (is (= "Unknown device type (unknown/unknown)" (:sanitized_user_agent qe)))
                  (is (= "127.0.0.1"       (:ip_address qe))))))))
        (testing "PII fields nil when setting disabled, but hostname still populated"
          (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
            (public-test/with-temp-public-card [card]
              (client/client :get 202 (str "public/card/" (:public_uuid card) "/query")
                             {:request-options {:headers {"x-metabase-embed-referrer" "https://app.example.com/dashboard/1"
                                                          "user-agent"                "TestAgent/1.0"}}})
              (testing "in view_log"
                (let [view (latest-view nil (:id card))]
                  (is (= "app.example.com" (:embedding_hostname view)))
                  (is (= nil (:embedding_path view)))
                  (is (= nil (:user_agent view)))
                  (is (= nil (:sanitized_user_agent view)))
                  (is (= nil (:ip_address view)))))
              (testing "in query_execution"
                (let [qe (latest-qe (:id card))]
                  (is (= "app.example.com" (:embedding_hostname qe)))
                  (is (= nil (:embedding_path qe)))
                  (is (= nil (:user_agent qe)))
                  (is (= nil (:sanitized_user_agent qe)))
                  (is (= nil (:ip_address qe))))))))))))

(deftest public-dashboard-card-pii-fields-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (binding [qp.util/*execute-async?* false]
        (testing "PII fields populated via dashboard card query when setting enabled"
          (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
            (public-test/with-temp-public-dashboard-and-card [dash card dashcard]
              (client/client :get 202 (public-test/dashcard-url dash card dashcard)
                             {:request-options {:headers {"x-metabase-embed-referrer" "https://dash.example.com/analytics"
                                                          "user-agent"                "DashAgent/2.0"}}})
              (testing "in view_log"
                (let [view (latest-view nil (:id card))]
                  (is (= "dash.example.com" (:embedding_hostname view)))
                  (is (= "/analytics"       (:embedding_path view)))
                  (is (= "DashAgent/2.0" (:user_agent view)))
                  (is (= "Unknown device type (unknown/unknown)" (:sanitized_user_agent view)))
                  (is (= "127.0.0.1"        (:ip_address view)))))
              (testing "in query_execution"
                (let [qe (latest-qe (:id card))]
                  (is (= "public"           (:embedding_route qe)))
                  (is (= "dash.example.com" (:embedding_hostname qe)))
                  (is (= "/analytics"       (:embedding_path qe)))
                  (is (= "DashAgent/2.0" (:user_agent qe)))
                  (is (= "Unknown device type (unknown/unknown)" (:sanitized_user_agent qe)))
                  (is (= "127.0.0.1"        (:ip_address qe))))))))))))

(deftest auth-method-test
  (mt/with-premium-features #{:audit-app}
    (binding [qp.util/*execute-async?* false]
      (testing "session-authenticated request records auth_method from auth_identity provider"
        (mt/with-temp [:model/Card card {:name "Auth Test Card" :type :question
                                         :dataset_query (mt/mbql-query venues {:limit 1})}]
          (mt/user-http-request :crowberto :post 202 (format "card/%s/query" (u/id card)))
          (let [view (latest-view (mt/user->id :crowberto) (u/id card))
                qe   (latest-qe (:id card))]
            (is (= "password" (:auth_method view)))
            (is (= "password" (:auth_method qe))))))
      (testing "unauthenticated public request records auth_method as 'public'"
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (public-test/with-temp-public-card [card]
            (client/client :get 202 (str "public/card/" (:public_uuid card) "/query"))
            (let [view (latest-view nil (:id card))
                  qe   (latest-qe (:id card))]
              (is (= "public" (:auth_method view)))
              (is (= "public" (:auth_method qe))))))))))

(deftest route-surface-test
  (testing "route-surface returns the correct surface for known prefixes"
    (are [uri expected]
         (= expected (sdk/embedding-route uri))
      "/api/public/something"         "public"
      "/api/embed/something"          "guest-embed"
      "/api/preview_embed/something"  "guest-embed"
      "/api/metabot/something"        "metabot"
      "/api/agent/something"          "agent-api"))
  (testing "route-surface returns nil for non-matching URIs"
    (is (= nil (sdk/embedding-route "/api/card/1")))
    (is (= nil (sdk/embedding-route nil)))))

(defn- ->bool
  "Coerce a value to boolean. MySQL JDBC returns Integer 1/0 for TRUE/FALSE
   in CASE expressions, and byte arrays for bit literals."
  [v]
  (cond
    (instance? Boolean v) v
    (number? v)           (pos? (long v))
    (bytes? v)            (pos? (first v))
    :else                 (boolean v)))

(defn- latest-v-view-log
  "Returns the most recent row from the v_view_log view for a given entity_id."
  [entity-id]
  (first (t2/query ["SELECT * FROM v_view_log WHERE entity_id = ? ORDER BY id DESC LIMIT 1" entity-id])))

(defn- latest-v-query-log
  "Returns the most recent row from the v_query_log view for a given card_id."
  [card-id]
  (first (t2/query ["SELECT * FROM v_query_log WHERE card_id = ? ORDER BY entity_id DESC LIMIT 1" card-id])))

(deftest end-to-end-analytics-views-pii-true-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [enable-public-sharing          true
                                       analytics-pii-retention-enabled true]
      (binding [qp.util/*execute-async?* false]
        (testing "public card request with SDK header populates all analytics fields on both views"
          (public-test/with-temp-public-card [card]
            (client/client :get 202 (str "public/card/" (:public_uuid card) "/query")
                           {:request-options {:headers {"x-metabase-client"         "embedding-sdk-react"
                                                        "x-metabase-client-version" "1.42.0"
                                                        "x-metabase-embed-referrer" "https://app.example.com/dashboard/1"
                                                        "user-agent"                "TestAgent/1.0"}}})
            (testing "v_view_log"
              (let [row (latest-v-view-log (:id card))]
                (is (= "card"                  (:entity_type row)))
                (is (= "embedding-sdk-react"   (:embedding_client row)))
                (is (= "public"                (:embedding_route row)))

                (is (= false                    (->bool (:is_preview row))))
                (is (= "1.42.0"                (:embedding_sdk_version row)))
                (is (= "public"                (:auth_method row)))
                (is (= "app.example.com"       (:embedding_hostname row)))
                (is (= "/dashboard/1"          (:embedding_path row)))
                (is (= "TestAgent/1.0"         (:user_agent row)))
                (is (some?                     (:sanitized_user_agent row)))
                (is (= "127.0.0.1"             (:ip_address row)))))
            (testing "v_query_log"
              (let [row (latest-v-query-log (:id card))]
                (is (= "embedding-sdk-react"   (:embedding_client row)))
                (is (= "public"                (:embedding_route row)))

                (is (= false                    (->bool (:is_preview row))))
                (is (= "1.42.0"                (:embedding_sdk_version row)))
                (is (= "public"                (:auth_method row)))
                (is (= "app.example.com"       (:embedding_hostname row)))
                (is (= "/dashboard/1"          (:embedding_path row)))
                (is (= "TestAgent/1.0"         (:user_agent row)))
                (is (some?                     (:sanitized_user_agent row)))
                (is (= "127.0.0.1"             (:ip_address row)))))))))))

(deftest end-to-end-analytics-views-pii-false-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [enable-public-sharing           true
                                       analytics-pii-retention-enabled false]
      (binding [qp.util/*execute-async?* false]
        (testing "public card request with SDK header populates all analytics fields on both views"
          (public-test/with-temp-public-card [card]
            (client/client :get 202 (str "public/card/" (:public_uuid card) "/query")
                           {:request-options {:headers {"x-metabase-client"         "embedding-sdk-react"
                                                        "x-metabase-client-version" "1.42.0"
                                                        "x-metabase-embed-referrer" "https://app.example.com/dashboard/1"
                                                        "user-agent"                "TestAgent/1.0"}}})
            (testing "v_view_log"
              (let [row (latest-v-view-log (:id card))]
                (is (= "card"                  (:entity_type row)))
                (is (= "embedding-sdk-react"   (:embedding_client row)))
                (is (= "public"                (:embedding_route row)))

                (is (= false                    (->bool (:is_preview row))))
                (is (= "1.42.0"                (:embedding_sdk_version row)))
                (is (= "public"                (:auth_method row)))
                (is (= "app.example.com"       (:embedding_hostname row)))
                (is (= nil                     (:embedding_path row)))
                (is (= nil                     (:user_agent row)))
                (is (= nil                     (:sanitized_user_agent row)))
                (is (= nil                     (:ip_address row)))))
            (testing "v_query_log"
              (let [row (latest-v-query-log (:id card))]
                (is (= "embedding-sdk-react"   (:embedding_client row)))
                (is (= "public"                (:embedding_route row)))

                (is (= false                    (->bool (:is_preview row))))
                (is (= "1.42.0"                (:embedding_sdk_version row)))
                (is (= "public"                (:auth_method row)))
                (is (= "app.example.com"       (:embedding_hostname row)))
                (is (= nil                     (:embedding_path row)))
                (is (= nil                     (:user_agent row)))
                (is (= nil                     (:sanitized_user_agent row)))
                (is (= nil                     (:ip_address row)))))))))))

;;; ---------------------------------------- API tests end -----------------------------------------
