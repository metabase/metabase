(ns metabase-enterprise.osi-generation.demo-api
  "Superuser-only control surface packaged on the OSI demo branch for PR-environment demos."
  (:require
   [metabase-enterprise.osi-generation.core :as generation]
   [metabase-enterprise.osi-generation.db :as demo.db]
   [metabase-enterprise.osi-generation.prompt :as generation.prompt]
   [metabase-enterprise.osi-generation.settings :as generation.settings]
   [metabase-enterprise.osi-generation.task.generate :as generation.task]
   [metabase-enterprise.search.entity-retrieval.core :as entity-retrieval.ee]
   [metabase-enterprise.search.entity-retrieval.index-table :as entity-retrieval.index-table]
   [metabase-enterprise.search.entity-retrieval.reconcile :as entity-retrieval.reconcile]
   [metabase-enterprise.search.semantic.db.datasource :as semantic.db.datasource]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.osi.models.osi-ai-context :as osi-ai-context]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.entity-retrieval.core :as entity-retrieval]
   [metabase.search.entity-retrieval.mirror :as entity-retrieval.mirror]
   [metabase.search.entity-retrieval.spec :as spec]
   [metabase.settings.core :as setting]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.time OffsetDateTime)
   (org.quartz Scheduler)))

(set! *warn-on-reflection* true)

(def ^:private generation-task-key
  ::generation.task/OsiAiContextGeneration)

(def ^:private generation-run-columns
  [:model/TaskHistory :id :status :started_at :ended_at :duration :task_details])

(def ^:private context-api-model
  ;; The public CRUD API intentionally omits the potentially large internal basis. This dev page needs
  ;; it only to compute freshness, then strips it before returning the context to the browser.
  (into [:model/OsiAiContext :basis] osi-ai-context/api-columns))

(defn- rewrite-requested?
  [{:keys [generated_at rewrite_requested_at]}]
  (boolean (and rewrite_requested_at
                (or (nil? generated_at)
                    (.isAfter (.toInstant ^OffsetDateTime rewrite_requested_at)
                              (.toInstant ^OffsetDateTime generated_at))))))

(defn- context-state
  [entity context]
  (if-not context
    :missing
    (let [fresh-basis    (when (:basis context)
                           (spec/entity-basis :osi-context entity))
          basis-current? (and (:basis context) (= (:basis context) fresh-basis))
          basis-changed? (and (:basis context) (not= (:basis context) fresh-basis))]
      (cond
        (rewrite-requested? context)      :rewrite-requested
        (= :human (:data_source context)) (if basis-changed? :approved-invalidated :approved)
        basis-current?                    :generated
        :else                             :invalidated))))

(defn- scheduler-status
  []
  (let [^Scheduler scheduler (task/scheduler)]
    {:disabled    (task/scheduler-disabled?)
     :initialized (boolean scheduler)
     :started     (boolean (and scheduler (.isStarted scheduler)))
     :standby     (boolean (and scheduler (.isInStandbyMode scheduler)))
     :shutdown    (boolean (and scheduler (.isShutdown scheduler)))}))

