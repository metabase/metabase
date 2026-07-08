(ns metabase.metabot.skills
  "First-class skill registry for the agent.

  A *skill* is a chunk of task-specific instructions that the agent loads on demand (via the `load_skill`
  tool) instead of carrying in the system prompt at all times.
  This keeps the cached system-prompt prefix small while keeping rich, capability-specific guidance
  available when needed.

  Skills are decoupled from tools: a skill may associate with zero, one, or many tools; a tool may have
  many skills; and cross-cutting skills associate with no tool at all.
  Association is expressed on the skill (`:tools`, `:profiles`), so tools and profiles don't need to know
  about skills.

  Most skills are authored as markdown files with YAML frontmatter under `resources/metabot/skills/`.
  SQL dialect skills are registered programmatically from the `resources/metabot/prompts/dialects/` files
  and surfaced only by `dialect-preload-parts`.
  `skills-for-profile` removes them from the manifest, so the catalog omits them and an explicit
  `load_skill` of their id is rejected by the manifest gate in `skill-loadable?`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.api-scope.core :as api-scope]
   [metabase.driver :as driver]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.scope :as scope]
   [metabase.util.files :as u.files]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml])
  (:import
   (java.nio.file Path)))

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
   [:priority {:optional true} :int]
   [:dialect {:optional true} :string]])

(def ^:private *skills
  "Registry of skills, indexed two ways:
   `:by-id`     skill-id (keyword) -> skill — for internal callers.
   `:by-id-str` skill-id (string)  -> skill — lets `load_skill` resolve caller-supplied ids
                                              without keywordizing them first.
  Both indexes are swapped together in one `reset!` so readers always see them in sync."
  (atom {:by-id {} :by-id-str {}}))

;;; Registration

(def ^:private skills-dir "metabot/skills")

