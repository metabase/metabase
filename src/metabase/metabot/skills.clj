(ns metabase.metabot.skills
  "First-class skill registry for the agent.

  A *skill* is a chunk of task-specific instructions that the agent loads on
  demand (via the `load_skill` tool) instead of carrying in the system prompt at
  all times. This keeps the cached system-prompt prefix small while still making
  rich, capability-specific guidance available when it's actually needed.

  Skills are decoupled from tools: a skill may associate with zero, one, or many
  tools; a tool may have many skills; and cross-cutting skills associate with no
  tool at all. Association is expressed on the skill (`:tools`, `:profiles`), so
  tools and profiles don't need to know about skills.

  Most skills are authored as markdown files with YAML frontmatter under
  `resources/metabot/skills/`. SQL dialect skills are registered programmatically
  from the existing `resources/metabot/prompts/dialects/` files; they are hidden
  from the catalog and surfaced only by `dialect-preload-parts` (or an explicit
  `load_skill` by id)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.scope :as scope]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private skill-schema
  [:map
   [:id :keyword]
   [:title :string]
   [:description :string]
   [:body :string]
   [:tools {:optional true} [:vector :string]]
   [:profiles {:optional true} [:maybe [:vector :keyword]]]
   [:capabilities {:optional true} [:vector :keyword]]
   [:scope {:optional true} :keyword]
   [:always-on {:optional true} :boolean]
   [:priority {:optional true} :int]
   [:dialect {:optional true} :string]])

(def ^:private *skills
  "Map of skill-id (keyword) -> skill definition map."
  (atom {}))

;;; Registration

