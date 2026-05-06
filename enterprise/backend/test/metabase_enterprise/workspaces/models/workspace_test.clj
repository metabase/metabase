(ns metabase-enterprise.workspaces.models.workspace-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- ws-db-attrs
  ([] (ws-db-attrs {}))
  ([overrides]
   (merge {:database_id      (mt/id)
           :database_details {:user "alice" :password "s3cr3t"}
           :output_schema    "ws_out"
           :input_schemas    ["public" "analytics"]}
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
        (is (t2/exists? :model/Workspace :id (:id created)))))))

(deftest create-workspace-with-databases-test
  (testing "create-workspace! stores nested workspace_database rows"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}]
        (let [created (create-ws!
                       {:name      "With DBs"
                        :databases [(ws-db-attrs)
                                    (ws-db-attrs {:database_id   db2-id
                                                  :output_schema "other_out"
                                                  :input_schemas ["raw"]})]})
              dbs     (:databases created)]
          (is (= 2 (count dbs)))
          (is (= #{"ws_out" "other_out"} (into #{} (map :output_schema) dbs)))
          (testing "JSON columns round-trip with keywordized keys"
            (let [first-db (first (filter #(= "ws_out" (:output_schema %)) dbs))]
              (is (= {:user "alice" :password "s3cr3t"} (:database_details first-db)))
              (is (= ["public" "analytics"] (:input_schemas first-db))))))))))

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

(deftest update-workspace-replaces-databases-test
  (testing "update-workspace! replaces the set of workspace_databases"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}]
        (let [{id :id} (create-ws!
                        {:name      "Before"
                         :databases [(ws-db-attrs {:output_schema "keep_out"
                                                   :input_schemas ["keep"]})
                                     (ws-db-attrs {:database_id   db2-id
                                                   :output_schema "drop_out"
                                                   :input_schemas ["drop"]})]})
              updated  (workspace/update-workspace!
                        id
                        {:name      "After"
                         :databases [(ws-db-attrs {:output_schema "keep_out"
                                                   :input_schemas ["keep"]})
                                     (ws-db-attrs {:database_id   db2-id
                                                   :output_schema "new_out"
                                                   :input_schemas ["new"]})]})]
          (is (= "After" (:name updated)))
          (is (= #{"keep_out" "new_out"}
                 (into #{} (map :output_schema) (:databases updated))))
          (testing "the removed workspace_database is gone from the database"
            (is (not (t2/exists? :model/WorkspaceDatabase
                                 :workspace_id id
                                 :output_schema "drop_out")))))))))

(deftest update-workspace-can-clear-databases-test
  (testing "update-workspace! with empty :databases removes all children"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (create-ws!
                      {:name "To Clear" :databases [(ws-db-attrs)]})
            updated  (workspace/update-workspace! id {:name "Cleared" :databases []})]
        (is (= [] (:databases updated)))
        (is (not (t2/exists? :model/WorkspaceDatabase :workspace_id id)))))))

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

(deftest status-can-be-updated-test
  (testing "update-workspace! can change the :status of a workspace_database"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (create-ws!
                      {:name      "Evolving"
                       :databases [(ws-db-attrs {:status :unprovisioned})]})
            updated  (workspace/update-workspace!
                      id
                      {:name      "Evolving"
                       :databases [(ws-db-attrs {:status :provisioned})]})]
        (is (= :provisioned (:status (first (:databases updated)))))))))

(deftest update-preserves-initialized-rows-test
  (testing "update-workspace! leaves :provisioned rows untouched when the PUT keeps their database_id + input_schemas"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {init-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {:user "keep-me" :password "keep-pw"}
                    :output_schema    "keep_schema"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [updated (workspace/update-workspace!
                     ws-id
                     {:name      "Renamed"
                      :databases [{:database_id (mt/id) :input_schemas ["public"]}]})
            row     (t2/select-one :model/WorkspaceDatabase :id init-id)]
        (testing "name update takes effect"
          (is (= "Renamed" (:name updated))))
        (testing "the initialized row was not deleted + reinserted (its id is the same)"
          (is (some? row))
          (is (= :provisioned (:status row))))
        (testing "credentials and output_schema are preserved verbatim"
          (is (= {:user "keep-me" :password "keep-pw"} (:database_details row)))
          (is (= "keep_schema" (:output_schema row))))))))

(deftest update-rejects-dropping-initialized-test
  (testing "update-workspace! refuses to drop an :provisioned row"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {:user "u"}
                    :output_schema    "sch"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (is (thrown-with-msg?
           Exception
           #"provisioned"
           (workspace/update-workspace!
            ws-id
            {:name "WS" :databases [{:database_id db2-id :input_schemas ["public"]}]}))))))

(deftest update-rejects-changing-initialized-input-schemas-test
  (testing "update-workspace! refuses to change :input_schemas of an :provisioned row"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {:user "u"}
                    :output_schema    "sch"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (is (thrown-with-msg?
           Exception
           #"provisioned"
           (workspace/update-workspace!
            ws-id
            {:name      "WS"
             :databases [{:database_id (mt/id) :input_schemas ["analytics"]}]}))))))

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