(defn- generation-status
  []
  (let [job-registered (task/job-exists? generation/generation-job-key)
        index-status   (entity-retrieval.ee/retrieval-status false)]
    {:ai_features_enabled (llm.settings/ai-features-enabled?)
     :enabled             (setting/get-value-of-type :boolean :osi-generation-enabled)
     :effective_enabled   (generation.settings/osi-generation-enabled)
     :available           (generation/available?)
     :configured          (generation.settings/configured?)
     :index_available     (every? val (:dependencies index-status))
     :index               (update index-status :index #(some-> % (select-keys [:status])))
     :model               (generation.settings/osi-generation-model)
     :credentials_source  (generation.settings/credentials-source
                           (generation.settings/osi-generation-model))
     :scheduler           (scheduler-status)
     :job                 {:registered job-registered
                           :info       (when job-registered
                                         (task/job-info generation/generation-job-key))}
     :contexts            {:total     (demo.db/context-count nil)
                           :generated (demo.db/context-count :metabot)
                           :approved  (demo.db/context-count :human)}}))

(defn- library-entities
  []
  (let [entities          (spec/hydrate :osi-context (spec/member-entities :osi-context))
        entities-by-class (u/for-map [entity entities]
                            [(spec/hydration-key entity) entity])
        contexts          (u/for-map [{:keys [entity_type entity_local_id] :as context}
                                      (demo.db/contexts context-api-model)]
                            [(entity-retrieval/entity-class entity_type entity_local_id) context])]
    (->> entities
         (map spec/entity-summary)
         (map (fn [{:keys [entity_type entity_local_id] :as summary}]
                (let [entity-class (entity-retrieval/entity-class entity_type entity_local_id)
                      entity       (entities-by-class entity-class)
                      context      (contexts entity-class)]
                  (assoc summary
                         :context (some-> context (dissoc :basis))
                         :generation_state (context-state entity context)))))
         (sort-by (juxt :entity_type :name :entity_local_id))
         vec)))

(defn- update-library-description!
  [entity-type entity-local-id description]
  (let [entity (api/check-404 (spec/member-entity :osi-context entity-type entity-local-id))
        model  (api/check-404 (spec/entity-type->model (:entity_type entity)))
        updated (demo.db/update-description! model (:entity_local_id entity) description)]
    (api/check-500 (= 1 updated))
    ;; Source description changes bypass the OsiAiContext model hooks, so request the same targeted
    ;; reconciliation those hooks use. This demo endpoint should not leave its visible index stale until
    ;; the periodic full-reconcile backstop runs.
    (entity-retrieval.mirror/request-entity-sync! entity-type entity-local-id)
    {:updated updated}))

(defn- generation-prompt
  [entity-type entity-local-id]
  (let [entity       (->> (api/check-404 (spec/member-entity :osi-context entity-type entity-local-id))
                          vector
                          (spec/hydrate :osi-context)
                          first)
        entity-class (spec/hydration-key entity)
        context      (demo.db/context context-api-model (first entity-class) (second entity-class))
        basis        (spec/entity-basis :osi-context entity)
        diff         (when (:basis context)
                       (spec/basis-diff (:basis context) basis))]
    {:version  (generation.prompt/version)
     :messages (generation.prompt/build-messages
                {:llm-input          (spec/project :osi-context entity)
                 :diff               diff
                 :existing-context   context
                 :rewrite-requested? (rewrite-requested? context)})}))

(defn- generation-runs
  []
  (mapv (fn [{:keys [task_details] :as run}]
          (cond-> (-> run
                      (dissoc :task_details)
                      (assoc :outcome (or (:outcome task_details) (:status run))))
            (:reason task_details)  (assoc :reason (:reason task_details))
            (:summary task_details) (assoc :summary (:summary task_details))
            (:message task_details) (assoc :message (:message task_details))))
        (demo.db/generation-runs generation-run-columns generation.task/generation-task-history-name)))

(defn- delete-all-contexts!
  []
  {:deleted (demo.db/delete-contexts!)})

(defn- clear-library-index!
  []
  (entity-retrieval.reconcile/clear-index!
   (semantic.db.datasource/ensure-initialized-data-source!)))

(defn- library-index-entries
  [offset]
  (let [datasource (semantic.db.datasource/ensure-initialized-data-source!)]
    (or (entity-retrieval.reconcile/with-index-read-lock
          datasource
          (fn [conn]
            (if-not (entity-retrieval.index-table/vectors-table-exists? conn)
              {:busy false, :data []}
              (let [members (->> (spec/member-entities :library-index)
                                 (map (fn [{:keys [entity_type entity_local_id]}]
                                        (let [[entity-type id] (entity-retrieval/entity-class entity_type entity_local_id)]
                                          {:entity_type entity-type, :entity_local_id id})))
                                 set)]
                {:busy false
                 :data (jdbc/execute!
                        conn
                        [(format (str "WITH members AS (SELECT * FROM jsonb_to_recordset(CAST(? AS jsonb)) "
                                      "AS m(entity_type text, entity_local_id bigint)), page AS ("
                                      "SELECT v.* FROM %s v JOIN members m ON m.entity_local_id = v.entity_local_id "
                                      "AND m.entity_type = CASE WHEN v.entity_type IN ('question', 'metric', 'model') "
                                      "THEN 'card' ELSE v.entity_type END "
                                      "ORDER BY v.entity_type, v.entity_local_id, v.doc_type, v.doc_text, v.doc_id "
                                      "LIMIT 51 OFFSET ?) "
                                      "SELECT doc_id, entity_type, entity_local_id, doc_type, doc_text, "
                                      "vector_dims(doc_embedding) AS vector_dimensions, "
                                      "md5(vector_send(doc_embedding)) AS vector_hash FROM page "
                                      "ORDER BY entity_type, entity_local_id, doc_type, doc_text, doc_id")
                                 (entity-retrieval.index-table/vectors-table-sql))
                         (json/encode (vec members)) offset]
                        {:builder-fn jdbc.rs/as-unqualified-lower-maps})}))))
        {:busy true, :data []})))

(defn- index-entity-settled?
  [entity-type entity-local-id]
  (let [datasource (semantic.db.datasource/ensure-initialized-data-source!)]
    (or (entity-retrieval.reconcile/with-index-read-lock
          datasource
          (fn [conn]
            (let [member (spec/member-entity :library-index entity-type entity-local-id)
                  entity (some->> member vector (spec/hydrate :library-index) first)
                  desired (if entity
                            (try
                              (spec/project :library-index entity)
                              (catch Exception e
                                (if (spec/data-defect? e)
                                  (spec/base-index-docs entity)
                                  (throw e))))
                            [])
                  [class id] (entity-retrieval/entity-class entity-type entity-local-id)
                  types (if (= class "card") ["card" "question" "metric" "model"] [class])
                  stored (if (entity-retrieval.index-table/vectors-table-exists? conn)
                           (jdbc/execute! conn
                                          [(format (str "SELECT doc_id FROM %s WHERE entity_local_id = ? "
                                                        "AND entity_type IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))")
                                                   (entity-retrieval.index-table/vectors-table-sql))
                                           id (json/encode types)]
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                           [])]
              {:busy false, :settled (= (set (map :doc_id desired)) (set (map :doc_id stored)))})))
        {:busy true, :settled false})))

(defn- library-index-vector
  [doc-id]
  (let [datasource (semantic.db.datasource/ensure-initialized-data-source!)]
    (or (entity-retrieval.reconcile/with-index-read-lock
          datasource
          (fn [conn]
            (api/check-404
             (jdbc/execute-one! conn
                                [(format "SELECT encode(vector_send(doc_embedding), 'base64') AS vector FROM %s WHERE doc_id = ?"
                                         (entity-retrieval.index-table/vectors-table-sql)) doc-id]
                                {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))
        (throw (ex-info "Index is busy." {:status-code 503})))))

(defn- comparison-search
  [engine query]
  (search/search
   (search/search-context
    {:context               :api
     :current-user-id       api/*current-user-id*
     :current-user-perms    @api/*current-user-permissions-set*
     :is-impersonated-user? (perms/impersonated-user?)
     :is-sandboxed-user?    (perms/sandboxed-user?)
     :is-superuser?         api/*is-superuser?*
     :limit                 10
     :models                nil
     :offset                0
     :search-engine         engine
     :search-string         query})))

(defn- library-retrieval-search
  [query]
  (let [{:keys [output structured-output]}
        (tools/handle tools.entity-retrieval/retrieve-library-entities-tool
                      {:user_search_prompt query, :limit 10}
                      {})]
    (if structured-output
      {:engine     :library-retrieval
       :total      (:total_count structured-output)
       :weak_match (:weak_match structured-output)
       :data       (:data structured-output)}
      (throw (ex-info output {:status-code 503})))))

(defn- delete-generation-runs!
  []
  {:deleted (demo.db/delete-finished-runs! generation.task/generation-task-history-name)})

(defn- ensure-generation-job!
  []
  (api/check-400 (not (task/scheduler-disabled?))
                 "The task scheduler is disabled by MB_DISABLE_SCHEDULER.")
  (task/start-scheduler!)
  (when-not (task/job-exists? generation/generation-job-key)
    (task/init! generation-task-key))
  (api/check-500 (task/job-exists? generation/generation-job-key))
  {:scheduler (scheduler-status)
   :job       {:registered true
               :info       (task/job-info generation/generation-job-key)}})

(api.macros/defendpoint :get "/status" :- :any
  "Report every gate needed to run OSI metadata generation."
  []
  (api/check-superuser)
  (generation-status))

(api.macros/defendpoint :get "/entities" :- :any
  "List library entities together with their stored AI context, if any."
  []
  (api/check-superuser)
  {:data (library-entities)})

(api.macros/defendpoint :get "/runs" :- :any
  "List recent OSI generation attempts, newest first."
  []
  (api/check-superuser)
  {:data (generation-runs)})

(api.macros/defendpoint :delete "/runs" :- :any
  "Delete only OSI generation task-history rows so the lifecycle demo can start over."
  []
  (api/check-superuser)
  (delete-generation-runs!))

(api.macros/defendpoint :put "/enabled" :- :any
  "Toggle automatic OSI metadata generation."
  [_route-params
   _query-params
   {:keys [enabled]} :- [:map {:closed true} [:enabled :boolean]]]
  (api/check-superuser)
  (generation.settings/osi-generation-enabled! enabled)
  {:enabled (setting/get-value-of-type :boolean :osi-generation-enabled)})

(api.macros/defendpoint :post "/ensure-job" :- :any
  "Start the task scheduler and register the OSI generation job when necessary."
  []
  (api/check-superuser)
  (ensure-generation-job!))

(api.macros/defendpoint :delete "/contexts" :- :any
  "Delete every stored OSI AI context so the generation demo can start over."
  []
  (api/check-superuser)
  (delete-all-contexts!))

(api.macros/defendpoint :delete "/index" :- :any
  "Delete every document from only the Library entity-retrieval index so the next full reconcile visibly
  repopulates it. Library entities, AI context, and the separate semantic-search index are untouched."
  []
  (api/check-superuser)
  (api/check-400 (entity-retrieval.ee/available?)
                 "Library retrieval is unavailable; check its pgvector and embedding configuration.")
  (clear-library-index!))

(api.macros/defendpoint :get "/index" :- :any
  "List a page of Library index documents."
  [_route-params
   {:keys [offset]} :- [:map {:closed true} [:offset {:optional true} [:int {:min 0}]]]]
  (api/check-superuser)
  (api/check-400 (entity-retrieval.ee/available?)
                 "Library retrieval is unavailable; check its pgvector and embedding configuration.")
  (update (library-index-entries (or offset 0)) :data vec))

(api.macros/defendpoint :get "/index/settled/:entity-type/:entity-local-id" :- :any
  "Check whether a single entity's current documents have reached the index."
  [{:keys [entity-type entity-local-id]} :- [:map {:closed true}
                                             [:entity-type [:string {:api/regex #"[a-z-]+"}]]
                                             [:entity-local-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-400 (entity-retrieval.ee/available?) "Library retrieval is unavailable.")
  (index-entity-settled? entity-type entity-local-id))

(api.macros/defendpoint :get "/index/vector" :- :any
  "Return the encoded vector for one index document."
  [_route-params
   {:keys [doc-id]} :- [:map {:closed true} [:doc-id ms/NonBlankString]]]
  (api/check-superuser)
  (api/check-400 (entity-retrieval.ee/available?) "Library retrieval is unavailable.")
  (library-index-vector doc-id))

(api.macros/defendpoint :get "/search/:engine" :- :any
  "Run the real AppDB, semantic, or Library-retrieval search path without persisting an engine override in
  the browser."
  [{:keys [engine]} :- [:map {:closed true} [:engine [:enum "appdb" "semantic" "library"]]]
   {:keys [q]} :- [:map {:closed true} [:q ms/NonBlankString]]]
  (api/check-superuser)
  (if (= engine "library")
    (do
      (api/check-400 (entity-retrieval.ee/available?) "Library retrieval is unavailable.")
      (library-retrieval-search q))
    (let [engine-key (search.engine/canonical-engine engine)]
      (api/check-400 (= :ok (search.engine/engine-status engine-key)) "Search engine is unavailable.")
      (comparison-search (name engine-key) q))))

(api.macros/defendpoint :put "/entities/:entity-type/:entity-local-id/description" :- :any
  "Edit a Library entity's source description, which is part of the generation basis and makes generated
  context eligible for regeneration. Human-approved context remains protected until regeneration is
  explicitly requested."
  [{:keys [entity-type entity-local-id]} :- [:map {:closed true}
                                             [:entity-type [:string {:api/regex #"[a-z-]+"}]]
                                             [:entity-local-id ms/PositiveInt]]
   _query-params
   {:keys [description]} :- [:map {:closed true} [:description [:maybe :string]]]]
  (api/check-superuser)
  (update-library-description! entity-type entity-local-id description))

(api.macros/defendpoint :get "/entities/:entity-type/:entity-local-id/prompt" :- :any
  "Render the exact generation prompt for one current Library entity without calling the LLM."
  [{:keys [entity-type entity-local-id]} :- [:map {:closed true}
                                             [:entity-type [:string {:api/regex #"[a-z-]+"}]]
                                             [:entity-local-id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (generation-prompt entity-type entity-local-id))

(defn- enabled?
  []
  (or (and config/dev-available? (not *compile-files*))
      (config/config-bool :mb-enable-osi-generation-demo)))

(def ^:private enabled-routes
  (api.macros/ns-handler *ns* +auth))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/osi-generation-demo` routes, enabled only for local development or an opted-in PR environment."
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (if (enabled?)
       (enabled-routes request respond raise)
       (respond {:status 404, :body "Not found."})))
   (fn [prefix]
     (open-api/open-api-spec enabled-routes prefix))))