(defn- normalize-skill
  "Apply defaults and coerce frontmatter values (YAML strings) into the types the schema expects."
  [skill]
  (cond-> skill
    (:id skill)           (update :id keyword)
    true                  (update :tools (fnil #(mapv name %) []))
    (:profiles skill)     (update :profiles #(mapv keyword %))
    (:capabilities skill) (update :capabilities #(mapv keyword %))
    (:scope skill)        (update :scope keyword)
    true                  (update :priority (fnil int 50))))

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
  Frontmatter is a leading block delimited by lines of `---`.
  Returns nil when no closed frontmatter block is present."
  [s]
  (when (str/starts-with? s "---")
    (let [after-open (subs s 3)]
      (when-let [close-idx (str/index-of after-open "\n---")]
        [(str/trim (subs after-open 0 close-idx))
         (str/triml (subs after-open (+ close-idx (count "\n---"))))]))))

(defn- resolve-skill
  "Resolve `skill-or-path` — a markdown resource path (relative to `metabot/skills/`) or a
  fully-specified skill map — into a validated skill map.
  The markdown form parses YAML frontmatter for metadata and uses the remaining text as `:body`."
  [skill-or-path]
  (-> (if (map? skill-or-path)
        skill-or-path
        (let [resource (io/resource (str skills-dir "/" skill-or-path))]
          (when-not resource
            (throw (ex-info "Skill resource not found" {:path skill-or-path})))
          (let [[fm body] (or (split-frontmatter (slurp resource))
                              (throw (ex-info "Skill file is missing YAML frontmatter"
                                              {:path skill-or-path})))]
            (assoc (yaml/parse-string fm) :body (str/trim body)))))
      normalize-skill
      validate-skill!))

;;; Registry — markdown skills

(defn- markdown-resource-names
  "Names of the `.md` files under resource directory `dir`, sorted.
  Works both from the filesystem and from inside the uberjar."
  [dir]
  (u.files/with-open-path-to-resource [path dir]
    (->> (u.files/files-seq path)
         (keep (fn [^Path file]
                 (let [filename (str (.getFileName file))]
                   (when (str/ends-with? filename ".md")
                     filename))))
         sort
         vec)))

(defn- markdown-skills []
  (map resolve-skill (markdown-resource-names skills-dir)))

;;; Registry — dialect skills (programmatic, hidden from catalog)

(def ^:private dialects-dir "metabot/prompts/dialects")

(defn- dialect-skill-id
  "Skill id (keyword) for a SQL engine, e.g. \"postgresql\" -> :sql-dialect-postgresql."
  [engine]
  (keyword (str "sql-dialect-" engine)))

(defn- dialect-skills
  "A hidden skill per dialect instruction file under resources/metabot/prompts/dialects/.
  The file name (sans extension) is the engine name (the lowercased `sql_engine` from viewing context)."
  []
  (for [filename (markdown-resource-names dialects-dir)
        :let [engine (str/replace filename #"\.md$" "")]]
    (resolve-skill {:id          (dialect-skill-id engine)
                    :title       (str engine " SQL dialect")
                    :description (str "SQL dialect instructions for " engine ".")
                    :dialect     engine
                    :body        (str/trim (slurp (io/resource (str dialects-dir "/" filename))))})))

(defn load-skills!
  "Scan the skill resource directories and (re)populate the registry.
  Runs at namespace load; public so a REPL can refresh the registry after editing skill files."
  []
  ;; Build the full registry before touching the atom: a failed refresh (e.g. a malformed skill file)
  ;; throws without clobbering the existing registry, and readers never observe a partial one.
  ;; The reset! also means re-initializing drops removed or renamed skills.
  ;; `vec` realizes the (lazy) skill seq once so resources aren't slurped+parsed once per index.
  (let [skills (vec (concat (markdown-skills) (dialect-skills)))]
    (reset! *skills {:by-id     (into {} (map (juxt :id identity)) skills)
                     :by-id-str (into {} (map (juxt (comp name :id) identity)) skills)})))

(load-skills!)

;;; Lookup / resolution

(defn get-skill
  "Return the skill definition for `id` (keyword), or nil."
  [id]
  (get-in @*skills [:by-id id]))

(defn get-skill-by-id-string
  "Return the skill definition for string `id`, or nil.
  Unlike [[get-skill]], looks up by string so we don't need to keywordize `id` first."
  [id]
  (get-in @*skills [:by-id-str id]))

(defn all-skills
  "Return all registered skill definitions."
  []
  (vals (:by-id @*skills)))

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
  "Whether `skill` is available given the request's `capability-set` and the current user's scope.
  Skills without `:capabilities`/`:scope` are unrestricted."
  [skill capability-set]
  (and (every? capability-set (:capabilities skill))
       (skill-scope-ok? skill)))

(defn skill-loadable?
  "Whether `skill` may be loaded on demand by the current request.
  Applies the **same** capability + scope gate as the catalog (`skill-visible?`) and, when a request
  manifest has been built, requires the id to be present in that manifest. This prevents a request
  with `load_skill` from loading hidden skills for inactive tools/profiles by guessing ids."
  [skill]
  (and (skill-visible? skill (capabilities/capability-set scope/*current-user-capabilities*))
       (or (nil? scope/*current-loadable-skill-ids*)
           (contains? @scope/*current-loadable-skill-ids* (:id skill)))))

(defn- record-loadable-skill-ids!
  "Remember the exact visible skill ids from the current request's manifest, when request
  scope tracking is enabled."
  [visible]
  (when-let [allowed-ids scope/*current-loadable-skill-ids*]
    (reset! allowed-ids (set (map :id visible)))))

(defn skills-for-profile
  "Return the distinct, non-dialect skills relevant to `profile` given its `active-tool-names` (strings).
  A skill is relevant when it is listed on the profile's `:skills`, associates with an active tool, or is
  cross-cutting (no `:tools`) and matches the profile (`:profiles` nil or contains the name)."
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
  "Build the skill manifest for a profile + active tools, gated by `capabilities` and the user's scope.
  Returns {:always-on [skill-map…] :catalog [{:id :title :description}…]} sorted by descending priority
  then id.

  Whether a skill is *always-on* (body inlined in the system prompt) vs *on-demand* (advertised in the
  catalog, loaded via `load_skill`) is decided **per profile**, by the profile's `:always-on-skills`
  set — not by the skill itself — so the same skill can be inlined for one profile and on-demand for
  another (e.g. the SQL skills are always-on for `:sql` but on-demand for `:internal`)."
  [profile active-tool-names capabilities]
  (let [cap-set       (capabilities/capability-set capabilities)
        always-on-ids (set (:always-on-skills profile))
        always-on?    (comp always-on-ids :id)
        visible       (->> (skills-for-profile profile active-tool-names)
                           (filter #(skill-visible? % cap-set))
                           (sort-by (juxt (comp - :priority) (comp str :id))))
        ;; Always-on skill bodies are already inlined in the system prompt, so they are neither
        ;; advertised in the catalog nor loadable on demand — only the on-demand skills are.
        ;; Recording only the loadable ids also stops `load_skill` from re-fetching an always-on
        ;; skill (a wasted iteration the model would otherwise spend).
        loadable      (remove always-on? visible)]
    (record-loadable-skill-ids! loadable)
    {:always-on (filter always-on? visible)
     :catalog   (mapv (fn [s]
                        {:id          (name (:id s))
                         :title       (:title s)
                         :description (:description s)})
                      loadable)}))

;;; Dialect preload

(defn- engine->dialect
  "Resolve a SQL `engine` (the driver name from viewing context, e.g. \"postgres\") to the dialect name
  its skill is registered under (the dialect file's base name, e.g. \"postgresql\").
  Resolution goes through [[metabase.driver/llm-sql-dialect-resource]], the canonical driver->dialect-file
  mapping (it isn't 1:1 — `:sparksql` shares databricks.md)."
  [engine]
  (when-let [path (try
                    (driver/llm-sql-dialect-resource (keyword engine))
                    ;; `engine` comes from FE-supplied viewing context and may not name a driver.
                    (catch Exception _ nil))]
    (-> path (str/split #"/") peek (str/replace #"\.md$" ""))))

(defn dialect-skill
  "The registered dialect skill for SQL `engine` (a driver name or dialect name), or nil.
  Tries `engine` as a dialect name first so bare dialect inputs never touch the driver system."
  [engine]
  (when engine
    (or (get-skill (dialect-skill-id engine))
        (some-> (engine->dialect engine) dialect-skill-id get-skill))))

(defn dialect-preload-parts
  "Given a SQL `engine` name (e.g. \"postgres\", as extracted from viewing context), return AISDK parts
  that preload its dialect skill body into the message stream as a synthetic `load_skill` tool call +
  result.
  These sit below the system cache breakpoint, so the cached system prefix stays identical across
  databases.

  Returns [] when `engine` is nil or has no matching dialect skill.
  Dialect context only arises in SQL-editor sessions, so its presence is itself the gate.

  Invariant: the emitted pair references the `load_skill` tool, which
  [[metabase.metabot.agent.profiles/get-tools-for-profile]] registers whenever the skill manifest is
  non-empty — i.e. the profile has any catalog or always-on skill.
  Any profile that can reach SQL-editor/dialect context also exposes query skills (e.g. the SQL
  profile inlines the `read-resource` skill via its `:always-on-skills`), so the manifest is non-empty
  and `load_skill` is always registered when this returns a non-empty preload."
  [engine]
  (or (when-let [skill (dialect-skill engine)]
        (let [skill-id (:id skill)
              call-id  (str "skill_preload_" (name skill-id))]
          [{:type :tool-input  :id call-id :function "load_skill" :arguments {:ids [(name skill-id)]}}
           {:type :tool-output :id call-id :result {:output (:body skill)}}]))
      []))
