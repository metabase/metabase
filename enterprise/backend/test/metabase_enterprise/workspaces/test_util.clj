(ns ^:mb/driver-tests metabase-enterprise.workspaces.test-util
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase.config.core :as config]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn ws-fixtures!
  "Sets up test fixtures for workspace tests. Must be called at the top level of test namespaces."
  []
  (use-fixtures :once (fn [tests]
                        ;; E.g. app-db.yml tests perorm driver tests. Workspaces are not supported on mysql.
                        ;; Following disj suppresses those runs destined for failure.
                        (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
                          (mt/with-premium-features [:workspaces :dependencies :transforms]
                            (search.tu/with-index-disabled
                              (tests))))))

  (use-fixtures :each (fn [tests]
                        (mt/with-model-cleanup [:model/Collection
                                                :model/Transform
                                                :model/TransformRun
                                                :model/Workspace
                                                :model/WorkspaceTransform
                                                :model/WorkspaceInput
                                                :model/WorkspaceOutput
                                                :model/WorkspaceDependency]
                          (tests)))))

(derive :model/Workspace :model/WorkspaceCleanUpInTest)

(t2/define-before-delete :model/WorkspaceCleanUpInTest
  [workspace]
  (try
    (log/infof "Cleaningup workspace %d in tests" (:id workspace))
    (when (:database_details workspace)
      (ws.isolation/destroy-workspace-isolation! (t2/select-one :model/Database (:database_id workspace)) workspace))
    (catch Exception e
      (log/warn e "Failed to destroy isolation" {:workspace workspace})))
  workspace)

(defn ws-ready
  "Poll until workspace status becomes :ready or timeout.
   Note: uninitialized workspaces will never become ready without adding a transform."
  [ws-or-id]
  (let [ws-id (cond-> ws-or-id
                (map? ws-or-id) :id)]
    (or (u/poll {:thunk      #(t2/select-one :model/Workspace :id ws-id)
                 :done?      #(contains? #{:ready :broken} (:db_status %))
                 ;; some cloud drivers are really slow
                 :timeout-ms (if config/is-dev? 10000 60000)})
        (throw (ex-info "Timeout waiting for workspace to be ready" {:workspace-id ws-id})))))

(defn- create-workspace-for-test! [props]
  (let [creator-id (or (:creator_id props) (mt/user->id :crowberto))
        props      (-> props
                       (dissoc :creator_id)
                       (update :database_id #(or % (mt/id))))]
    (mt/with-current-user creator-id
      (ws.common/create-workspace! creator-id props))))

;; TODO (chris 2026/01/06) this needs a transform added for it to really be ready
(defn create-ready-ws!
  "Create a workspace and wait for it to be ready."
  [name]
  (create-workspace-for-test! {:name name}))

(defn do-with-workspaces!
  "Function that sets up workspaces for testing and cleans up afterwards.
  Takes a sequence of props for workspace creation and a thunk that receives
  the created workspaces as a vector. Each workspace is cleaned up by its own
  stack frame, so cleanup naturally happens in reverse creation order."
  [props-list thunk]
  (if (empty? props-list)
    (thunk [])
    (let [ws (create-workspace-for-test! (first props-list))]
      (try
        (do-with-workspaces! (rest props-list)
                             (fn [rest-workspaces]
                               (thunk (into [ws] rest-workspaces))))
        (finally
          (when ws
            (try
              (ws.model/delete! (t2/select-one :model/Workspace :id (:id ws)))
              (catch Exception _
                ;; Workspace may already be deleted by the test
                nil))))))))

(defmacro with-workspaces!
  "Execute body with properly initialized workspaces that are cleaned up afterward.

  Creates each workspace using `ws.common/create-workspace!` and waits for it to
  be ready. After body execution (or on error), cleans up using `ws.model/delete!`
  which properly destroys database isolation resources.

  Usage:
    (with-workspaces [ws1 {:name \"Test WS 1\"}
                      ws2 {:name \"Test WS 2\" :database_id (mt/id)}]
      (testing \"workspace operations\"
        (is (= :ready (:status ws1)))))"
  [bindings & body]
  (assert (vector? bindings) "bindings must be a vector")
  (assert (even? (count bindings)) "bindings must have an even number of forms")
  (let [pairs      (partition 2 bindings)
        syms       (mapv first pairs)
        props-list (mapv second pairs)]
    `(do-with-workspaces!
      [~@props-list]
      (fn [[~@syms]]
        ~@body))))
