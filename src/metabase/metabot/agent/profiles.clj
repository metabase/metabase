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
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:private tool-var-schema
  "Schema for a tool var: must be a var with :tool-name and :schema in metadata."
  [:fn {:error/message "Expected a var with :tool-name and :schema metadata"}
   (fn [v]
     (and (var? v)
          (string? (:tool-name (meta v)))
          (some? (:schema (meta v)))))])

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

(mu/defn ^:private register-profile!
  "Register new profile configuration.

  Each profile includes:
  - :name - Keyword identifier for the profile (e.g. :internal)
  - :prompt-template - Selmer template name from resources/metabot/prompts/system/
  - :max-iterations - Maximum agent loop iterations
  - :temperature - LLM temperature setting
  - :tools - Vector of tool vars (e.g. #'tools/search-tool)
  - :always-on-skills - Optional vector of skill ids (keywords) whose bodies are inlined into this
    profile's system prompt instead of being loaded on demand via `load_skill`. Always-on is a
    per-profile decision: the same skill can be inlined here and on-demand elsewhere.
  - :terminal-tools - Optional set of tool-name strings whose **successful** call ends the agent
    turn for this profile. Lets a `:required-tool-call?` profile stop as soon as it produces its
    answer (e.g. `:sql` after `edit_sql_query`) instead of being forced to keep calling tools.
    Terminality is per-profile: the same tool is non-terminal in profiles that don't list it.

  Tool vars are validated at registration time to ensure they have required metadata; any
  `:always-on-skills` are validated to refer to registered skills, and any `:terminal-tools` to
  refer to tools the profile actually exposes."
  [profile :- [:map
               [:name :keyword]
               [:prompt-template :string]
               [:max-iterations :int]
               [:temperature :float]
               [:tools [:vector :any]]
               [:always-on-skills {:optional true} [:vector :keyword]]
               [:terminal-tools {:optional true} [:set :string]]]]
  (let [tool-vars     (:tools profile)
        tool-name-seq (map #(:tool-name (meta %)) tool-vars)
        tool-names    (set tool-name-seq)]
    (doseq [tool-var tool-vars]
      (validate-tool-var! tool-var))
    (when-not (apply distinct? tool-name-seq)
      (let [dups (->> (frequencies tool-name-seq)
                      (filter (fn [[_ cnt]] (< 1 cnt))))]
        (throw (ex-info "Duplicate tool names in profile" {:tool-names (map first dups)}))))
    (when-let [unknown (seq (remove skills/get-skill (:always-on-skills profile)))]
      (throw (ex-info "Profile references unknown always-on skill ids"
                      {:profile (:name profile) :unknown-skill-ids unknown})))
    (when-let [unknown (seq (remove tool-names (:terminal-tools profile)))]
      (throw (ex-info "Profile lists terminal tools it does not expose"
                      {:profile (:name profile) :unknown-terminal-tools unknown}))))
  (swap! *profiles assoc (:name profile) profile))

(register-profile!
 {:name            :embedding_next
  :prompt-template "embedding-next.selmer"
  :max-iterations  10
  :temperature     0.3
  :tools           [#'tools/nlq-search-tool
                    #'tools/read-resource-tool
                    #'tools/construct-notebook-query-tool
                    #'tools/navigate-user-tool
                    #'tools/create-chart-tool
                    #'tools/edit-chart-tool]})

(register-profile!
 {:name            :internal
  :prompt-template "internal.selmer"
  :max-iterations  10
  :temperature     0.3
  :tools           [#'tools/search-tool
                    #'tools/construct-notebook-query-tool
                    #'tools/read-resource-tool
                    #'tools/create-sql-query-tool
                    #'tools/edit-sql-query-tool
                    #'tools/replace-sql-query-tool
                    #'tools/edit-chart-tool
                    #'tools/navigate-user-tool
                    #'tools/create-chart-tool
                    #'tools/create-autogenerated-dashboard-tool
                    #'tools/create-dashboard-subscription-tool
                    #'tools/analyze-chart-tool]})

(register-profile!
 {:name            :transforms_codegen
  :prompt-template "transform-codegen.selmer"
  :max-iterations  30
  :temperature     0.3
  :tools           [#'tools/transform-search-tool
                    #'tools/get-transform-details-tool
                    #'tools/get-transform-python-library-details-tool
                    #'tools/write-transform-sql-tool
                    #'tools/write-transform-python-tool
                    #'tools/list-snippets-tool
                    #'tools/get-snippet-details-tool
                    #'tools/list-available-fields-tool
                    #'tools/get-field-values-tool
                    #'tools/todo-write-tool
                    #'tools/todo-read-tool]})

;; SQL responses are rendered from tool results in the native port, so this
;; profile must always end with a tool call rather than free-form assistant text.
(register-profile!
 {:name                :sql
  :prompt-template     "sql-querying-only.selmer"
  :max-iterations      20
  :temperature         0.3
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
  :tools               [#'tools/sql-search-tool
                        #'tools/read-resource-tool
                        #'tools/create-sql-query-code-edit-tool
                        #'tools/edit-sql-query-tool
                        #'tools/replace-sql-query-tool
                        #'tools/ask-for-sql-clarification-tool]})

(register-profile!
 {:name            :nlq
  :prompt-template "natural-language-querying-only.selmer"
  :max-iterations  10
  :temperature     0.3
  ;; the nlq profile gets both the general instance search and, for users with the semantic-search
  ;; feature, the curated search tool (gated via its :feature-semantic-search capability).
  :tools           [#'tools/nlq-search-tool
                    #'tools/curated-search-tool
                    #'tools/read-resource-tool
                    #'tools/construct-notebook-query-tool
                    #'tools/navigate-user-tool
                    #'tools/create-chart-tool
                    #'tools/edit-chart-tool]})

(register-profile!
 {:name            :document-generate-content
  :prompt-template "document-generate-content.selmer"
  :max-iterations  10
  :temperature     0.3
  :required-tool-call? true
  ;; Producing a chart draft is the answer; a successful construct ends the turn (schema collection
  ;; is a non-terminal preparatory step). Failed constructs don't terminate, so the model retries.
  :terminal-tools  #{"document_construct_model_chart" "document_construct_sql_chart"}
  :tools           [#'tools/list-available-data-sources-tool
                    #'tools/list-available-fields-tool
                    #'tools/get-field-values-tool
                    #'tools/document-schema-collect-tool
                    #'tools/document-construct-model-chart-tool
                    #'tools/document-construct-sql-chart-tool]})

(register-profile!
 {:name            :slackbot
  :prompt-template "slackbot.selmer"
  :max-iterations  10
  :temperature     0.3
  :tools           [#'tools/search-tool
                    #'tools/slackbot-construct-notebook-query-tool
                    #'tools/list-available-fields-tool
                    #'tools/get-field-values-tool
                    #'tools/static-viz-tool
                    #'tools/create-alert-tool
                    #'tools/slackbot-create-dashboard-subscription-tool]})

(defn- filter-by-capabilities
  "Filter tool vars by user capabilities.
  Removes tools that require capabilities the user doesn't have.
  Capabilities from the API arrive as strings (e.g. \"frontend:navigate_user_v1\")
  while tool metadata uses keywords (e.g. :frontend-navigate-user-v1), so we
  normalize to keywords before comparing."
  [tool-vars capabilities]
  (let [capabilities-set (capabilities/capability-set capabilities)]
    (filter (fn [tool-var]
              (every? capabilities-set (:capabilities (meta tool-var))))
            tool-vars)))

(defn- filter-by-scope
  "Filter tool vars by the current user's scope set.
  Removes tools whose `:scope` metadata is not satisfied by `*current-user-scope*`.
  Tools without `:scope` metadata pass through."
  [tool-vars]
  (filter (fn [tool-var]
            (let [required-scope (:scope (meta tool-var))]
              (or (nil? required-scope)
                  (api-scope/scope-matches? scope/*current-user-scope* required-scope))))
          tool-vars))

(defn- tool-map
  "Create a map of tool-name -> tool-var from a sequence of tool vars."
  [tool-vars]
  (into {} (map (juxt #(:tool-name (meta %)) identity) tool-vars)))

;;; API

(defn get-profile
  "Get profile configuration by profile-id keyword.
  The `:model` in the returned profile is resolved from the `llm-metabot-provider`
  setting at call time, so it always reflects the current admin configuration."
  [profile-id]
  (when-let [profile (get @*profiles profile-id)]
    (assoc profile :model (metabot.settings/llm-metabot-provider))))

(defn get-tools-for-profile
  "Get tool registry filtered by profile configuration, user capabilities, and scope.
  Filters out EE-only tools when the feature is not available, then filters by
  capabilities, then filters by `*current-user-scope*`. Returns a map of
  tool-name -> tool-var.

  When the resolved profile exposes at least one skill in its catalog, the
  `load_skill` tool is injected so the agent can pull skill bodies on demand."
  [profile-id capabilities]
  (when-let [profile (get-profile profile-id)]
    (let [base     (-> profile
                       :tools
                       (filter-by-capabilities capabilities)
                       filter-by-scope
                       tool-map)
          manifest (skills/build-skill-manifest profile (keys base) capabilities)]
      (cond-> base
        ;; Register load_skill whenever the profile has ANY skills — on-demand (catalog) or
        ;; always-on. Always-on bodies are inlined, but their presence still implies a
        ;; skill-bearing, possibly dialect-capable profile whose `dialect-preload-parts` emit a
        ;; synthetic `load_skill` call that must resolve to a registered tool.
        (or (seq (:catalog manifest)) (seq (:always-on manifest)))
        (assoc "load_skill" #'tools/load-skill-tool)))))
