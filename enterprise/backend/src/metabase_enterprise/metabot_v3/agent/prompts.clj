(ns metabase-enterprise.metabot-v3.agent.prompts
  "System for loading and rendering prompt templates using Selmer.

  Handles:
  - System prompt templates from resources/metabot/prompts/system/
  - SQL dialect instructions from resources/metabot/prompts/dialects/
  - Tool-specific prompts from resources/metabot/prompts/tools/
  - Template rendering with context variables
  - Template caching for performance"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.log :as log]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

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

(defn load-dialect-instructions
  "Load SQL dialect instructions from resources/metabot/prompts/dialects/.

  Example: (load-dialect-instructions \"postgresql\")
  Returns nil if dialect not found."
  [dialect-name]
  (when dialect-name
    (let [path (str "metabot/prompts/dialects/" dialect-name ".md")]
      (or (load-resource path)
          (do
            (log/debug "Dialect instructions not found:" path)
            nil)))))

(defn load-tool-prompt-template
  "Load a tool-specific prompt template from resources/metabot/prompts/tools/.

  Example: (load-tool-prompt-template \"query-datasource/system.selmer\")"
  [template-path]
  (let [path (str "metabot/prompts/tools/" template-path)]
    (or (load-resource path)
        (do
          (log/debug "Tool prompt template not found:" path)
          nil))))

;;; Template Rendering

(defn render-system-prompt
  "Render a system prompt template with context variables using Selmer.

  Parameters:
  - template: Template string (from load-system-prompt-template)
  - context: Map of template variables

  Common context variables:
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

(defn render-tool-prompt
  "Render a tool-specific prompt template with context variables.

  Similar to render-system-prompt but for tool-level prompts."
  [template context]
  (try
    (selmer/render template context)
    (catch Exception e
      (log/error e "Error rendering tool prompt template")
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
  (reset! metabot-v3.agent.prompts/template-cache {})"
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

(defn get-cached-dialect-instructions
  "Get dialect instructions from cache or load them.
  Returns instructions string or nil."
  [dialect-name]
  (when dialect-name
    (:template (cached-load-template "dialect" dialect-name load-dialect-instructions))))

(defn get-cached-tool-prompt
  "Get tool prompt template from cache or load it.
  Returns template string or nil."
  [template-path]
  (:template (cached-load-template "tool" template-path load-tool-prompt-template)))

(defn clear-cache!
  "Clear the template cache. Useful for development/testing."
  []
  (reset! template-cache {}))

;;; Tool Instructions Extraction

(defn extract-tool-instructions
  "Extract system instructions from tool definitions.

  Tools can provide instructions via:
  1. Metadata on tool var: (meta tool-var)
  2. Metadata on plain function: (meta fn)
  3. Direct key in tool map: (:system-instructions tool)

  Returns vector of maps: [{:tool-name \"search\" :instructions \"...\"}]"
  [tools]
  (vec
   (for [[tool-name tool-var] tools
         :let [;; Get metadata from var or function
               tool-meta (meta tool-var)
               ;; Try to get instructions from metadata or direct key
               instructions (or (:system-instructions tool-meta)
                               (when (map? tool-var) (:system-instructions tool-var)))]
         :when instructions]
     {:tool-name tool-name
      :instructions instructions})))

;;; High-Level API

(defn build-system-message-content
  "Build complete system message content from profile and context.

  Parameters:
  - profile: Profile map with :prompt-template key
  - context: Agent context map with user info, viewing context, etc.
  - tools: Tool registry map

  Returns rendered system message string."
  [{:keys [prompt-template]} context tools]
  (let [template-name (or prompt-template "internal.selmer")
        template (get-cached-system-prompt template-name)]
    (if template
      (let [sql-dialect (get context :sql-dialect)
            dialect-instructions (when sql-dialect
                                  (get-cached-dialect-instructions sql-dialect))
            tool-instructions (extract-tool-instructions tools)
            template-context {:current_time (get context :current-time)
                             :first_day_of_week (get context :first-day-of-week "Sunday")
                             :sql_dialect sql-dialect
                             :sql_dialect_instructions dialect-instructions
                             :tool_instructions tool-instructions
                             :viewing_context (get context :viewing-context)
                             :recent_views (get context :recent-views)}]
        (render-system-prompt template template-context))
      ;; Fallback if template not found
      (do
        (log/error "System prompt template not found:" template-name)
        "You are Metabot, a data analysis assistant for Metabase."))))

(comment
  ;; Development examples

  ;; Load and render a template
  (def template (load-system-prompt-template "internal.selmer"))
  (render-system-prompt template {:current-time "2024-01-15 14:30:00"
                                  :sql-dialect "postgresql"})

  ;; Load dialect instructions
  (load-dialect-instructions "postgresql")

  ;; Clear cache during development
  (clear-cache!)

  ;; Extract tool instructions
  (extract-tool-instructions {"search" #'some-tool-var})
  )
