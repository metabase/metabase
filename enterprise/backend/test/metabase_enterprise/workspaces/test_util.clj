(ns ^:mb/driver-tests metabase-enterprise.workspaces.test-util
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.dag-abstract :as dag-abstract]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase.app-db.core :as app-db]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(defn unique-name
  "Generate a unique name for test resources to avoid conflicts."
  ([] (unique-name "Test"))
  ([prefix] (str prefix " " (random-uuid))))

;;;; Shorthand notation helpers

(defn transform?
  "Check if keyword represents a transform (keyword starting with 'x')."
  [kw]
  (and (keyword? kw)
       (= \x (first (name kw)))))

(defn mock-table?
  "Check if keyword represents a mock table (keyword starting with 't')."
  [kw]
  (and (keyword? kw)
       (= \t (first (name kw)))))

(defn real-table?
  "Check if ref is a string (existing table reference by name)."
  [ref]
  (string? ref))

(defn kw->id
  "Extract numeric id from shorthand keyword (e.g., :x1 -> 1, :t2 -> 2)."
  [kw]
  (assert (keyword? kw) (str "kw->id requires a keyword, got: " (pr-str kw)))
  (parse-long (subs (name kw) 1)))

(defn- real-table-id
  "Look up an existing table by name (case-insensitive). Returns table ID."
  [db-id table-name]
  (or (t2/select-one-fn :id :model/Table
                        :db_id db-id
                        :active true
                        {:where [:= [:lower :name] (u/lower-case-en table-name)]})
      (throw (ex-info (str "Existing table not found: " table-name) {:table table-name}))))

;;;; Query helpers

