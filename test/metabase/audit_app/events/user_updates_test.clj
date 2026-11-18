(ns metabase.audit-app.events.user-updates-test
  "A user's update of an audited model records an audit row whatever column it changes, as every endpoint's event did
  before the events came from the models, except an update of only bookkeeping columns and the direct archive of a
  Card."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- max-id []
  (or (:id (t2/query-one {:select [[:%max.id :id]] :from [:audit_log]})) 0))

(defn- rows-since [before]
  (mapv #(select-keys % [:topic :model :model_id :user_id :details])
        (t2/select :model/AuditLog {:where [:> :id before] :order-by [[:id :asc]]})))

(defn- topics-since [before]
  (mapv (juxt :topic :model :model_id) (rows-since before)))

(defn- venues-query []
  (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(defn- orders-query []
  (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders))))

(deftest card-edit-records-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {:name          "Edit me"
                                              :display       :table
                                              :dataset_query (venues-query)}]
      (doseq [[what changes] {"query"                  {:dataset_query (orders-query)}
                              "display"                {:display :bar}
                              "visualization settings" {:visualization_settings {:table.pivot true}}
                              "collection"             {:collection_id coll-id}}]
        (testing (str "changing the " what " records one card-update row for the user")
          (let [before (max-id)]
            (mt/user-http-request :crowberto :put 200 (str "card/" card-id) changes)
            (is (=? [{:topic :card-update :model "Card" :model_id card-id :user_id (mt/user->id :crowberto)}]
                    (rows-since before)))))))))

(deftest bulk-card-move-records-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-1 :id} {:name "One"}
                   :model/Card {card-2 :id} {:name "Two"}]
      (let [before (max-id)]
        (mt/user-http-request :crowberto :post 200 "card/collections"
                              {:card_ids [card-1 card-2] :collection_id coll-id})
        (is (= #{[:card-update "Card" card-1] [:card-update "Card" card-2]}
               (set (topics-since before))))))))

(deftest card-archive-and-restore-record-nothing-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card {card-id :id} {:name "Archive me"}]
      (let [before (max-id)]
        (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true})
        (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived false})
        (is (= [] (rows-since before)))))))

(deftest card-bookkeeping-update-records-nothing-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card {card-id :id} {:name "Pinned"}]
      (let [before (max-id)]
        (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:collection_position 1})
        (mt/with-current-user (mt/user->id :rasta)
          (t2/update! :model/Card :id card-id {:view_count 5 :last_used_at (java.time.OffsetDateTime/now)}))
        (is (= [] (rows-since before)))))))

(deftest metric-dimension-edit-records-card-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card {metric-id :id} {:name          "Metric"
                                                :type          :metric
                                                :database_id   (mt/id)
                                                :table_id      (mt/id :venues)
                                                :dataset_query (lib/aggregate (venues-query) (lib/count))}]
      (mt/user-http-request :crowberto :get 200 (str "metric/" metric-id))
      (let [before (max-id)
            price  (some #(when (= "PRICE" (:name %)) (:id %))
                         (:dimensions (t2/select-one :model/Card :id metric-id)))]
        (mt/user-http-request :crowberto :post 200 (str "metric/" metric-id "/dimension/remove")
                              {:dimension_ids [price]})
        (is (= [[:card-update "Card" metric-id]] (topics-since before)))))))

(deftest database-update-records-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db)) :name "Audited"}]
      (doseq [[what changes] {"description" {:description "A description"}
                              "caveats"     {:caveats "Some caveats"}
                              "settings"    {:settings {:database-enable-actions true}}}]
        (testing (str "changing the " what " records one database-update row for the admin")
          (let [before (max-id)]
            (mt/user-http-request :crowberto :put 200 (str "database/" db-id) changes)
            (is (= [{:topic :database-update :model "Database" :model_id db-id :user_id (mt/user->id :crowberto)
                     :details {:previous {} :new {}}}]
                   (rows-since before))))))
      (testing "changing the connection details records one database-update row for the admin"
        (let [before (max-id)]
          (mt/with-current-user (mt/user->id :crowberto)
            (t2/update! :model/Database :id db-id {:details (assoc (:details (mt/db)) :let-user-control-scheduling true)}))
          (is (= [[:database-update "Database" db-id]] (topics-since before))))))))

(deftest database-update-keeps-secrets-out-of-details-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db)) :name "Audited"}]
      (let [before (max-id)]
        (mt/with-current-user (mt/user->id :crowberto)
          (t2/update! :model/Database :id db-id {:details (assoc (:details (mt/db)) :password "zz-secret-password")}))
        (is (= 1 (count (rows-since before))))
        (is (not (re-find #"zz-secret-password" (pr-str (rows-since before)))))))))

(deftest database-sync-bookkeeping-records-nothing-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db))}]
      (let [before (max-id)]
        (mt/with-current-user (mt/user->id :crowberto)
          (t2/update! :model/Database :id db-id {:initial_sync_status "complete" :dbms_version {:flavor "H2"}}))
        (is (= [] (rows-since before)))))))

(deftest user-update-records-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {user-id :id} {}]
      (doseq [[what changes] {"login attributes" {:login_attributes {"region" "west"}}
                              "locale"           {:locale "fr"}
                              "superuser flag"   {:is_superuser true}
                              "first name"       {:first_name "Renamed"}}]
        (testing (str "changing the " what " records one user-update row for the admin")
          (let [before (max-id)]
            (mt/user-http-request :crowberto :put 200 (str "user/" user-id) changes)
            (is (= [[:user-update "User" user-id]]
                   (->> (rows-since before)
                        (filter #(= :user-update (:topic %)))
                        (mapv (juxt :topic :model :model_id)))))))))))

(deftest user-deactivation-records-no-update-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [before (max-id)]
        (mt/user-http-request :crowberto :delete 200 (str "user/" user-id))
        (is (= [[:user-deactivated "User" user-id]] (topics-since before)))))))

(deftest glossary-definition-edit-records-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-model-cleanup [:model/Glossary]
      (let [{id :id} (mt/user-http-request :crowberto :post 200 "glossary" {:term "audited term" :definition "a"})
            before   (max-id)]
        (mt/user-http-request :crowberto :put 200 (str "glossary/" id) {:term "audited term" :definition "b"})
        (is (= [[:glossary-update "Glossary" id]] (topics-since before)))))))

(deftest channel-details-edit-records-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-model-cleanup [:model/Channel]
      (let [{id :id} (mt/user-http-request :crowberto :post 200 "channel" notification.tu/default-can-connect-channel)
            before   (max-id)]
        (mt/user-http-request :crowberto :put 200 (str "channel/" id)
                              {:details {:return-type "return-value" :return-value false}})
        (is (= [[:channel-update "Channel" id]] (topics-since before)))))))

(deftest tenant-update-records-row-test
  (mt/with-premium-features #{:audit-app :tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Audited tenant" :slug "audited-tenant"}]
        (let [before (max-id)]
          (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" tenant-id) {:name "Renamed tenant"})
          (is (= [[:tenant-update "Tenant" tenant-id]] (topics-since before))))))))
