(ns metabase-enterprise.database-replication.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-replication.settings :as database-replication.settings]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest required-features-test
  ;; checked in metabase-enterprise.api.routes/ee-routes-map
  (let [required-features [[:attached-dwh "Attached DWH"]
                           [:etl-connections "ETL Connections"]
                           [:etl-connections-pg "ETL Connections PG replication"]]]
    (doseq [[k name'] required-features]
      (mt/with-premium-features (-> (map first required-features) set (disj k))
        (is (=  (str name'
                     " is a paid feature not currently available to your instance."
                     " Please upgrade to use it. Learn more at metabase.com/upgrade/")
                (:message (mt/user-http-request :crowberto :post 402 "ee/database-replication/connection/1"))
                (:message (mt/user-http-request :crowberto :delete 402 "ee/database-replication/connection/1"))))))))

(deftest superuser-test
  ;; checked in metabase-enterprise.database-replication.api/routes
  (mt/with-premium-features #{:attached-dwh :etl-connections :etl-connections-pg}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/database-replication/connection/1")
           (mt/user-http-request :rasta :delete 403 "ee/database-replication/connection/1")))))

(deftest required-settings-test
  ;; checked via calls to metabase-enterprise.database-replication.settings/database-replication-enabled
  (let [check #(is (= "PG replication integration is not enabled."
                      (mt/user-http-request :crowberto :post 400 "ee/database-replication/connection/1")
                      (mt/user-http-request :crowberto :delete 400 "ee/database-replication/connection/1")))]
    (mt/with-premium-features #{:attached-dwh :etl-connections :etl-connections-pg :hosting}
      (mt/with-temporary-setting-values [store-api-url nil, api-key nil]
        (check))
      (mt/with-temporary-setting-values [store-api-url "foo", api-key nil]
        (check)))))

(deftest create-fail-test
  (mt/with-premium-features #{:attached-dwh :etl-connections :etl-connections-pg :hosting}
    (mt/with-temporary-setting-values [store-api-url "foo", api-key "foo"]
      (mt/with-temp [:model/Database mysql-db {:engine :mysql}
                     :model/Database postgres-db {:engine :postgres}]
        (is (= "Not found." (mt/user-http-request :crowberto :post 404 "ee/database-replication/connection/999999")))
        (is (= "PG replication is only supported for PostgreSQL databases."
               (mt/user-http-request :crowberto :post 400 (str "ee/database-replication/connection/" (:id mysql-db)))))
        (let [url (str "ee/database-replication/connection/" (:id postgres-db))]
          (with-redefs [hm.client/call (constantly [{:id 123, :type "pg_replication"}])]
            (mt/with-temporary-setting-values [database-replication-connections {(:id postgres-db) {:connection-id 123}}]
              (is (= "Database already has an active replication connection." (mt/user-http-request :crowberto :post 400 url)))))
          (with-redefs [hm.client/call (fn [& _] (throw (ex-info "test err" {})))]
            (is (mt/user-http-request :crowberto :post 500 url))))))))

(deftest delete-fail-test
  (mt/with-premium-features #{:attached-dwh :etl-connections :etl-connections-pg :hosting}
    (mt/with-temporary-setting-values [is-hosted? true, store-api-url "foo", api-key "foo"]
      (with-redefs [hm.client/call (fn [& _] (throw (ex-info "test err" {})))]
        (is (mt/user-http-request :crowberto :delete 500 "ee/database-replication/connection/99"))))))

(deftest lifecycle-test
  (let [hm-state (atom [])
        db-details {:dbname "dbname", :host "host", :user "user", :password "password"}]
    (with-redefs [hm.client/call
                  (fn [op-id & {:as m}]
                    (case op-id
                      :list-connections @hm-state
                      :create-connection (u/prog1 (into {:id (str (random-uuid))} m) (swap! hm-state conj <>))
                      :delete-connection (swap! hm-state (fn [state] (vec (remove #(-> % :id (= (:connection-id m))) state))))))]
      (mt/with-premium-features #{:attached-dwh :etl-connections :etl-connections-pg :hosting}
        (mt/with-temporary-setting-values [is-hosted? true, store-api-url "foo", api-key "foo", database-replication-connections {}]
          (mt/with-temp [:model/Database db {:engine :postgres :details db-details}]
            (let [url (str "ee/database-replication/connection/" (:id db))]
              (testing "creates"
                (is (= {} (database-replication.settings/database-replication-connections)))
                (mt/user-http-request :crowberto :post 200 url)
                (is (= 1 (count @hm-state)))
                (let [hm-conn (first @hm-state)]
                  (is (= {(-> db :id str keyword) {:connection-id (str (:id hm-conn))}}
                         (database-replication.settings/database-replication-connections)))
                  (is (= (dissoc hm-conn :id)
                         {:type "pg_replication", :secret {:credentials (assoc db-details :port 5432 :dbtype "postgresql")}}))))
              (testing "deletes"
                (mt/user-http-request :crowberto :delete 204 url)
                (is (= 0 (count @hm-state)))
                (is (= {} (database-replication.settings/database-replication-connections))))
              (testing "idempotent delete"
                (mt/user-http-request :crowberto :delete 204 url)))))))))