(defn mbql->native
  "Convert an MBQL query to a native query map suitable for use in transform tests.
   This generates driver-specific SQL with properly qualified table names."
  [query]
  (qp.store/with-metadata-provider (mt/id)
    (sql.qp/mbql->native driver/*driver* (qp.preprocess/preprocess query))))

;;;; Building blocks for test resource creation

(defn- build-source-query
  "Build a native source query referencing the given table IDs."
  [db-id table-ids]
  (if (seq table-ids)
    {:database db-id
     :type     :native
     :native   {:query (str "SELECT * FROM "
                            (->> (t2/select [:model/Table :schema :name] :id [:in table-ids])
                                 (map #(str (:schema %) "." (:name %)))
                                 (str/join ", ")))}}
    {:database db-id
     :type     :native
     :native   {:query "SELECT 1"}}))

(defn- build-transform-target
  "Build target map for a transform."
  [db-id tx-sym schema]
  (let [driver    (t2/select-one-fn :engine [:model/Database :engine] db-id)
        normalize #(sql.normalize/normalize-name driver %)]
    {:type     "table"
     :database db-id
     :schema   (some-> schema normalize)
     :name     (normalize (str "test_table_" (kw->id tx-sym)))}))

(defn create-tables!
  "Create test tables for the given table symbols. Returns {symbol -> table-id}."
  [db-id table-syms schema]
  (let [driver    (t2/select-one-fn :engine [:model/Database :engine] db-id)
        normalize #(sql.normalize/normalize-name driver %)]
    (into {}
          (for [t table-syms]
            [t (t2/insert-returning-pk! :model/Table
                                        {:db_id  db-id
                                         :schema (some-> schema normalize)
                                         :name   (normalize (str "test_table_" (kw->id t)))
                                         :active true})]))))

(defn create-transform!
  "Create a global transform with given dependencies. Returns transform ID."
  [db-id tx-sym deps id-map schema]
  (let [table-ids (->> deps
                       (keep #(cond
                                (mock-table? %) (id-map %)
                                (real-table? %) (real-table-id db-id %)
                                :else nil)))
        source    (build-source-query db-id table-ids)
        target    (build-transform-target db-id tx-sym schema)]
    (t2/insert-returning-pk! :model/Transform
                             {:name   (str "Test " (name tx-sym))
                              :source {:type :query :query source}
                              :target target})))

(defn add-transform-to-workspace!
  "Add a transform to a workspace via API. Returns ref-id.

   For checkouts: provide :global-tx (the global transform to checkout)
   For new transforms: provide :deps and :id-map to build the source
   If both :global-tx and :deps are provided, the deps override the global source."
  [db-id ws-id tx-sym {:keys [global-tx deps id-map schema]}]
  (let [resolve-table-ids (fn [deps]
                            (->> deps
                                 (keep #(cond
                                          (mock-table? %) (id-map %)
                                          (real-table? %) (real-table-id db-id %)
                                          :else nil))))
        body     (if global-tx
                   ;; Checkout: use global transform's body (can be overridden with deps)
                   (cond-> (select-keys global-tx [:name :description :source :target])
                     deps (assoc :source {:type  :query
                                          :query (build-source-query db-id (resolve-table-ids deps))}))
                   ;; New: build from deps
                   {:name   (str "Test " (name tx-sym))
                    :source {:type :query :query (build-source-query db-id (resolve-table-ids deps))}
                    :target (build-transform-target db-id tx-sym schema)})
        response (mt/user-http-request :crowberto :post 200
                                       (str "ee/workspace/" ws-id "/transform")
                                       (cond-> body
                                         global-tx (assoc :global_id (:id global-tx))))]
    (:ref_id response)))

;;;; Orchestration functions

(defn- create-workspace-for-test! [props]
  (let [creator-id (or (:creator_id props) (mt/user->id :crowberto))
        props      (-> props
                       (dissoc :creator_id)
                       (update :database_id #(or % (mt/id))))]
    (mt/with-current-user creator-id
      (ws.common/create-workspace! creator-id props))))

(defn create-resources!
  "Create test resources from shorthand notation for both global and workspace transforms.

   Input: {:database-id int (optional, defaults to mt/id)
           :global dependencies-graph (shorthand)
           :workspace {:checkouts ids, :definitions dependencies-graph (shorthand)}}

   Returns: {:workspace-id int (or nil if no workspace)
             :global-map {symbol -> db-id}
             :workspace-map {symbol -> ref-id}}

   NOTE: Caller should wrap in mt/with-model-cleanup for proper cleanup."
  [{:keys [database-id global workspace]}]
  (let [db-id            (or database-id (mt/id))
        definitions      (:definitions workspace)
        checkouts        (set (:checkouts workspace))
        schema           (str/replace (str (random-uuid)) "-" "_")

        ;; Expand shorthand to insert intermediate table nodes
        expanded-global  (dag-abstract/expand-shorthand global)
        expanded-ws-defs (when definitions (dag-abstract/expand-shorthand definitions))

        ;; Find all mock tables needed (union of global and workspace)
        global-tables    (set (filter mock-table? (concat (keys expanded-global)
                                                          (mapcat val expanded-global))))
        ws-tables        (when expanded-ws-defs
                           (set (filter mock-table? (concat (keys expanded-ws-defs)
                                                            (mapcat val expanded-ws-defs)))))
        all-tables       (set/union global-tables (or ws-tables #{}))

        ;; Create all mock tables upfront
        table-ids        (create-tables! db-id all-tables schema)

        ;; Collect and resolve all real table references
        real-table-ids   (into {}
                               (for [ref (distinct
                                          (filter real-table?
                                                  (concat (mapcat val expanded-global)
                                                          (mapcat val (or expanded-ws-defs {})))))]
                                 [ref (real-table-id db-id ref)]))

        ;; Create global transforms
        global-tx-syms   (filter transform? (keys expanded-global))
        global-tx-ids    (into {}
                               (for [tx global-tx-syms]
                                 [tx (create-transform! db-id tx
                                                        (get expanded-global tx [])
                                                        (merge table-ids real-table-ids) schema)]))

        ;; Insert global dependencies
        _                (doseq [[tx-kw tx-id] global-tx-ids]
                           (let [output-table-sym (keyword (str "t" (kw->id tx-kw)))]
                             (when-let [table-id (table-ids output-table-sym)]
                               (app-db/update-or-insert! :model/Dependency
                                                         {:to_entity_type   "transform"
                                                          :to_entity_id     tx-id
                                                          :from_entity_type "table"
                                                          :from_entity_id   table-id}))))

        global-map       (merge table-ids global-tx-ids real-table-ids)

        ;; Create workspace (only if workspace key was provided)
        ws               (when workspace
                           (create-workspace-for-test! {:name        (or (:name workspace)
                                                                         (str "test-ws-" (random-uuid)))
                                                        :database_id db-id}))
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
                                   [tx (add-transform-to-workspace! db-id ws-id tx
                                                                    {:global-tx global-tx
                                                                     :deps      deps
                                                                     :id-map    global-map
                                                                     :schema    schema})])))

        ;; Apply per-transform properties (e.g., staleness flags)
        _                (when-let [props (:properties workspace)]
                           (doseq [[tx-sym updates] props]
                             (when-let [ref-id (workspace-map tx-sym)]
                               (t2/update! :model/WorkspaceTransform {:workspace_id ws-id :ref_id ref-id} updates))))]
    {:workspace-id  ws-id
     :global-map    global-map
     :workspace-map workspace-map}))

(defmacro with-resources!
  "Create test resources and bind the result map. Cleanup is handled by ws-fixtures!.

   Usage: (with-resources! [res {:workspace {:definitions {:x2 [:x1]}
                                             :properties  {:x1 {:definition_changed true}}}}]
            (:workspace-id res))"
  [[binding resource-spec] & body]
  `(let [~binding (create-resources! ~resource-spec)]
     ~@body))

(defn- append-url-part [url part]
  (case [(str/starts-with? part "/")
         (str/ends-with? url "/")]
    [false false] (str url \/ part)
    ([true false]
     [false true]) (str url part)
    (str url (subs part 1))))

(defn ws-url
  "Build an API URL for a workspace resource, e.g. (ws-url 42 \"/transform/\" ref-id)."
  [id & path]
  (when (some nil? (cons id path))
    (throw (ex-info "Cannot build workspace URL without key resources"
                    {:id id, :path path})))
  (reduce append-url-part (str "ee/workspace/" id) (map str path)))

(defn staleness-flags
  "Return a map of ref-id to staleness flags for all transforms in a workspace.
   E.g. {\"ref-1\" {:definition_changed false :input_data_changed true}}"
  [workspace-id]
  (t2/select-fn->fn :ref_id #(select-keys % [:definition_changed :input_data_changed])
                    [:model/WorkspaceTransform :ref_id :definition_changed :input_data_changed]
                    :workspace_id workspace-id))

(defmacro with-mocked-execution
  "Execute body with ws.execute/run-transform-with-remapping stubbed to return success.
   Useful for testing workspace execution logic without running real transforms."
  [& body]
  `(mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                               (fn [_transform# _remapping#]
                                 {:status   :succeeded
                                  :end_time (Instant/now)
                                  :message  "Mocked execution"})]
     ~@body))

(defn mock-run-transform!
  "Mock-execute a workspace transform by ref-id.
   Stubs the execution engine to return success, then calls ws.impl/run-transform!."
  [workspace-id ref-id]
  (with-mocked-execution
    (let [workspace    (t2/select-one :model/Workspace workspace-id)
          graph        (ws.impl/get-or-calculate-graph! workspace)
          ws-transform (t2/select-one :model/WorkspaceTransform :workspace_id workspace-id :ref_id ref-id)]
      (mt/with-current-user (mt/user->id :crowberto)
        (ws.impl/run-transform! workspace graph ws-transform)))))

(defn ws-fixtures!
  "Sets up test fixtures for workspace tests. Must be called at the top level of test namespaces."
  []
  (use-fixtures :each (fn [tests]
                        (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
                          (mt/with-premium-features [:workspaces :dependencies :transforms :transforms-python]
                            (search.tu/with-index-disabled
                              (mt/with-model-cleanup [:model/Collection
                                                      :model/Transform
                                                      :model/TransformRun
                                                      :model/Workspace
                                                      :model/WorkspaceTransform
                                                      :model/WorkspaceInput
                                                      :model/WorkspaceInputTransform
                                                      :model/WorkspaceOutput]
                                (tests))))))))

(derive :model/Workspace :model/WorkspaceCleanUpInTest)

(t2/define-before-delete :model/WorkspaceCleanUpInTest
  [workspace]
  (try
    (if (:database_details workspace)
      (let [database (t2/select-one :model/Database (:database_id workspace))]
        (log/infof "Cleaning up workspace %d in tests" (:id workspace))
        (ws.isolation/destroy-workspace-isolation! database workspace))
      (log/infof "Skip cleaning up workspace %d due to no database details" (:id workspace)))
    (catch Exception e
      (log/warn e "Failed to destroy isolation" {:workspace workspace})))
  workspace)

(defn ws-done!
  "Poll until workspace status is no longer :pending.
   Returns immediately if workspace has not started initializing, which requires a transform being added."
  [ws-or-id]
  (let [ws-id (cond-> ws-or-id
                (map? ws-or-id) :id)]
    (or (u/poll {:thunk      #(t2/select-one :model/Workspace :id ws-id)
                 :done?      #(not= :pending (:db_status %))
                 ;; some cloud drivers are really slow
                 :timeout-ms (if config/is-dev? 10000 60000)})
        (throw (ex-info "Timeout waiting for workspace to finish initializing" {:workspace-id ws-id})))))

(defn create-empty-ws!
  "Create a simple workspace and wait for it to be ready."
  [name]
  (t2/select-one :model/Workspace (:workspace-id (create-resources! {:workspace {:name name}}))))

(defn initialize-ws!
  "Create a workspace with a transform to trigger initialization, and wait for it to finish.
   Returns the workspace regardless of its final status (ready, broken, etc.)."
  [name]
  (let [graph {:workspace {:name name, :definitions {:x2 [:t1]}}}
        ws-id (:workspace-id (create-resources! graph))]
    (ws-done! ws-id)))

(defn create-ready-ws!
  "Create a simple workspace and wait for it to finish initializing database resources.
   Throws if workspace does not become ready."
  [name]
  (let [ws (initialize-ws! name)]
    (if (= :ready (:db_status ws))
      ws
      (throw (ex-info "Workspace failed to become ready"
                      {:name name :db_status (:db_status ws) :workspace-id (:id ws)})))))

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

(defn- replace-entity [{:keys [input-table workspace-transform external-transform]} entity-type entity-id]
  (get
   (case entity-type
     "input-table" input-table
     "workspace-transform" workspace-transform
     "external-transform" external-transform)
   entity-id entity-id))

(defn- table-ref? [sym]
  (or (mock-table? sym)
      (real-table? sym)))

(defn translate-graph
  "Turn a real workspace graph back into :x1 etc symbols"
  [{:keys [nodes edges]} resources-map]
  (let [mapping (merge (reduce
                        (fn [acc [sym id]]
                          (assoc-in acc
                                    [(cond
                                       (table-ref? sym) :input-table
                                       (transform? sym) :external-transform
                                       :else (throw (ex-info "Unexpected symbol" {:symbol sym :id id})))
                                     (if (table-ref? sym)
                                       (let [{:keys [db_id schema name]} (t2/select-one [:model/Table :db_id :schema :name] id)]
                                         (str db_id "-" schema "-" name))
                                       id)]
                                    sym))
                        {:input-table        {}
                         :external-transform {}}
                        (:global-map resources-map))
                       (reduce
                        (fn [acc [sym id]]
                          (assoc-in acc
                                    [(cond
                                       (transform? sym) :workspace-transform
                                       :else (throw (ex-info "Unexpected symbol" {:symbol sym :id id})))
                                     id]
                                    sym))
                        {:workspace-transform {}}
                        (:workspace-map resources-map)))]
    {:nodes (into #{} (map #(replace-entity mapping (:type %) (:id %))) nodes)
     :edges (reduce
             (fn [acc e]
               (update acc
                       (replace-entity mapping (:from_entity_type e) (:from_entity_id e))
                       (fnil conj #{})
                       (replace-entity mapping (:to_entity_type e) (:to_entity_id e))))
             {}
             edges)}))
