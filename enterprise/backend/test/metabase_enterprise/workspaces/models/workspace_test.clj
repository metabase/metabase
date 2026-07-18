(ns metabase-enterprise.workspaces.models.workspace-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase.models.interface :as mi]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- ws-db-attrs
  ([] (ws-db-attrs {}))
  ([overrides]
   (merge {:database_id      (mt/id)
           :database_details {:user "alice" :password "s3cr3t"}
           :output_namespace    "ws_out"
           :input_schemas            ["public" "analytics"]}
          overrides)))

(defn- create-ws!
  "Test helper: supply a default :creator_id so call sites stay terse."
  [params]
  (workspace/create-workspace! (merge {:creator_id (mt/user->id :crowberto)} params)))

(deftest create-workspace-minimal-test
  (testing "create-workspace! creates a Workspace with no databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [created (create-ws! {:name "Solo" :databases []})]
        (is (some? (:id created)))
        (is (= "Solo" (:name created)))
        (is (= [] (:databases created)))
        (is (t2/exists? :model/Workspace :id (:id created)))
        (testing "an API key is generated and round-trips through the encrypted column"
          (let [api-key (t2/select-one-fn :api_key :model/Workspace :id (:id created))]
            (is (string? api-key))
            (is (re-matches #"mb_.+" api-key))))))))

(deftest create-workspace-with-databases-test
  (testing "create-workspace! stores nested workspace_database rows"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}]
        (let [created (create-ws!
                       {:name      "With DBs"
                        :databases [(ws-db-attrs)
                                    (ws-db-attrs {:database_id   db2-id
                                                  :output_namespace "other_out"
                                                  :input_schemas        ["raw"]})]})
              dbs     (:databases created)]
          (is (= 2 (count dbs)))
          (is (= #{"ws_out" "other_out"} (into #{} (map :output_namespace) dbs)))
          (testing "JSON columns round-trip with keywordized keys"
            (let [first-db (first (filter #(= "ws_out" (:output_namespace %)) dbs))]
              (is (= {:user "alice" :password "s3cr3t"} (:database_details first-db)))
              (is (= ["public" "analytics"]
                     (:input_schemas first-db))))))))))

(deftest get-workspace-test
  (testing "get-workspace returns a hydrated workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (create-ws!
                      {:name "Fetch Me" :databases [(ws-db-attrs)]})
            fetched (workspace/get-workspace id)]
        (is (= "Fetch Me" (:name fetched)))
        (is (= 1 (count (:databases fetched))))
        (is (= (mt/id) (:database_id (first (:databases fetched))))))))
  (testing "get-workspace returns nil for a missing id"
    (is (nil? (workspace/get-workspace Integer/MAX_VALUE)))))

(deftest list-workspaces-test
  (testing "list-workspaces returns all workspaces with their databases hydrated"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id-a :id} (create-ws!
                        {:name "A" :databases [(ws-db-attrs)]})
            {id-b :id} (create-ws!
                        {:name "B" :databases []})
            results    (workspace/list-workspaces)
            by-id      (into {} (map (juxt :id identity)) results)]
        (is (contains? by-id id-a))
        (is (contains? by-id id-b))
        (is (= 1 (count (:databases (get by-id id-a)))))
        (is (= [] (:databases (get by-id id-b))))))))

(deftest delete-workspace-test
  (testing "delete-workspace! deletes when every database row is :unprovisioned"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (create-ws! {:name "Deletable" :databases [(ws-db-attrs)]})]
        (is (nil? (workspace/delete-workspace! id)))
        (is (not (t2/exists? :model/Workspace :id id)))
        (is (not (t2/exists? :model/WorkspaceDatabase :workspace_id id))))))
  (testing "delete-workspace! refuses (404) when any database row is not :unprovisioned"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (create-ws! {:name "Kept" :databases [(ws-db-attrs {:status :provisioned})]})]
        (is (thrown-with-msg? Exception #"not :unprovisioned"
                              (workspace/delete-workspace! id)))
        (is (= 404 (try (workspace/delete-workspace! id)
                        (catch Exception e (:status-code (ex-data e))))))
        (is (t2/exists? :model/Workspace :id id))))))

(deftest cascade-delete-workspace-test
  (testing "Deleting a Workspace cascades to its workspace_database rows"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}]
        (let [{id :id} (create-ws!
                        {:name      "Doomed"
                         :databases [(ws-db-attrs)
                                     (ws-db-attrs {:database_id db2-id})]})]
          (is (= 2 (t2/count :model/WorkspaceDatabase :workspace_id id)))
          (t2/delete! :model/Workspace :id id)
          (is (zero? (t2/count :model/WorkspaceDatabase :workspace_id id))))))))

