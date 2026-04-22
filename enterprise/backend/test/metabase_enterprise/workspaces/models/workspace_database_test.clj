(ns metabase-enterprise.workspaces.models.workspace-database-test
  "Tests for the `:model/Database` pre-delete hook that reconciles workspace_database
   rows before deletion.

   Background: `workspace_database.database_id -> metabase_database.id` used to be
   ON DELETE CASCADE, which silently removed the row when the parent Database was
   deleted — orphaning any `:initialized` warehouse schemas/users because the 409
   guard in `delete-workspace!` was never consulted. We switched the FK to
   RESTRICT, which requires the app-side to reconcile rows explicitly: refuse the
   delete if any row is `:initialized`, otherwise delete the `:uninitialized`
   rows so the FK is satisfied."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- with-tracked-ids [f]
  (let [ids (atom {:dbs #{} :workspaces #{} :workspace-dbs #{}})]
    (try
      (f (fn track-db!  [id] (swap! ids update :dbs            conj id))
         (fn track-ws!  [id] (swap! ids update :workspaces     conj id))
         (fn track-wsd! [id] (swap! ids update :workspace-dbs  conj id)))
      (finally
        ;; Manual cleanup in reverse-FK order: wsd rows first, then workspaces, then dbs.
        (when-let [wsd-ids (seq (:workspace-dbs @ids))]
          (try (t2/delete! :workspace_database :id [:in wsd-ids]) (catch Throwable _ nil)))
        (when-let [ws-ids (seq (:workspaces @ids))]
          (try (t2/delete! :model/Workspace :id [:in ws-ids]) (catch Throwable _ nil)))
        (when-let [db-ids (seq (:dbs @ids))]
          ;; Use raw table to bypass our pre-delete hook during teardown, in case
          ;; the test left behind state the hook would refuse.
          (try (t2/delete! :workspace_database :database_id [:in db-ids]) (catch Throwable _ nil))
          (try (t2/delete! :metabase_database :id [:in db-ids]) (catch Throwable _ nil)))))))

(deftest pre-delete-refuses-database-with-initialized-workspace-databases-test
  (testing "deleting a Database with an :initialized WorkspaceDatabase child raises 409 and leaves state untouched"
    (mt/with-premium-features #{:workspaces}
      (with-tracked-ids
        (fn [track-db! track-ws! track-wsd!]
          (let [db-id  (t2/insert-returning-pk! :model/Database
                                                {:name "pre-delete-refuse-initialized-db"
                                                 :engine :h2 :details {}
                                                 :created_at :%now :updated_at :%now})
                _      (track-db! db-id)
                ws-id  (t2/insert-returning-pk! :model/Workspace
                                                {:name "pre-delete-refuse-initialized-ws"})
                _      (track-ws! ws-id)
                wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                                {:workspace_id ws-id
                                                 :database_id  db-id
                                                 :database_details {}
                                                 :output_schema ""
                                                 :input_schemas []
                                                 :status :initialized})]
            (track-wsd! wsd-id)
            (let [thrown (try (t2/delete! :model/Database :id db-id) nil
                              (catch Throwable t t))]
              (is (some? thrown)
                  "deletion of a Database with initialized workspace_database children must throw")
              (is (= 409 (:status-code (ex-data thrown)))
                  "the exception must surface as a 409 so the API layer returns Conflict, not 500")
              (is (true? (t2/exists? :model/Database :id db-id))
                  "Database row must still exist after the refused delete")
              (is (true? (t2/exists? :model/WorkspaceDatabase :id wsd-id))
                  "WorkspaceDatabase row must still exist after the refused delete"))))))))

(deftest pre-delete-cleans-up-uninitialized-workspace-databases-test
  (testing "deleting a Database whose only workspace_database children are :uninitialized succeeds"
    ;; The FK is RESTRICT; the pre-delete hook must remove those rows so the delete
    ;; can proceed. Semantically this preserves the old CASCADE-like ergonomics for the
    ;; safe case (nothing provisioned on the warehouse side).
    (mt/with-premium-features #{:workspaces}
      (with-tracked-ids
        (fn [track-db! track-ws! track-wsd!]
          (let [db-id  (t2/insert-returning-pk! :model/Database
                                                {:name "pre-delete-cleanup-uninitialized-db"
                                                 :engine :h2 :details {}
                                                 :created_at :%now :updated_at :%now})
                _      (track-db! db-id)
                ws-id  (t2/insert-returning-pk! :model/Workspace
                                                {:name "pre-delete-cleanup-uninitialized-ws"})
                _      (track-ws! ws-id)
                wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                                {:workspace_id ws-id
                                                 :database_id  db-id
                                                 :database_details {}
                                                 :output_schema ""
                                                 :input_schemas []
                                                 :status :uninitialized})]
            (track-wsd! wsd-id)
            (t2/delete! :model/Database :id db-id)
            (is (false? (t2/exists? :model/Database :id db-id))
                "Database row is gone after successful delete")
            (is (false? (t2/exists? :model/WorkspaceDatabase :id wsd-id))
                "pre-delete hook must have removed the uninitialized workspace_database row first")))))))

(deftest fk-restrict-is-defense-in-depth-test
  (testing "FK constraint blocks cascade-delete of an :initialized workspace_database even if the app-level hook is bypassed"
    ;; `(t2/delete! :metabase_database ...)` against the raw table name bypasses the
    ;; `before-delete` hook (per toucan2 docs). The FK must still refuse the delete so
    ;; the warehouse schema isn't silently orphaned by a path that doesn't know about
    ;; the workspace invariants.
    (mt/with-premium-features #{:workspaces}
      (with-tracked-ids
        (fn [track-db! track-ws! track-wsd!]
          (let [db-id  (t2/insert-returning-pk! :model/Database
                                                {:name "fk-restrict-defense-db"
                                                 :engine :h2 :details {}
                                                 :created_at :%now :updated_at :%now})
                _      (track-db! db-id)
                ws-id  (t2/insert-returning-pk! :model/Workspace
                                                {:name "fk-restrict-defense-ws"})
                _      (track-ws! ws-id)
                wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                                {:workspace_id ws-id
                                                 :database_id  db-id
                                                 :database_details {}
                                                 :output_schema ""
                                                 :input_schemas []
                                                 :status :initialized})]
            (track-wsd! wsd-id)
            (let [thrown (try (t2/delete! :metabase_database :id db-id) nil
                              (catch Throwable t t))]
              (is (some? thrown)
                  "raw-table delete must still throw — the FK enforces the invariant at the DB layer")
              (is (true? (t2/exists? :model/WorkspaceDatabase :id wsd-id))
                  "WorkspaceDatabase row must survive the refused raw delete"))))))))