(defn- normalize-skill
  "Apply defaults and coerce frontmatter values (parsed from YAML as strings) into
  the types the schema expects."
  [skill]
  (cond-> skill
    (:id skill)           (update :id keyword)
    true                  (update :tools (fnil #(mapv name %) []))
    (:profiles skill)     (update :profiles #(mapv keyword %))
    (:capabilities skill) (update :capabilities #(mapv keyword %))
    (:scope skill)        (update :scope keyword)
    true                  (update :priority (fnil int 50))
    true                  (update :always-on boolean)))

(defn- validate-skill!
  [skill]
  (when-not (mr/validate skill-schema skill)
    (throw (ex-info "Invalid skill definition"
                    {:skill  skill
                     :errors (me/humanize (mu/explain skill-schema skill))})))
  (when-let [required-scope (:scope skill)]
    (when-not (api-scope/registered-scope? required-scope)
      (throw (ex-info (str "Skill has unregistered scope: " required-scope)
                      {:skill skill :scope required-scope}))))
  skill)

(defn- split-frontmatter
  "Split a skill markdown file into [frontmatter-string body-string].
  Frontmatter is a leading block delimited by lines of `---`. Returns
  [nil whole-string] when no frontmatter is present."
  [s]
  (if (str/starts-with? s "---")
    (let [after-open (subs s 3)
          close-idx  (str/index-of after-open "\n---")]
      (if close-idx
        [(str/trim (subs after-open 0 close-idx))
         (str/triml (subs after-open (+ close-idx (count "\n---"))))]
        [nil s]))
    [nil s]))

(defn register-skill!
  "Register a skill, either from a markdown resource path (relative to
  `metabot/skills/`) or from a fully-specified skill map.

  Markdown form: reads the resource, parses YAML frontmatter for metadata and
  uses the remaining text as `:body`."
  [skill-or-path]
  (let [skill (if (map? skill-or-path)
                skill-or-path
                (let [resource (io/resource (str "metabot/skills/" skill-or-path))]
                  (when-not resource
                    (throw (ex-info "Skill resource not found" {:path skill-or-path})))
                  (let [[fm body] (split-frontmatter (slurp resource))]
                    (when-not fm
                      (throw (ex-info "Skill file is missing YAML frontmatter" {:path skill-or-path})))
                    (assoc (yaml/parse-string fm) :body (str/trim body)))))
        skill (-> skill normalize-skill validate-skill!)]
    (swap! *skills assoc (:id skill) skill)
    (:id skill)))

;;; Registry — markdown skills

(def ^:private skill-files
  "Markdown skill files under resources/metabot/skills/, registered at load."
  ["construct-notebook-query-core.md"
   "construct-notebook-query-advanced.md"
   "construct-notebook-query-operators.md"
   "read-resource.md"
   "create-sql-query.md"
   "edit-sql-query.md"
   "replace-sql-query.md"
   "edit-chart.md"
   "ask-for-sql-clarification.md"
   "write-transform-sql.md"
   "write-transform-python.md"])

;;; Registry — dialect skills (programmatic, hidden from catalog)

(def ^:private dialect-engines
  "SQL engines that have dialect instructions under resources/metabot/prompts/dialects/.
  The engine name matches the lowercased `sql_engine` from viewing context."
  ["athena" "bigquery" "clickhouse" "databricks" "druid" "h2" "mysql" "oracle"
   "postgresql" "redshift" "snowflake" "sqlite" "sqlserver" "vertica"])

(defn- dialect-skill-id
  "Skill id (keyword) for a SQL engine, e.g. \"postgresql\" -> :sql-dialect-postgresql."
  [engine]
  (keyword (str "sql-dialect-" engine)))

(defn- register-dialect-skills! []
  (doseq [engine dialect-engines
          :let [resource (io/resource (str "metabot/prompts/dialects/" engine ".md"))]]
    (if resource
      (register-skill! {:id          (dialect-skill-id engine)
                        :title       (str engine " SQL dialect")
                        :description (str "SQL dialect instructions for " engine ".")
                        :dialect     engine
                        :body        (str/trim (slurp resource))})
      (log/warn "Dialect instructions not found for engine:" engine))))

(defn- load-all-skills! []
  (doseq [f skill-files]
    (register-skill! f))
  (register-dialect-skills!))

;; Populate the registry at namespace load.
(load-all-skills!)

;;; Lookup / resolution

(defn get-skill
  "Return the skill definition for `id` (keyword), or nil."
  [id]
  (get @*skills id))

(defn all-skills
  "Return all registered skill definitions."
  []
  (vals @*skills))

(defn skills-for-tool
  "Return non-dialect skills associated with `tool-name` (a string)."
  [tool-name]
  (filter (fn [s]
            (and (not (:dialect s))
                 (some #{tool-name} (:tools s))))
          (all-skills)))

(defn skill-scope-ok?
  "Whether the current user's scope satisfies `skill`'s `:scope` (if any).
  Skills without `:scope` are unrestricted."
  [skill]
  (let [required-scope (:scope skill)]
    (or (nil? required-scope)
        (api-scope/scope-matches? scope/*current-user-scope* required-scope))))

(defn skill-visible?
  "Whether `skill` is available given the request's `capability-set` and the
  current user's scope. Skills without `:capabilities`/`:scope` are unrestricted."
  [skill capability-set]
  (and (every? capability-set (:capabilities skill))
       (skill-scope-ok? skill)))

(defn skill-loadable?
  "Whether `skill` may be loaded on demand by the current request. Applies the **same**
  capability + scope gate as the catalog (`skill-visible?`), reading the request-scoped
  capabilities from [[metabase.metabot.scope/*current-user-capabilities*]] so the `load_skill`
  tool and the manifest never diverge (a capability-gated skill hidden from the catalog must
  not be loadable by id)."
  [skill]
  (skill-visible? skill (capabilities/capability-set scope/*current-user-capabilities*)))

(defn skills-for-profile
  "Return the distinct, non-dialect skills relevant to `profile` given its
  `active-tool-names` (strings). A skill is relevant when it is listed on the
  profile's `:skills`, associates with an active tool, or is cross-cutting
  (no `:tools`) and matches the profile (`:profiles` nil or contains the name)."
  [profile active-tool-names]
  (let [active        (set active-tool-names)
        explicit      (set (:skills profile))
        profile-name  (:name profile)
        relevant? (fn [s]
                    (or (contains? explicit (:id s))
                        (some active (:tools s))
                        (and (empty? (:tools s))
                             (let [ps (:profiles s)]
                               (or (nil? ps) (contains? (set ps) profile-name))))))]
    (->> (all-skills)
         (remove :dialect)
         (filter relevant?)
         distinct)))

(defn build-skill-manifest
  "Build the skill manifest for a profile + active tools, gated by `capabilities`
  and the current user's scope.

  Returns {:always-on [skill-map…] :catalog [{:id :title :description}…]} sorted
  by descending priority then id."
  [profile active-tool-names capabilities]
  (let [cap-set (capabilities/capability-set capabilities)
        visible (->> (skills-for-profile profile active-tool-names)
                     (filter #(skill-visible? % cap-set))
                     (sort-by (juxt (comp - :priority) (comp str :id))))]
    {:always-on (filter :always-on visible)
     :catalog   (->> visible
                     (remove :always-on)
                     (mapv (fn [s]
                             {:id          (name (:id s))
                              :title       (:title s)
                              :description (:description s)})))}))

;;; Dialect preload

(defn dialect-preload-parts
  "Given a SQL `engine` name (e.g. \"postgresql\", as extracted from viewing
  context), return AISDK parts that preload its dialect skill body into the
  message stream as a synthetic `load_skill` tool call + result. These sit below
  the system cache breakpoint, so the cached system prefix stays identical across
  databases.

  Returns [] when `engine` is nil or has no matching dialect skill. Dialect
  context only arises in SQL-editor sessions, so its presence is itself the gate."
  [engine]
  (or (when engine
        (let [skill-id (dialect-skill-id engine)]
          (when-let [skill (get-skill skill-id)]
            (let [call-id (str "skill_preload_" (name skill-id))]
              [{:type :tool-input  :id call-id :function "load_skill" :arguments {:ids [(name skill-id)]}}
               {:type :tool-output :id call-id :result {:output (:body skill)}}]))))
      []))
