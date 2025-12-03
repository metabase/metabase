(ns metabase-enterprise.database-replication.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-replication.api :as api]
   [metabase-enterprise.database-replication.settings :as database-replication.settings]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest required-features-test
  ;; checked in [[metabase-enterprise.api-routes.routes/ee-routes-map]]
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
        db-details {:dbname "dbname", :host "host", :user "user", :password "password"}
        tables [{:table-schema "public",
                 :table-name "t1",
                 :estimated-row-count 9
                 :has-pkey true,
                 :has-ownership true}
                {:table-schema "not_public",
                 :table-name "no_schema",
                 :estimated-row-count 11
                 :has-pkey false,
                 :has-ownership true}
                {:table-schema "public",
                 :table-name "no_pkey",
                 :estimated-row-count 11
                 :has-pkey false,
                 :has-ownership true}
                {:table-schema "public",
                 :table-name "no_ownership",
                 :estimated-row-count 11
                 :has-pkey true,
                 :has-ownership false}]]
    (with-redefs [token-check/quotas
                  (constantly [{:usage 499990, :locked false, :updated-at "2025-08-05T08:48:11Z", :quota-type "rows", :hosting-feature "clickhouse-dwh", :soft-limit 500000}])

                  api/hm-preview-memo
                  #'api/hm-preview

                  hm.client/call
                  (fn [op-id & {:as m}]
                    (case op-id
                      :list-connections @hm-state
                      :preview-connection {:tables tables}
                      :create-connection (u/prog1 (into {:id (str (random-uuid))} m) (swap! hm-state conj <>))
                      :delete-connection (swap! hm-state (fn [state] (vec (remove #(-> % :id (= (:connection-id m))) state))))))]
      (mt/with-premium-features #{:attached-dwh :etl-connections :etl-connections-pg :hosting}
        (mt/with-temporary-setting-values [is-hosted? true, store-api-url "foo", api-key "foo", database-replication-connections {}]
          (mt/with-temp [:model/Database db {:engine :postgres :details db-details}]
            (let [url (str "ee/database-replication/connection/" (:id db))
                  body {:replicationSchemaFilters {:schema-filters-type "exclusion"
                                                   :schema-filters-patterns "not_pub*"}}]
              (testing "previews"
                (let [resp (mt/user-http-request :crowberto :post 200 (str url "/preview") body)]
                  (is (= {:freeQuota 10,
                          :totalEstimatedRowCount 9,
                          :canSetReplication true,

                          :replicatedTables
                          [{:tableSchema "public", :tableName "t1", :estimatedRowCount 9, :hasPkey true, :hasOwnership true}],

                          :tablesWithoutPk
                          [{:tableSchema "public", :tableName "no_pkey", :estimatedRowCount 11, :hasPkey false, :hasOwnership true}],

                          :tablesWithoutOwnerMatch
                          [{:tableSchema "public", :tableName "no_ownership", :estimatedRowCount 11, :hasPkey true, :hasOwnership false}]

                          :errors
                          {:noTables false, :noQuota false, :invalidSchemaFiltersPattern false}}
                         resp))))
              (testing "creates"
                (is (= {} (database-replication.settings/database-replication-connections)))
                (mt/user-http-request :crowberto :post 200 url body)
                (is (= 1 (count @hm-state)))
                (let [hm-conn (first @hm-state)]
                  (is (= {(-> db :id str keyword) {:connection-id (str (:id hm-conn))}}
                         (database-replication.settings/database-replication-connections)))
                  (is (= (dissoc hm-conn :id)
                         {:type "pg_replication",
                          :secret {:credentials (assoc db-details :port 5432 :dbtype "postgresql")
                                   :schema-filters [{:type "exclusion", :patterns "not_pub*"}]}}))))
              (testing "deletes"
                (mt/user-http-request :crowberto :delete 204 url)
                (is (= 0 (count @hm-state)))
                (is (= {} (database-replication.settings/database-replication-connections))))
              (testing "idempotent delete"
                (mt/user-http-request :crowberto :delete 204 url)))))))))

(deftest preview-replication-test
  (let [quotas [{:usage 100000, :locked false, :updated-at "2025-08-05T08:48:11Z", :quota-type "rows", :hosting-feature "clickhouse-dwh", :soft-limit 500000}]
        valid-table {:table-schema "public", :table-name "valid_table", :estimated-row-count 1000, :has-pkey true, :has-ownership true}
        no-pk-table {:table-schema "public", :table-name "no_pk_table", :estimated-row-count 2000, :has-pkey false, :has-ownership true}
        no-ownership-table {:table-schema "public", :table-name "no_ownership_table", :estimated-row-count 3000, :has-pkey true, :has-ownership false}
        base-response {:free-quota 400000
                       :total-estimated-row-count 0
                       :errors {:no-tables false, :no-quota false, :invalid-schema-filters-pattern false}
                       :can-set-replication true
                       :replicated-tables []
                       :tables-without-pk []
                       :tables-without-owner-match []}]

    (testing "successful case with valid tables and quota"
      (is (= (merge base-response
                    {:total-estimated-row-count 1000
                     :replicated-tables [valid-table]})
             (api/preview-replication quotas [valid-table]))))

    (testing "no-tables error condition"
      (is (= (merge base-response
                    {:errors {:no-tables true, :no-quota false, :invalid-schema-filters-pattern false}
                     :can-set-replication false
                     :tables-without-pk [no-pk-table]
                     :tables-without-owner-match [no-ownership-table]})
             (api/preview-replication quotas [no-pk-table no-ownership-table]))))

    (testing "no-quota error condition"
      (let [high-row-table {:table-schema "public", :table-name "high_row_table", :estimated-row-count 500000, :has-pkey true, :has-ownership true}]
        (is (= (merge base-response
                      {:total-estimated-row-count 500000
                       :errors {:no-tables false, :no-quota true, :invalid-schema-filters-pattern false}
                       :can-set-replication false
                       :replicated-tables [high-row-table]})
               (api/preview-replication quotas [high-row-table])))))

    (testing "invalid-schema-filters-pattern error condition"
      (is (= (merge base-response
                    {:errors {:no-tables true, :no-quota false, :invalid-schema-filters-pattern true}
                     :can-set-replication false})
             (api/preview-replication quotas {:error "Invalid schema pattern"}))))

    (testing "mixed tables with various conditions"
      (is (= (merge base-response
                    {:total-estimated-row-count 1000
                     :replicated-tables [valid-table]
                     :tables-without-pk [no-pk-table]
                     :tables-without-owner-match [no-ownership-table]})
             (api/preview-replication quotas [valid-table no-pk-table no-ownership-table]))))

    (testing "no quota available"
      (let [no-quota-quotas [{:usage 500000, :locked false, :updated-at "2025-08-05T08:48:11Z", :quota-type "rows", :hosting-feature "clickhouse-dwh", :soft-limit 500000}]]
        (is (= (merge base-response
                      {:free-quota 0
                       :total-estimated-row-count 1000
                       :errors {:no-tables false, :no-quota true, :invalid-schema-filters-pattern false}
                       :can-set-replication false
                       :replicated-tables [valid-table]})
               (api/preview-replication no-quota-quotas [valid-table])))))

    (testing "empty tables list"
      (is (= (merge base-response
                    {:errors {:no-tables true, :no-quota false, :invalid-schema-filters-pattern false}
                     :can-set-replication false})
             (api/preview-replication quotas []))))))
