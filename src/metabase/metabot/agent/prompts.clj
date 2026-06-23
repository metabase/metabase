(ns metabase.metabot.agent.prompts
  "System for loading and rendering prompt templates using Selmer.

  Handles:
  - System prompt templates from resources/metabot/prompts/system/
  - Template rendering with context variables
  - Template caching for performance

  SQL dialect bodies are owned by `metabase.metabot.skills` (loaded as on-demand skills), not
  here."
  (:require
   [clojure.java.io :as io]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.skills :as skills]
   [metabase.util.log :as log]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

;; Kept local rather than required from metabase.metabot.tools to avoid a prompts->tools cycle;
;; mirrors the SQL entries in metabase.metabot.tools/query-generation-tool-names.
(def ^:private sql-generation-tool-names
  "SQL-writing tools.
  Their presence in the capability-filtered tool set — not the `:permission/metabot-sql-generation`
  permission alone — is what lets the model write SQL, since they're gated by the
  `permission:write_sql_queries` capability."
  #{"create_sql_query" "edit_sql_query" "replace_sql_query"})

;;; Template Loading

(defn- load-resource
  "Load a resource file as a string."
  [resource-path]
  (when-let [resource (io/resource resource-path)]
    (slurp resource)))

(defn load-system-prompt-template
  "Load a system prompt template from resources/metabot/prompts/system/.

  Example: (load-system-prompt-template \"internal.selmer\")"
  [template-name]
  (let [path (str "metabot/prompts/system/" template-name)]
    (or (load-resource path)
        (do
          (log/warn "System prompt template not found:" path)
          nil))))

(defn load-llm-shape-template
  "Load the LLM-shape (output-side XML) template from resources/metabot/prompts/."
  [template-name]
  (let [path (str "metabot/prompts/" template-name)]
    (or (load-resource path)
        (do
          (log/warn "LLM-shape template not found:" path)
          nil))))

;;; Template Rendering

(defn render-system-prompt
  "Render a system prompt template with context variables using Selmer.

  Parameters:
  - template: Template string (from load-system-prompt-template)
  - context: Map of template variables

   Common context variables:
   - :current-user-info - Formatted current user info and glossary
   - :current-time - User's current time string
  - :first-day-of-week - Calendar week start (default \"Sunday\")
  - :sql-dialect - SQL dialect name
  - :sql-dialect-instructions - Dialect-specific guidance (markdown)
  - :tool-instructions - Vector of tool instruction maps
  - :viewing-context - Formatted user viewing context
  - :recent-views - Formatted recent views"
  [template context]
  (try
    (selmer/render template context)
    (catch Exception e
      (log/error e "Error rendering system prompt template")
      ;; Return template as-is on error
      template)))

;;; Template Caching

(def ^:private template-cache
  "In-memory cache for loaded templates.
  Map of resource-path -> {:template string :loaded-at instant}"
  (atom {}))

(defn- cache-key
  "Generate cache key for a template."
  [resource-type resource-name]
  (str resource-type ":" resource-name))

(defn cached-load-template
  "Load template with caching. Cache is simple in-memory map.

  In development, you can clear the cache to reload templates:
  (reset! metabot.agent.prompts/template-cache {})"
  [resource-type resource-name loader-fn]
  (let [key (cache-key resource-type resource-name)]
    (or (get @template-cache key)
        (when-let [template (loader-fn resource-name)]
          (let [entry {:template template
                       :loaded-at (java.time.Instant/now)}]
            (swap! template-cache assoc key entry)
            entry)))))

(defn get-cached-system-prompt
  "Get system prompt template from cache or load it.
  Returns template string or nil."
  [template-name]
  (:template (cached-load-template "system" template-name load-system-prompt-template)))

(defn get-cached-llm-shape-template
  "Get the LLM-shape (output-side XML) template from cache or load it."
  []
  (:template (cached-load-template "llm-shape"
                                   "llm_shape.selmer"
                                   load-llm-shape-template)))

(defn get-cached-message-injection-template
  "Get the message injection template from cache or load it."
  []
  (:template (cached-load-template "message-injection"
                                   "message_injection.selmer"
                                   load-llm-shape-template)))

(defn clear-cache!
  "Clear the template cache. Useful for development/testing."
  []
  (reset! template-cache {}))

;;; High-Level API

(defn build-system-message-content
  "Build complete system message content from profile and context.

  Parameters:
  - profile: Profile map with :prompt-template key
  - context: Agent context map with user info, viewing context, etc.
  - tools: Tool registry map (name -> tool def/var)
  - capabilities: Sequence of capability strings/keywords for the request, used to
    gate which skills appear in the manifest.

  Tool-specific instructions are no longer embedded in the prompt; instead a
  skills manifest (one line per available skill) is rendered, and bodies are
  loaded on demand via the `load_skill` tool. SQL dialect instructions are
  preloaded into the message stream (see `metabase.metabot.skills`), not here.

  Returns rendered system message string."
  [{:keys [prompt-template] :as profile} context tools capabilities]
  (let [template-name (or prompt-template "internal.selmer")
        template      (get-cached-system-prompt template-name)]
    (if template
      (let [sql-dialect          (or (get context :sql_dialect)
                                     (get context :sql-dialect))
            {:keys [always-on catalog]} (skills/build-skill-manifest profile (keys tools) capabilities)
            current-user-info    (or (get context :current_user_info)
                                     (get context :current-user-info))
            current-time         (or (get context :current_time)
                                     (get context :current-time))
            first-day-of-week    (or (get context :first_day_of_week)
                                     (get context :first-day-of-week "Sunday"))
            viewing-context      (or (get context :viewing_context)
                                     (get context :viewing-context))
            recent-views         (or (get context :recent_views)
                                     (get context :recent-views))
            perms                (or scope/*current-user-metabot-permissions*
                                     scope/perm-type-defaults)
            ;; The SQL guidance tells the model to load SQL skills and use the SQL tools, so gate it
            ;; on those tools actually being active — the permission can be `:yes` while the request
            ;; lacks the `permission:write_sql_queries` capability that registers them.
            has-sql?             (and (= :yes (:permission/metabot-sql-generation perms))
                                      (boolean (some sql-generation-tool-names (keys tools))))
            has-nlq?             (= :yes (:permission/metabot-nlq perms))
            template-context     {:metabot_name              (metabot.settings/metabot-name)
                                  :current_time             current-time
                                  :current_user_info        current-user-info
                                  :first_day_of_week        first-day-of-week
                                  :sql_dialect              sql-dialect
                                  :sql_dialect_loaded       (some? (skills/dialect-skill sql-dialect))
                                  ;; `not-empty` so an empty catalog is nil (falsy) — Selmer treats
                                  ;; an empty vector as truthy, which would render the "# Available
                                  ;; skills … load the skill(s) you need" header with nothing to
                                  ;; load, nudging the model into pointless `load_skill` calls.
                                  :skill_catalog            (not-empty catalog)
                                  :skill_always_on          (mapv :body always-on)
                                  :viewing_context          viewing-context
                                  :recent_views             recent-views
                                  :has_sql_generation       has-sql?
                                  :has_nlq                  has-nlq?
                                  :has_query_tools          (or has-sql? has-nlq?)
                                  :has_other_tools          (= :yes (:permission/metabot-other-tools perms))
                                  :custom_instructions      (not-empty
                                                             (case template-name
                                                               "natural-language-querying-only.selmer"
                                                               (metabot.settings/metabot-nlq-system-prompt)
                                                               "sql-querying-only.selmer"
                                                               (metabot.settings/metabot-sql-system-prompt)
                                                               ;; default: internal.selmer and any other templates
                                                               (metabot.settings/metabot-chat-system-prompt)))}]
        (render-system-prompt template template-context))
      ;; Fallback if template not found
      (do
        (log/error "System prompt template not found:" template-name)
        (str "You are " (metabot.settings/metabot-name) ", a data analysis assistant for Metabase.")))))

(defn inject-context
  "Prepends a formatted context to a string, message."
  [context str*]
  (let [;; Injection is performed only when the hardcoded keys are present in in context to avoid
        ;; insertion e.g. insertion of blank xml tags.
        injection (when (some #(string? (not-empty (get context %)))
                              [:viewing_context :current_time :current_user_info])
                    (selmer/render (get-cached-message-injection-template)
                                   context))]
    (str injection str*)))

(comment
  ;; Development examples

  ;; Load and render a template
  (def template (load-system-prompt-template "internal.selmer"))
  (render-system-prompt template {:current-time "2024-01-15 14:30:00"
                                  :sql-dialect "postgresql"})

  ;; Clear cache during development
  (clear-cache!))
