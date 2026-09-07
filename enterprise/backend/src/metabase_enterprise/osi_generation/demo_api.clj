(ns metabase-enterprise.osi-generation.demo-api
  "Superuser-only control surface packaged on the OSI demo branch for PR-environment demos."
  (:require
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.ee]
   [metabase-enterprise.entity-retrieval.index-table :as entity-retrieval.index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as entity-retrieval.reconcile]
   [metabase-enterprise.osi-generation.core :as generation]
   [metabase-enterprise.osi-generation.prompt :as generation.prompt]
   [metabase-enterprise.osi-generation.settings :as generation.settings]
   [metabase-enterprise.osi-generation.task.generate :as generation.task]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.config.core :as config]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.osi.models.osi-ai-context :as osi-ai-context]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2])
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
     :enabled             (generation.settings/osi-generation-enabled)
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
     :contexts            {:total     (t2/count :model/OsiAiContext)
                           :generated (t2/count :model/OsiAiContext :data_source :metabot)
                           :approved  (t2/count :model/OsiAiContext :data_source :human)}}))

(defn- library-entities
  []
  (let [entities          (spec/hydrate :osi-context (spec/member-entities :osi-context))
        entities-by-class (u/for-map [entity entities]
                            [(spec/hydration-key entity) entity])
        contexts          (u/for-map [{:keys [entity_type entity_local_id] :as context}
                                      (t2/select context-api-model)]
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
        updated (t2/update! model :id (:entity_local_id entity) {:description description})]
    (api/check-500 (= 1 updated))
    {:updated updated}))

(defn- generation-prompt
  [entity-type entity-local-id]
  (let [entity       (->> (api/check-404 (spec/member-entity :osi-context entity-type entity-local-id))
                          vector
                          (spec/hydrate :osi-context)
                          first)
        entity-class (spec/hydration-key entity)
        context      (t2/select-one context-api-model
                                    :entity_type (first entity-class)
                                    :entity_local_id (second entity-class))
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
        (t2/select generation-run-columns
                   :task generation.task/generation-task-history-name
                   {:limit 25, :order-by [[:started_at :desc] [:id :desc]]})))

(defn- delete-all-contexts!
  []
  {:deleted (t2/delete! :model/OsiAiContext)})

(defn- clear-library-index!
  []
  (entity-retrieval.reconcile/clear-index!
   (semantic.db.datasource/ensure-initialized-data-source!)))

(defn- library-index-entries
  []
  (let [datasource      (semantic.db.datasource/ensure-initialized-data-source!)
        library-classes (into #{}
                              (map (fn [{:keys [entity_type entity_local_id]}]
                                     (entity-retrieval/entity-class entity_type entity_local_id)))
                              (spec/member-entities :library-index))]
    (or (entity-retrieval.reconcile/with-index-read-lock
          datasource
          (fn [conn]
            {:busy false
             :data (if-not (entity-retrieval.index-table/vectors-table-exists? conn)
                     []
                     (->> (jdbc/execute!
                           conn
                           [(format (str "SELECT doc_id, entity_type, entity_local_id, doc_type, doc_text, "
                                         "vector_dims(doc_embedding) AS vector_dimensions, "
                                         "md5(vector_send(doc_embedding)) AS vector_hash, "
                                         "encode(vector_send(doc_embedding), 'base64') AS vector_base64 "
                                         "FROM %s "
                                         "ORDER BY entity_type, entity_local_id, doc_type, doc_text, doc_id")
                                    (entity-retrieval.index-table/vectors-table-sql))]
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                          (filter (fn [{:keys [entity_type entity_local_id]}]
                                    (contains? library-classes
                                               (entity-retrieval/entity-class entity_type entity_local_id))))
                          vec))}))
        {:busy true, :data []})))

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
        (tools.entity-retrieval/retrieve-library-entities-tool {:user_search_prompt query, :limit 10})]
    (if structured-output
      {:engine     :library-retrieval
       :total      (:total_count structured-output)
       :weak_match (:weak_match structured-output)
       :data       (:data structured-output)}
      (throw (ex-info output {:status-code 503})))))

(defn- delete-generation-runs!
  []
  {:deleted (t2/delete! :model/TaskHistory :task generation.task/generation-task-history-name)})

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
   {:keys [enabled]} :- [:map [:enabled :boolean]]]
  (api/check-superuser)
  (generation.settings/osi-generation-enabled! enabled)
  {:enabled (generation.settings/osi-generation-enabled)})

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
  "List every Library index document, including its pgvector binary encoded as base64."
  []
  (api/check-superuser)
  (api/check-400 (entity-retrieval.ee/available?)
                 "Library retrieval is unavailable; check its pgvector and embedding configuration.")
  (library-index-entries))

(api.macros/defendpoint :get "/search/:engine" :- :any
  "Run the real AppDB, semantic, or Library-retrieval search path without persisting an engine override in
  the browser."
  [{:keys [engine]} :- [:map [:engine [:enum "appdb" "semantic" "library"]]]
   {:keys [q]} :- [:map [:q ms/NonBlankString]]]
  (api/check-superuser)
  (if (= engine "library")
    (library-retrieval-search q)
    (comparison-search engine q)))

(api.macros/defendpoint :put "/entities/:entity-type/:entity-local-id/description" :- :any
  "Edit a Library entity's source description, which is part of the generation basis and makes generated
  context eligible for regeneration. Human-approved context remains protected until regeneration is
  explicitly requested."
  [{:keys [entity-type entity-local-id]} :- [:map
                                             [:entity-type [:string {:api/regex #"[a-z-]+"}]]
                                             [:entity-local-id ms/PositiveInt]]
   _query-params
   {:keys [description]} :- [:map [:description [:maybe :string]]]]
  (api/check-superuser)
  (update-library-description! entity-type entity-local-id description))

(api.macros/defendpoint :get "/entities/:entity-type/:entity-local-id/prompt" :- :any
  "Render the exact generation prompt for one current Library entity without calling the LLM."
  [{:keys [entity-type entity-local-id]} :- [:map
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

(defn routes
  "`/api/ee/osi-generation-demo` routes, enabled only for local development or an opted-in PR environment."
  [request respond raise]
  (if (enabled?)
    (enabled-routes request respond raise)
    (respond {:status 404, :body "Not found."})))
