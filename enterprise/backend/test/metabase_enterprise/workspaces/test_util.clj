(ns ^:mb/driver-tests metabase-enterprise.workspaces.test-util
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.dag-abstract :as dag-abstract]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase.app-db.core :as app-db]
   [metabase.config.core :as config]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

;;;; Shorthand notation helpers

(defn transform?
  "Check if keyword represents a transform (starts with 'x')."
  [kw]
  (= \x (first (name kw))))

(defn table?
  "Check if keyword represents a table (starts with 't')."
  [kw]
  (= \t (first (name kw))))

(defn kw->id
  "Extract numeric id from shorthand keyword (e.g., :x1 -> 1, :t2 -> 2)."
  [kw]
  (parse-long (subs (name kw) 1)))

;;;; Building blocks for test resource creation

(defn- build-source-query
  "Build a native source query referencing the given table IDs."
  [table-ids]
  (if (seq table-ids)
    {:database (mt/id)
     :type     :native
     :native   {:query (str "SELECT * FROM "
                            (->> (t2/select [:model/Table :schema :name] :id [:in table-ids])
                                 (map #(str (:schema %) "." (:name %)))
                                 (str/join ", ")))}}
    {:database (mt/id)
     :type     :native
     :native   {:query "SELECT 1"}}))

(defn- build-transform-target
  "Build target map for a transform."
  [tx-sym schema]
  (let [driver    (t2/select-one-fn :engine [:model/Database :engine] (mt/id))
        normalize #(sql.normalize/normalize-name driver %)]
    {:type     "table"
     :database (mt/id)
     :schema   (some-> schema normalize)
     :name     (normalize (str "test_table_" (kw->id tx-sym)))}))

(defn create-tables!
  "Create test tables for the given table symbols. Returns {symbol -> table-id}."
  [table-syms schema]
  (let [driver    (t2/select-one-fn :engine [:model/Database :engine] (mt/id))
        normalize #(sql.normalize/normalize-name driver %)]
    (into {}
          (for [t table-syms]
            [t (t2/insert-returning-pk! :model/Table
                                        {:db_id  (mt/id)
                                         :schema (some-> schema normalize)
                                         :name   (normalize (str "test_table_" (kw->id t)))
                                         :active true})]))))

(defn create-transform!
  "Create a global transform with given dependencies. Returns transform ID."
  [tx-sym deps id-map schema]
  (let [table-ids (->> deps (filter table?) (map id-map) (filter some?))
        source    (build-source-query table-ids)
        target    (build-transform-target tx-sym schema)]
    (t2/insert-returning-pk! :model/Transform
                             {:name   (str "Test " (name tx-sym))
                              :source {:type :query :query source}
                              :target target})))

(defn add-transform-to-workspace!
  "Add a transform to a workspace via API. Returns ref-id.

   For checkouts: provide :global-tx (the global transform to checkout)
   For new transforms: provide :deps and :id-map to build the source
   If both :global-tx and :deps are provided, the deps override the global source."
  [ws-id tx-sym {:keys [global-tx deps id-map schema]}]
  (let [body     (if global-tx
                   ;; Checkout: use global transform's body (can be overridden with deps)
                   (cond-> (select-keys global-tx [:name :description :source :target])
                     deps (assoc :source {:type  :query
                                          :query (build-source-query
                                                  (->> deps (filter table?) (map id-map)))}))
                   ;; New: build from deps
                   {:name   (str "Test " (name tx-sym))
                    :source {:type :query :query (build-source-query
                                                  (->> deps (filter table?) (map id-map)))}
                    :target (build-transform-target tx-sym schema)})
        response (mt/user-http-request :crowberto :post 200
                                       (str "ee/workspace/" ws-id "/transform")
                                       (cond-> body
                                         global-tx (assoc :global_id (:id global-tx))))]
    (:ref_id response)))

;;;; Orchestration functions

(defn create-global-resources!
  "Create test transforms and tables from shorthand dependency graph.
   Automatically expands shorthand notation (e.g., :x2 [:x1] becomes :x2 [:t1], :t1 [:x1]).
   Returns {symbol -> id} for both tables and transforms.

   NOTE: Caller should wrap in mt/with-model-cleanup for proper cleanup."
  [dependencies]
  (let [expanded-deps (dag-abstract/expand-shorthand dependencies)
        schema        (str/replace (str (random-uuid)) "-" "_")
        all-ids       (set (concat (keys expanded-deps) (mapcat val expanded-deps)))
        table-syms    (filter table? all-ids)
        tx-syms       (filter transform? all-ids)

        ;; Create tables first
        table-ids  (create-tables! table-syms schema)

        ;; Create transforms (they depend on tables)
        tx-ids     (into {}
                         (for [tx tx-syms]
                           [tx (create-transform! tx (get expanded-deps tx []) table-ids schema)]))

        ;; Insert dependencies (usually inserted as side effect of running the transform, but we want to skip that)
        _          (doseq [[tx-kw tx-id] tx-ids]
                     (let [output-table-sym (keyword (str "t" (kw->id tx-kw)))]
                       (when-let [table-id (table-ids output-table-sym)]
                         (app-db/update-or-insert! :model/Dependency
                                                   {:to_entity_type   "transform"
                                                    :to_entity_id     tx-id
                                                    :from_entity_type "table"
                                                    :from_entity_id   table-id}))))]
    (merge table-ids tx-ids)))

(defn- create-workspace-for-test! [props]
  (let [creator-id (or (:creator_id props) (mt/user->id :crowberto))
        props      (-> props
                       (dissoc :creator_id)
                       (update :database_id #(or % (mt/id))))]
    (mt/with-current-user creator-id
      (ws.common/create-workspace! creator-id props))))

(defn create-resources!
  "Create test resources from shorthand notation for both global and workspace transforms.

   Input: {:global dependencies-graph (shorthand)
           :workspace {:checkouts ids, :definitions dependencies-graph (shorthand)}}

   Returns: {:workspace-id int
             :global-map {symbol -> db-id}
             :workspace-map {symbol -> ref-id}}

   NOTE: Caller should wrap in mt/with-model-cleanup for proper cleanup."
  [{:keys [global workspace]}]
  (let [{:keys [checkouts definitions]} workspace
        checkouts        (set checkouts)
        schema           (str/replace (str (random-uuid)) "-" "_")

        ;; Expand shorthand to insert intermediate table nodes
        expanded-global  (dag-abstract/expand-shorthand global)
        expanded-ws-defs (when definitions (dag-abstract/expand-shorthand definitions))

        ;; Find all tables needed (union of global and workspace)
        global-tables    (set (filter table? (concat (keys expanded-global)
                                                     (mapcat val expanded-global))))
        ws-tables        (when expanded-ws-defs
                           (set (filter table? (concat (keys expanded-ws-defs)
                                                       (mapcat val expanded-ws-defs)))))
        all-tables       (set/union global-tables (or ws-tables #{}))

        ;; Create all tables upfront
        table-ids        (create-tables! all-tables schema)

        ;; Create global transforms
        global-tx-syms   (filter transform? (keys expanded-global))
        global-tx-ids    (into {}
                               (for [tx global-tx-syms]
                                 [tx (create-transform! tx (get expanded-global tx []) table-ids schema)]))

        ;; Insert global dependencies
        _                (doseq [[tx-kw tx-id] global-tx-ids]
                           (let [output-table-sym (keyword (str "t" (kw->id tx-kw)))]
                             (when-let [table-id (table-ids output-table-sym)]
                               (app-db/update-or-insert! :model/Dependency
                                                         {:to_entity_type   "transform"
                                                          :to_entity_id     tx-id
                                                          :from_entity_type "table"
                                                          :from_entity_id   table-id}))))

        global-map       (merge table-ids global-tx-ids)

        ;; Create workspace
        ws               (create-workspace-for-test! {:name (or (:name workspace) (str "test-ws-" (random-uuid)))})
        ws-id            (:id ws)

        ;; Determine which workspace transforms to create
        ws-tx-syms       (distinct (concat
                                    ;; Checkouts not overridden in definitions
                                    (filter #(not (contains? (set (keys definitions)) %)) checkouts)
                                    ;; All transforms from definitions
                                    (when expanded-ws-defs
                                      (filter transform? (keys expanded-ws-defs)))))

        ;; Create workspace transforms
        workspace-map    (into {}
                               (for [tx ws-tx-syms]
                                 (let [is-checkout? (contains? checkouts tx)
                                       in-defs?     (contains? (set (keys definitions)) tx)
                                       global-tx    (when is-checkout?
                                                      (t2/select-one :model/Transform (global-map tx)))
                                       deps         (when (or (not is-checkout?) in-defs?)
                                                      (get expanded-ws-defs tx []))]
                                   [tx (add-transform-to-workspace! ws-id tx
                                                                    {:global-tx global-tx
                                                                     :deps      deps
                                                                     :id-map    global-map
                                                                     :schema    schema})])))]
    {:workspace-id  ws-id
     :global-map    global-map
     :workspace-map workspace-map}))

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
                                                :model/WorkspaceOutput]
                          (tests)))))

(derive :model/Workspace :model/WorkspaceCleanUpInTest)

(t2/define-before-delete :model/WorkspaceCleanUpInTest
  [workspace]
  (try
    (log/infof "Cleaningup workspace %d in tests" (:id workspace))
    (when (:database_details workspace)
      (let [database (t2/select-one :model/Database (:database_id workspace))]
        (ws.isolation/destroy-workspace-isolation! database workspace)))
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

(defn create-ready-ws!
  "Create a simple workspace and wait for it to be ready."
  [name]
  (ws-ready (:workspace-id (create-resources! {:workspace {:name name, :definitions {:x2 [:t1]}}}))))

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

(defn analyze-workspace!
  "Trigger the reconstruction and persistence of the workspace graph."
  [id]
  (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" id "/graph")))