(deftest status-defaults-to-uninitialized-test
  (testing "When :status is omitted, workspace_database defaults to :unprovisioned"
    (mt/with-model-cleanup [:model/Workspace]
      (let [created (create-ws!
                     {:name "Status Default" :databases [(ws-db-attrs)]})]
        (is (= :unprovisioned (:status (first (:databases created)))))))))

(deftest status-round-trip-test
  (testing "Caller-supplied :status round-trips as a keyword"
    (mt/with-model-cleanup [:model/Workspace]
      (let [created (create-ws!
                     {:name      "Status Set"
                      :databases [(ws-db-attrs {:status :provisioned})]})]
        (is (= :provisioned (:status (first (:databases created)))))
        (testing "and the column persists as a string in the database"
          (is (= "provisioned"
                 (:status (t2/query-one {:select [:status]
                                         :from   [:workspace_database]
                                         :where  [:= :workspace_id (:id created)]})))))))))

(deftest status-details-encrypted-round-trip-test
  (testing "workspace.status_details and workspace_database.status_details round-trip transparently"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (create-ws! {:name "Statuses" :databases [(ws-db-attrs)]})]
        (t2/update! :model/Workspace id {:status :provisioning-failure, :status_details "boom"})
        (t2/update! :model/WorkspaceDatabase {:workspace_id id} {:status_details "db boom"})
        (is (=? {:status :provisioning-failure, :status_details "boom"}
                (t2/select-one :model/Workspace :id id)))
        (is (= "db boom"
               (t2/select-one-fn :status_details :model/WorkspaceDatabase :workspace_id id)))))))

(deftest cascade-delete-database-test
  (testing "Deleting an underlying Database cascades to workspace_database rows"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details {}}]
        (let [{ws-id :id} (create-ws!
                           {:name      "Linked"
                            :databases [(ws-db-attrs {:database_id db-id})]})]
          (is (t2/exists? :model/WorkspaceDatabase :workspace_id ws-id))
          (t2/delete! :model/Database :id db-id)
          (is (not (t2/exists? :model/WorkspaceDatabase :workspace_id ws-id))))))))

;;; ========================================= Permission predicates =========================================
;;;
;;; All workspace permission predicates are superuser-only.

(defmacro ^:private with-normal-user [& body]
  `(mt/with-test-user :rasta ~@body))

(defmacro ^:private with-admin [& body]
  `(mt/with-test-user :crowberto ~@body))

(defmacro ^:private with-data-analyst [& body]
  `(perms.test-util/with-data-analyst-role! (mt/user->id :rasta)
     (mt/with-test-user :rasta ~@body)))

(deftest can-read?-test
  (testing "Workspace `mi/can-read?`"
    (mt/with-temp [:model/Workspace ws {}]
      (testing "non-superuser — false"
        (with-normal-user (is (false? (mi/can-read? ws)))))
      (testing "Data Analyst (non-superuser) — false"
        (with-data-analyst (is (false? (mi/can-read? ws)))))
      (testing "superuser — true"
        (with-admin (is (true? (mi/can-read? ws))))))))

(deftest can-create?-test
  (testing "Workspace `mi/can-create?`"
    (testing "non-superuser — false"
      (with-normal-user (is (false? (mi/can-create? :model/Workspace {})))))
    (testing "Data Analyst (non-superuser) — false"
      (with-data-analyst (is (false? (mi/can-create? :model/Workspace {})))))
    (testing "superuser — true"
      (with-admin (is (true? (mi/can-create? :model/Workspace {})))))))

(deftest can-write?-test
  (testing "Workspace `mi/can-write?`"
    (mt/with-temp [:model/Workspace ws {}]
      (testing "non-superuser — false"
        (with-normal-user (is (false? (mi/can-write? ws)))))
      (testing "Data Analyst (non-superuser) — false"
        (with-data-analyst (is (false? (mi/can-write? ws)))))
      (testing "superuser, empty workspace — true"
        (with-admin (is (true? (mi/can-write? ws))))))
    (mt/with-temp [:model/Database          {db1-id :id}       {}
                   :model/Database          {db2-id :id}       {}
                   :model/Workspace         {ws-id :id :as ws} {}
                   :model/WorkspaceDatabase _                  {:workspace_id ws-id, :database_id db1-id}
                   :model/WorkspaceDatabase _                  {:workspace_id ws-id, :database_id db2-id}]
      (testing "superuser with attached databases — true"
        (with-admin (is (true? (mi/can-write? ws))))))))
