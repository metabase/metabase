(ns metabase.metabot.agent.profiles
  "Profile configurations for different metabot use cases.
  Each profile defines model settings, iteration limits, and available tools.

  Tools are referenced as vars. Metadata on the var (`:tool-name`, `:schema`,
  `:capabilities`, etc.) describes the tool; the var itself is invoked to run it.
  `defenterprise` tools with `:ee-feature` metadata are filtered out at runtime
  when the feature is not available."
  (:require
   [malli.error :as me]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.tools :as tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.explorations :as tools.explorations]
   [metabase.metabot.tools.legacy :as tools.legacy]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:private tool-var-schema
  "Schema for one of a profile's tools.

  Either kind: a var whose value implements `metabase.metabot.tools.core/Tool`, or — until it is
  converted — a var with `:tool-name` and `:schema` in its metadata. A profile names both as vars,
  so converting a tool does not touch any profile."
  [:fn {:error/message (str "Expected a var holding a metabase.metabot.tools.core/Tool, "
                            "or a var with :tool-name and :schema metadata")}
   (fn [v]
     (and (var? v)
          (or (tools.legacy/legacy-tool? v)
              (satisfies? tools.core/Tool (deref v)))))])

(def ^:private *profiles
  "Map of profile-id to profile configuration"
  (atom {}))

(defn- validate-tool-var!
  "Validate that a var has the required tool metadata."
  [tool-var]
  (when-not (mr/validate tool-var-schema tool-var)
    (throw (ex-info "Invalid tool var: missing :tool-name or :schema metadata"
                    {:tool-var   tool-var
                     :metadata   (meta tool-var)
                     :errors     (me/humanize (mu/explain tool-var-schema tool-var))})))
  (when-let [required-scope (:scope (meta tool-var))]
    (when-not (api-scope/registered-scope? required-scope)
      (throw (ex-info (str "Tool has unregistered scope: " required-scope)
                      {:tool-var tool-var
                       :scope    required-scope}))))
  true)

;; The declaration, not the var's metadata: a converted tool is a record held by a var and carries no `:tool-name`
;; meta, so reading meta made every converted tool in a profile report `nil` and look like duplicates.
(defn- tool-name
  "The model-facing name of `tool`, a converted record or a var still in the old shape."
  [tool]
  (:name (tools.legacy/declaration-of tool)))

