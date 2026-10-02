(ns metabase-enterprise.data-apps.generate.schemas-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.collections.test-utils :refer [with-library-synced]]
   [metabase.lib.core :as lib]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each
  (fn [f]
    (mt/with-dynamic-fn-redefs [remote-sync/previously-synced-ids (fn [_ ids] ids)]
      (data-apps.tu/do-with-library!
       (fn [{:keys [data-id metrics-id]}]
         (with-library-synced
           (mt/with-temp-vals-in-db :model/Collection data-id {:is_remote_synced true}
             (mt/with-temp-vals-in-db :model/Collection metrics-id {:is_remote_synced true}
               (f)))))))))


(defn- get-schemas
  "The response of `GET /api/apps/generate/schemas` as `user`, expecting `status`, with the data apps feature on."
  [user status]
  (mt/with-premium-features #{:data-apps}
    (mt/user-http-request-full-response user :get status "apps/generate/schemas")))

(deftest only-a-superuser-generates-the-schemas-test
  (testing "the schema is what an app's author builds from, and only an admin works with an app's repository"
    (mt/with-premium-features #{:data-apps}
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "apps/generate/schemas")))
      (is (string? (mt/user-http-request :crowberto :get 200 "apps/generate/schemas"))))))

(deftest typescript-endpoint-test
  (let [response (get-schemas :crowberto 200)]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/includes? (:body response) "\nconst schema = {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (not (str/includes? (:body response) "\n  questions:")))
    (is (str/includes? (:body response) "\n  tables: tables"))
    (is (str/includes? (:body response) "\n  metrics: metrics"))
    (is (str/ends-with? (:body response) "export default schema;\n"))
    (is (not (str/includes? (:body response) "\"schemaVersion\"")))
    (is (not (str/includes? (:body response) "operators: [ ]")))
    (is (not (str/includes? (:body response) "parameters: [ ]")))
    (is (not (str/includes? (:body response) "verified: false")))))

(deftest schemas-cover-the-libraries-and-the-model-less-actions-test
  (mt/dataset test-data
    (mt/with-temp-copy-of-db
      (mt/with-actions-enabled
        (data-apps.tu/do-with-library!
         (fn [{:keys [data-id metrics-id]}]
           (let [mp            (mt/metadata-provider)
                 orders-query  (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                 revenue-query (lib/aggregate orders-query
                                              (lib/sum (lib.metadata/field mp (mt/id :orders :total))))]
             (t2/update! :model/Table (mt/id :orders) {:is_published true, :collection_id data-id})
             (mt/with-temp [:model/Card _metric {:name "Order revenue", :database_id (mt/id), :table_id (mt/id :orders)
                                                 :type :metric, :display :scalar, :collection_id metrics-id
                                                 :dataset_query revenue-query}
                            :model/Card model {:name "Order model", :database_id (mt/id), :table_id (mt/id :orders)
                                               :type :model
                                               :dataset_query orders-query
                                               :result_metadata [{:name "total", :display_name "Total"
                                                                  :base_type :type/Float
                                                                  :field_ref [:field (mt/id :orders :total) nil]
                                                                  :id (mt/id :orders :total)}]}
                            :model/Action action {:name "Update order", :model_id (:id model), :type :implicit}
                            :model/ImplicitAction _ {:action_id (:id action), :kind "row/update"}
                            :model/Action standalone {:name "Discount order", :type :query, :collection_id data-id}
                            :model/QueryAction _ {:action_id     (:id standalone)
                                                  :dataset_query (lib/native-query mp "UPDATE orders SET discount = 0")}
                            :model/Collection copies {:name "Data App: orders", :namespace "data-apps", :is_remote_synced true}
                            :model/Action copy {:name "Copied order", :type :query, :collection_id (:id copies)}
                            :model/QueryAction _ {:action_id     (:id copy)
                                                  :dataset_query (lib/native-query mp "UPDATE orders SET discount = 0")}]
               (let [body (:body (get-schemas :crowberto 200))]
                 (testing "a table in the data library is listed"
                   (is (str/includes? body "  orders: {"))
                   (is (str/includes? body "name: \"Orders\"")))
                 (testing "a metric in the metrics library is listed"
                   (is (str/includes? body "name: \"Order revenue\"")))
                 (testing "an action without a model is listed, and one with a model never is"
                   (is (str/includes? body "discountOrder"))
                   (is (not (str/includes? body "updateOrder"))))
                 (testing "a copy a data app owns stays out"
                   (is (str/includes? body "copiedOrder"))
                   (mt/with-dynamic-fn-redefs [perms/data-app-collection-ids (constantly #{(:id copies)})]
                     (is (not (str/includes? (:body (get-schemas :crowberto 200)) "copiedOrder"))))))))))))))
