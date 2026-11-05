(ns metabase-enterprise.workspaces.encryption-test
  "The workspace tables' encrypted columns go through the app DB's encryption maintenance: startup encryption of
  plaintext, key rotation and decrypt-db."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private k1 "workspace-key-one-12345678")
(def ^:private k2 "workspace-key-two-12345678")

(defn- raw-values
  "The stored text of both encrypted workspace columns, read through the tables rather than the models."
  []
  [(t2/select-one-fn :database_details :workspace_database)
   (t2/select-one-fn :details :workspace_provisioning_connection)])

(deftest workspace-columns-follow-encryption-maintenance-test
  ;; isolated app DB: keys change here, so nothing may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (let [insert-rows! (fn []
                         (let [db-id (t2/insert-returning-pk! :model/Database {:name    "warehouse"
                                                                               :engine  :postgres
                                                                               :details {}})
                               ws-id (ws.db/insert-workspace! "encrypted" nil)]
                           (ws.db/save-provisioning-connection! db-id {:user "provisioner", :password "ProvPassw0rd"} nil)
                           (ws.db/insert-workspace-database! {:workspace_id     ws-id
                                                              :database_id      db-id
                                                              :isolation_id     "encrypts"
                                                              :database_details {:user "u", :password "WsdPassw0rd"}
                                                              :status           :provisioned
                                                              :lock_token       (ws.status/new-lock-token)})))]
      (testing "plaintext written before a key was set is encrypted on startup"
        (insert-rows!)
        (is (every? json/decode (raw-values)) "plaintext JSON at rest")
        (encryption-test/with-secret-key k1
          (mdb/encrypt-plaintext-columns!)
          (is (every? encryption/decryptable-string? (raw-values)))))
      (testing "rotating the key re-encrypts them under the new key"
        (encryption-test/with-secret-key k1
          (mdb/encrypt-db (mdb/db-type) (mdb/data-source) k2))
        (encryption-test/with-secret-key k2
          (is (every? encryption/decryptable-string? (raw-values)))
          (is (= [{:user "u", :password "WsdPassw0rd"} {:user "provisioner", :password "ProvPassw0rd"}]
                 (map (comp json/decode+kw encryption/maybe-decrypt) (raw-values))))))
      (testing "decrypt-db writes them back as plaintext"
        (encryption-test/with-secret-key k2
          (mdb/decrypt-db (mdb/db-type) (mdb/data-source)))
        (is (= [{:user "u", :password "WsdPassw0rd"} {:user "provisioner", :password "ProvPassw0rd"}]
               (map json/decode+kw (raw-values))))))))