(mu/defn ^:private register-profile!
  "Register new profile configuration.

  Each profile includes:
  - :name - Keyword identifier for the profile (e.g. :internal)
  - :prompt-template - Selmer template name from resources/metabot/prompts/system/
  - :max-iterations - Maximum agent loop iterations
  - :tools - Vector of tool vars (e.g. #'tools/fulltext-search-tool)
  - :always-on-skills - Optional vector of skill ids (keywords) whose bodies are inlined into this
    profile's system prompt instead of being loaded on demand via `load_skill`. Always-on is a
    per-profile decision: the same skill can be inlined here and on-demand elsewhere.
  - :skills? - Optional boolean (default true). When false, the profile opts out of the skills
    system entirely: no skill catalog, no always-on inlining, and `load_skill` is not injected —
    even if the profile's tools would otherwise match skills (e.g. `read_resource`). Use for
    specialized profiles that carry their own tool guidance and must not invite `load_skill` calls.
  - :terminal-tools - Optional set of tool-name strings whose **successful** call ends the agent
    turn for this profile. Lets a `:required-tool-call?` profile stop as soon as it produces its
    answer (e.g. `:sql` after `edit_sql_query`) instead of being forced to keep calling tools.
    Terminality is per-profile: the same tool is non-terminal in profiles that don't list it.
  - :system-prompt-context - Optional fn of the request context returning a map of extra,
    feature-specific system-prompt template vars (e.g. the explorations profile's formatted draft
    Research plan). Keeps feature context out of the generic agent — only the profiles that need it
    opt in.

  Tool vars are validated at registration time to ensure they have required metadata; any
  `:always-on-skills` are validated to refer to registered skills, and any `:terminal-tools` to
  refer to tools the profile actually exposes."
  [profile :- [:map {:closed true}
               [:name :keyword]
               [:prompt-template :string]
               [:max-iterations :int]
               [:temperature {:optional true} [:maybe number?]]
               [:tools [:vector tool-var-schema]]
               [:always-on-skills {:optional true} [:vector :keyword]]
               [:skills? {:optional true} :boolean]
               [:required-tool-call? {:optional true} :boolean]
               [:terminal-tools {:optional true} [:set :string]]
               [:system-prompt-context {:optional true} [:fn ifn?]]]]
  (let [tool-vars  (:tools profile)
        decls      (mapv tools.legacy/declaration-of tool-vars)
        tool-names (into #{} (map :name) decls)]
    (doseq [tool-var tool-vars]
      (validate-tool-var! tool-var))
    (when-let [dups (seq (for [[name' n] (frequencies (map :name decls)) :when (< 1 n)] name'))]
      (throw (ex-info "Duplicate tool names in profile" {:tool-names dups})))
    (when (and (false? (:skills? profile)) (seq (:always-on-skills profile)))
      (throw (ex-info "Profile disables skills but lists :always-on-skills"
                      {:profile (:name profile) :always-on-skills (:always-on-skills profile)})))
    (when-let [unknown (seq (remove skills/get-skill (:always-on-skills profile)))]
      (throw (ex-info "Profile references unknown always-on skill ids"
                      {:profile (:name profile) :unknown-skill-ids unknown})))
    (when-let [unknown (seq (remove tool-names (:terminal-tools profile)))]
      (throw (ex-info "Profile lists terminal tools it does not expose"
                      {:profile (:name profile) :unknown-terminal-tools unknown}))))
  (swap! *profiles assoc (:name profile) profile))

(defn- embedding-system-prompt-context
  "Template vars for `embedding-next.selmer`. `in_host_app` is set by the API from the request's client
  header (see [[metabase.metabot.context/host-app-request?]]): true for the SDK, modular embedding and
  data apps, where no Metabase pages exist to hand off to; false for a full-app iframe embed, which
  keeps the hand-off to the SQL editor, dashboard builder and search."
  [context]
  {:in_host_app (boolean (:in_host_app context))})

;; Serves every embedded surface — the SDK `MetabotQuestion`, modular embedding, data apps, and full-app
;; iframe embeds — and has no SQL tools in any of them. The prompt decides per request whether there is
;; a Metabase UI around it to hand off to (see [[embedding-system-prompt-context]]).
;; TODO (Chris 2026-10-14) -- Offer run_query here once embedded Metabot has its own query execution setting,
;; and replace the embedded Metabot checks in `init-agent` and `run-query` with it.
;; Queries run as the signed-in user, so sandboxing and impersonation apply,
;; but the rows are the embedding customer's end users' data, and they go to the LLM provider.
;; An admin should be able to show results to their own staff without showing them in every embed.
(register-profile!
 {:name            :embedding_next
  :prompt-template "embedding-next.selmer"
  :max-iterations  20
  :system-prompt-context #'embedding-system-prompt-context
  :tools           [#'tools/retrieve-library-entities-tool
                    #'tools/nlq-semantic-search-tool
                    #'tools/nlq-fulltext-search-tool
                    #'tools/nlq-substring-search-tool
                    #'tools/read-resource-tool
                    #'tools/construct-notebook-query-tool
                    #'tools/create-chart-tool
                    #'tools/edit-chart-tool
                    #'tools/save-entity-tool]})

(def ^:private internal-tools
  [#'tools/retrieve-library-entities-tool
   #'tools/semantic-search-tool
   #'tools/fulltext-search-tool
   #'tools/substring-search-tool
   #'tools/construct-notebook-query-tool
   #'tools/run-query-tool
   #'tools/read-resource-tool
   #'tools/create-sql-query-tool
   #'tools/edit-sql-query-tool
   #'tools/replace-sql-query-tool
   #'tools/edit-chart-tool
   #'tools/create-chart-tool
   #'tools/create-autogenerated-dashboard-tool
   #'tools/create-dashboard-subscription-tool
   #'tools/analyze-chart-tool
   #'tools/save-entity-tool
   #'tools/write-dashboard-tool])

(register-profile!
 {:name            :internal
  :prompt-template "internal.selmer"
  :max-iterations  20
  :tools           internal-tools})

;; :internal without the notebook query builder: the model writes a query with create_sql_query and reads it with
;; run_query. It measures how well the model answers in SQL. Values can still reach the model without SQL through
;; analyze_chart, for a chart the user is viewing, and through the field values read_resource returns.
;; The SQL tools keep their own checks, the write_sql_queries capability and the SQL execution setting.
;; Its run_query runs SQL only, and needs the scope Metabot's SQL permission grants, not the NLQ one, so a user with
;; only the SQL permission can read what they run. That is the one thing the profile grants that :internal doesn't.
(register-profile!
 {:name            :internal-sql
  :prompt-template "internal.selmer"
  :max-iterations  20
  :tools           (into []
                         (comp (remove #{#'tools/construct-notebook-query-tool})
                               (replace {#'tools/run-query-tool     #'tools/run-sql-query-tool
                                         #'tools/analyze-chart-tool #'tools/analyze-chart-sql-tool}))
                         internal-tools)})

;; SQL responses are rendered from tool results in the native port, so this
;; profile must always end with a tool call rather than free-form assistant text.
(register-profile!
 {:name                :sql
  :prompt-template     "sql-querying-only.selmer"
  :max-iterations      20
  :required-tool-call? true
  ;; The SQL editor is a focused, tool-heavy flow: this guidance is relevant on essentially every
  ;; turn, so inline it rather than make the model spend iterations loading it. Other profiles that
  ;; share these tools (e.g. :internal) keep them on-demand by not listing them here.
  :always-on-skills    [:read-resource
                        :create-sql-query
                        :edit-sql-query
                        :replace-sql-query
                        :ask-for-sql-clarification]
  ;; Delivering SQL via one of these tools — or asking the user to clarify — IS the answer here, so a
  ;; successful call ends the turn rather than forcing more tool calls under :required-tool-call?.
  ;; Failed calls don't terminate, so the model can still self-correct. The same tools stay
  ;; non-terminal in other profiles.
  :terminal-tools      #{"create_sql_query" "edit_sql_query" "replace_sql_query"
                         "ask_for_sql_clarification"}
  :tools               [#'tools/sql-semantic-search-tool
                        #'tools/sql-fulltext-search-tool
                        #'tools/sql-substring-search-tool
                        #'tools/read-resource-tool
                        #'tools/list-snippets-tool
                        #'tools/get-snippet-details-tool
                        #'tools/create-sql-query-code-edit-tool
                        #'tools/edit-sql-query-tool
                        #'tools/replace-sql-query-tool
                        #'tools/ask-for-sql-clarification-tool]})

(register-profile!
 {:name            :nlq
  :prompt-template "natural-language-querying-only.selmer"
  :max-iterations  20
  :tools           [#'tools/retrieve-library-entities-tool
                    #'tools/nlq-semantic-search-tool
                    #'tools/nlq-fulltext-search-tool
                    #'tools/nlq-substring-search-tool
                    #'tools/read-resource-tool
                    #'tools/construct-notebook-query-tool
                    #'tools/run-query-tool
                    #'tools/create-chart-tool
                    #'tools/edit-chart-tool
                    #'tools/save-entity-tool
                    #'tools/write-dashboard-tool]})

(register-profile!
 {:name            :document-generate-content
  :prompt-template "document-generate-content.selmer"
  :max-iterations  20
  :required-tool-call? true
  ;; Producing a chart draft is the answer; a successful construct ends the turn (schema collection
  ;; is a non-terminal preparatory step). Failed constructs don't terminate, so the model retries.
  :terminal-tools  #{"document_construct_model_chart" "document_construct_sql_chart"}
  ;; `list_available_data_sources` lists only the models and metrics in the Metabot's scope. `read_resource` lets the
  ;; model find a database and its tables, for example for a SQL chart when the user mentioned no database.
  :tools           [#'tools/list-available-data-sources-tool
                    #'tools/read-resource-tool
                    #'tools/list-available-fields-tool
                    #'tools/get-field-values-tool
                    #'tools/document-schema-collect-tool
                    #'tools/document-construct-model-chart-tool
                    #'tools/document-construct-sql-chart-tool]})

(register-profile!
 {:name            :slackbot
  :prompt-template "slackbot.selmer"
  :max-iterations  20
  :tools           [#'tools/retrieve-library-entities-tool
                    #'tools/semantic-search-tool
                    #'tools/fulltext-search-tool
                    #'tools/substring-search-tool
                    #'tools/slackbot-construct-notebook-query-tool
                    #'tools/list-available-fields-tool
                    #'tools/get-field-values-tool
                    #'tools/static-viz-tool
                    #'tools/create-alert-tool
                    #'tools/slackbot-create-dashboard-subscription-tool]})

(register-profile!
 {:name            :explorations
  :prompt-template "explorations.selmer"
  :max-iterations  20
  :temperature     0.3
  :system-prompt-context #'tools.explorations/research-plan-system-context
  :skills?         false
  :tools           [#'tools/retrieve-library-entities-tool
                    #'tools/semantic-search-tool
                    #'tools/fulltext-search-tool
                    #'tools/substring-search-tool
                    #'tools/read-resource-tool
                    #'tools/list-research-metrics-tool
                    #'tools/get-research-candidates-tool
                    #'tools/add-research-groups-tool
                    #'tools/remove-from-research-plan-tool
                    #'tools/set-exploration-name-tool
                    #'tools/list-timelines-tool
                    #'tools/get-timeline-details-tool
                    #'tools/select-exploration-timelines-tool]})

(defn- filter-by-capabilities
  "Filter tools by user capabilities.
  Removes tools that require capabilities the user doesn't have.
  Capabilities from the API arrive as strings (e.g. \"permission:write_sql_queries\")
  while tool metadata uses keywords (e.g. :permission-write-sql-queries), so we
  normalize to keywords before comparing."
  [tools capabilities]
  (let [capabilities-set (capabilities/capability-set capabilities)]
    (filter (fn [tool]
              (every? capabilities-set
                      (:metabot/capabilities (tools.legacy/declaration-of tool))))
            tools)))

(defn- filter-by-scope
  "Filter tools by the current user's scope set.
  Removes tools whose declared `:scope` is not satisfied by `*current-user-scope*`.
  Tools that declare no scope pass through."
  [tools]
  (filter (fn [tool]
            (let [required-scope (:scope (tools.legacy/declaration-of tool))]
              (or (nil? required-scope)
                  (api-scope/scope-matches? scope/*current-user-scope* required-scope))))
          tools))

(defn- available?
  "Whether a tool can serve this turn: true unless its declaration's `:metabot/available?`, a function of the request
  context `{:metabot ... :profile-id ...}`, says otherwise."
  [tool ctx]
  (if-let [pred (:metabot/available? (tools.legacy/declaration-of tool))]
    (boolean (pred ctx))
    true))

(defn- tool-map
  "A map of each tool's model-facing name to the tool, for converted records and old-shape vars alike."
  [tools]
  (u/index-by tool-name tools))

;;; API

(defn profile-registered?
  "Whether a profile with `profile-id` is registered."
  [profile-id]
  (contains? @*profiles profile-id))

(def ^:private eval-profile-ids
  "Profiles that exist only for evals.
  `:internal-sql` lets a user run SQL with only the SQL generation permission, which no other profile allows."
  #{:internal-sql})

(defn profile-available?
  "Whether `profile-id` is registered and may run on this instance.
  An eval-only profile may run only where `metabot-eval-profiles-enabled?` is set."
  [profile-id]
  (and (profile-registered? profile-id)
       (or (not (contains? eval-profile-ids profile-id))
           (metabot.settings/metabot-eval-profiles-enabled?))))

(defn get-profile
  "Get profile configuration by profile-id keyword.
  The `:model` in the returned profile is resolved from the `llm-metabot-provider`
  setting at call time, so it always reflects the current admin configuration."
  [profile-id]
  (if-let [profile (get @*profiles profile-id)]
    (assoc profile :model (metabot.settings/llm-metabot-provider))
    ;; An unregistered profile-id is a wiring bug; warn so it's diagnosable (callers handle the nil).
    (log/warnf "No metabot profile registered for %s" profile-id)))

(defn- with-load-skill
  "Register load_skill whenever the profile has ANY skills — on-demand (catalog) or always-on. Always-on bodies are
  inlined, but their presence still implies a skill-bearing, possibly dialect-capable profile whose
  `dialect-preload-parts` emit a synthetic `load_skill` call that must resolve to a registered tool."
  [base profile capabilities]
  (let [manifest (skills/build-skill-manifest profile (keys base) capabilities)]
    (cond-> base
      (or (seq (:catalog manifest)) (seq (:always-on manifest)))
      (assoc "load_skill" #'tools/load-skill-tool))))

(defn resolve-tools
  "The tools an ALREADY-RESOLVED profile offers this turn, and the ones it can't, from one availability check per tool.

  Returns `:tools`, the registry of tool-name -> tool, filtered by capabilities, `*current-user-scope*`, and each
  tool's `:metabot/available?` check.
  That check is a function of the request context `ctx`, `{:metabot ... :profile-id ...}`, where `:metabot` is the
  Metabot row, or nil.
  When the profile exposes any skills, `load_skill` is injected for on-demand loading; profiles with `:skills? false`
  never get it (see [[metabase.metabot.skills/build-skill-manifest]]).

  Also returns `:unavailable-tools`, for the system prompt's \"Unavailable tools\" section: the allowed tools whose
  name no offered tool carries and that describe themselves with a `:metabot/unavailable-note`, a function of `ctx`.
  Each entry is `{:name ... :purpose ...}`, plus any of `:missing`, `:reason` and `:workaround` the tool supplies."
  [profile capabilities ctx]
  (when profile
    (let [allowed         (-> profile :tools (filter-by-capabilities capabilities) filter-by-scope)
          offered         (filterv #(available? % ctx) allowed)
          offered-names   (into #{} (map tool-name) offered)]
      {:tools             (with-load-skill (tool-map offered) profile capabilities)
       :unavailable-tools (->> allowed
                               (map tools.legacy/declaration-of)
                               (remove #(offered-names (:name %)))
                               (keep (fn [{name' :name, note :metabot/unavailable-note}]
                                       (when note
                                         (assoc (note ctx) :name name'))))
                               (sort-by :name)
                               vec)})))

(defn profile->tools
  "The tool registry an ALREADY-RESOLVED profile offers this turn; see [[resolve-tools]]."
  ([profile capabilities]
   (profile->tools profile capabilities {}))
  ([profile capabilities ctx]
   (:tools (resolve-tools profile capabilities ctx))))

(defn get-tools-for-profile
  "Resolve a profile by id and return its capability/scope-filtered tool registry (see [[profile->tools]]).
  Convenience for callers that only need the tools; code that also needs the prompt should call
  [[get-profile]] once and pass the result to [[profile->tools]]."
  [profile-id capabilities]
  (profile->tools (get-profile profile-id) capabilities))
