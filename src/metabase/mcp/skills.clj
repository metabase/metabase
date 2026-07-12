(ns metabase.mcp.skills
  "Tier 2 of the guidance layer: the skills the server ships.

   Server instructions say how to use the tools; a skill says how to run a *process* with them — build
   a dashboard, author a query, edit a document. Most agent failures are cognitive rather than
   tool-selection ones, which is why this tier is co-equal with tool shape rather than garnish on it.

   Each skill is a directory on the classpath under `mcp/skills/`, in the Agent Skills open-standard
   format (agentskills.io): a `SKILL.md` whose YAML frontmatter carries the `name` and the
   `description` a client routes on, and whose body is unbounded reference material loaded only when
   the job needs it. Reference files sit beside it and are addressed on their own.

   They are served as MCP resources under `skill://metabase/<name>`, the URI shape SEP-2640 proposes,
   so a client that learns to fetch skills gets these without a server change. Until then the same
   content is installable from the Claude plugin."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.mcp.resources :as mcp.resources]))

(set! *warn-on-reflection* true)

(def ^:private skill-cache
  "Skill markdown is read off the classpath and changes only when the instance is upgraded."
  {:ttl-ms (* 24 60 60 1000)
   :scope  "global"})

(def registry
  "The skills this server ships, in the order they are advertised.

   An explicit list rather than a classpath scan: the resources live inside the uberjar, where
   directory listing is not a thing you can rely on, and the order a client sees should not depend on
   a filesystem's. `skills-match-the-registry-test` fails when a directory appears that no row names."
  [{:skill "core"}
   {:skill "mbql" :references ["operators.md"]}
   {:skill "native-sql"}
   {:skill "dashboard"}
   {:skill "visualization"}
   {:skill "document"}
   {:skill "curation"}])

(defn skill-uri
  "The `skill://` URI a skill is served at."
  [skill-name]
  (str "skill://metabase/" skill-name))

(defn reference-uri
  "The `skill://` URI one of a skill's reference files is served at."
  [skill-name file]
  (str (skill-uri skill-name) "/references/" file))

(defn- skill-path [skill-name] (str "mcp/skills/" skill-name "/SKILL.md"))
(defn- reference-path [skill-name file] (str "mcp/skills/" skill-name "/references/" file))

(defn parse-frontmatter
  "Split Agent-Skills markdown into `[frontmatter body]`, the frontmatter parsed from its YAML block.
   Throws when the block is missing — a skill without a name and a description cannot be routed to, so
   it is a broken skill rather than an untitled one."
  [markdown]
  (let [[_ block body] (re-matches #"(?s)^---\R(.*?)\R---\R(.*)$" markdown)]
    (when-not block
      (throw (ex-info "Skill markdown has no YAML frontmatter block"
                      {:opening (subs markdown 0 (min 80 (count markdown)))})))
    [(yaml/parse-string block) (str/triml body)]))

(defn- load-skill
  [{:keys [skill references]}]
  (let [markdown            (-> skill skill-path io/resource (slurp :encoding "UTF-8"))
        [frontmatter _body] (parse-frontmatter markdown)]
    (when-not (= skill (:name frontmatter))
      (throw (ex-info "Skill frontmatter name does not match its directory"
                      {:directory skill :frontmatter-name (:name frontmatter)})))
    (when (str/blank? (:description frontmatter))
      (throw (ex-info "Skill has no description; a client routes on it" {:skill skill})))
    {:name        skill
     :description (:description frontmatter)
     :uri         (skill-uri skill)
     :markdown    markdown
     :references  (vec (for [file references]
                         {:file     file
                          :uri      (reference-uri skill file)
                          :markdown (-> (reference-path skill file) io/resource (slurp :encoding "UTF-8"))}))}))

(def ^:private skills-delay
  (delay (mapv load-skill registry)))

(defn skills
  "Every shipped skill, loaded and validated: `{:name :description :uri :markdown :references}`."
  []
  @skills-delay)

(defn- register-skill!
  [skill]
  (mcp.resources/register-resource!
   {:uri         (:uri skill)
    :name        (str "Skill: " (:name skill))
    :description (:description skill)
    :mimeType    "text/markdown"
    :cache       skill-cache
    :render-fn   (constantly (:markdown skill))})
  (doseq [reference (:references skill)]
    (mcp.resources/register-resource!
     {:uri         (:uri reference)
      :name        (str "Skill: " (:name skill) " / " (:file reference))
      :description (str "Reference material for the `" (:name skill) "` skill.")
      :mimeType    "text/markdown"
      :cache       skill-cache
      :render-fn   (constantly (:markdown reference))})))

(defn register-skills!
  "Publish every skill as an MCP resource. Idempotent — the registry overwrites by URI."
  []
  (run! register-skill! (skills)))

(register-skills!)
