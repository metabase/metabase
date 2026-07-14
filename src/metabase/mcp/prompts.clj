(ns metabase.mcp.prompts
  "Tier 3 of the guidance layer: playbooks the *user* invokes.

   Where instructions and skills are guidance the model picks up on its own, a prompt is a workflow a
   person reaches for deliberately — it surfaces as a slash command (`/mcp__metabase__build_dashboard`)
   in the clients that support prompts. That makes them complementary to the other two tiers rather
   than a third copy of them, and it is why the server is useful with no separate install: a client
   that ships no skill support at all still gets the workflows.

   Each prompt is a Mustache template on the classpath under `mcp/prompts/`, rendered with the
   arguments the client supplied and returned as a single user message. Prompts are scope-filtered like
   tools: a token that cannot write is not offered a playbook whose fourth step is a write."
  (:require
   [clojure.string :as str]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.util.i18n :refer [deferred-tru]]
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

(def ^:private prompts
  "The playbooks the server ships, in the order they are advertised.

   `:title`, `:description`, and each argument's `:description` are what a person reads in the client —
   the slash command's name and its argument hints — so they are translated. `:default` is not: it is
   substituted into the template the *model* reads, and the phrasing has to hold up as prose in that
   sentence."
  [{:name        "explore_database"
    :title       (deferred-tru "Explore a database")
    :description (deferred-tru "Map a database and report what it holds, how its tables join, what is already modeled, and what it can answer. Read-only.")
    :scope       "agent:discover:read"
    :template    "mcp/prompts/explore_database.md"
    :arguments   [{:name        "database"
                   :description (deferred-tru "The database to explore — its name or its id.")
                   :required    true}]}
   {:name        "build_dashboard"
    :title       (deferred-tru "Build a dashboard")
    :description (deferred-tru "Build a dashboard on a topic — find or write the questions, then assemble them into one.")
    :scope       "agent:author:write"
    :template    "mcp/prompts/build_dashboard.md"
    :arguments   [{:name        "topic"
                   :description (deferred-tru "What the dashboard should cover, in the words the user used.")
                   :required    true}
                  {:name        "collection"
                   :description (deferred-tru "Where to save it. Defaults to asking.")
                   :required    false
                   :default     "a collection you have chosen with the user"}]}])

(defn- visible-prompts
  [token-scopes]
  (filterv #(mcp.scope/matches? token-scopes (:scope %)) prompts))

(defn- public-argument
  [{:keys [name description required]}]
  {:name name :description (str description) :required (boolean required)})

(defn list-prompts
  "The MCP `prompts/list` payload, filtered by `token-scopes`. A prompt whose workflow the token could
   not carry out is not advertised, for the same reason `tools/list` hides a tool it cannot call."
  [token-scopes]
  {:prompts (mapv (fn [prompt]
                    {:name        (:name prompt)
                     :title       (str (:title prompt))
                     :description (str (:description prompt))
                     :arguments   (mapv public-argument (:arguments prompt))})
                  (visible-prompts token-scopes))})

(def ^:private ^:const missing-argument
  "Sentinel key marking the argument map a required argument was absent from."
  ::missing-argument)

(defn- template-values
  "The values `prompt`'s template renders with, filling optional arguments the caller omitted with the
   default phrasing. Returns `{::missing-argument <name>}` when a required argument has no value."
  [prompt arguments]
  (reduce (fn [values {:keys [name required default]}]
            (if-let [supplied (some-> (get arguments (keyword name)) str str/trim not-empty)]
              (assoc values (keyword name) supplied)
              (if required
                (reduced {missing-argument name})
                (assoc values (keyword name) default))))
          {}
          (:arguments prompt)))

(defn get-prompt
  "The MCP `prompts/get` payload for `prompt-name`. Every outcome is a `:status` on the returned map, so
   a caller reads one channel:

   - `{:status :ok :description ... :messages [...]}`
   - `{:status :not-found}` — no prompt of that name is visible to `token-scopes`. An unknown prompt and
     one the token may not use are the same answer, so the listing and the fetch can't disagree.
   - `{:status :missing-argument :argument <name>}` — a required argument had no value. The client can
     ask the user for the argument it names."
  [prompt-name arguments token-scopes]
  (if-let [prompt (first (filter #(= prompt-name (:name %)) (visible-prompts token-scopes)))]
    (let [values (template-values prompt arguments)]
      (if-let [absent (get values missing-argument)]
        {:status :missing-argument :argument absent}
        {:status      :ok
         :description (str (:description prompt))
         :messages    [{:role    "user"
                        :content {:type "text"
                                  :text (stencil/render-file (:template prompt) values)}}]}))
    {:status :not-found}))
