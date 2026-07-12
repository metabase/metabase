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
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

(def ^:private prompts
  "The playbooks the server ships, in the order they are advertised.

   `:arguments` is the MCP `PromptArgument` list, with `:default` carrying what the template renders
   when an optional argument is absent — the phrasing has to hold up as prose, since it is substituted
   into a sentence the model reads."
  [{:name        "explore_database"
    :title       "Explore a database"
    :description (str "Map a database and report what it holds, how its tables join, what is already "
                      "modeled, and what it can answer. Read-only.")
    :scope       "agent:discover:read"
    :template    "mcp/prompts/explore_database.md"
    :arguments   [{:name        "database"
                   :description "The database to explore — its name or its id."
                   :required    true}]}
   {:name        "build_dashboard"
    :title       "Build a dashboard"
    :description (str "Build a dashboard on a topic — find or write the questions, assemble them, and "
                      "wire up the filters.")
    :scope       "agent:author:write"
    :template    "mcp/prompts/build_dashboard.md"
    :arguments   [{:name        "topic"
                   :description "What the dashboard should cover, in the user's words."
                   :required    true}
                  {:name        "collection"
                   :description "Where to save it. Defaults to asking."
                   :required    false
                   :default     "a collection you have chosen with the user"}]}])

(defn- visible-prompts
  [token-scopes]
  (filterv #(mcp.scope/matches? token-scopes (:scope %)) prompts))

(defn- public-argument
  [{:keys [name description required]}]
  {:name name :description description :required (boolean required)})

(defn list-prompts
  "The MCP `prompts/list` payload, filtered by `token-scopes`. A prompt whose workflow the token could
   not carry out is not advertised, for the same reason `tools/list` hides a tool it cannot call."
  [token-scopes]
  {:prompts (mapv (fn [prompt]
                    (-> (select-keys prompt [:name :title :description])
                        (assoc :arguments (mapv public-argument (:arguments prompt)))))
                  (visible-prompts token-scopes))})

(defn- render
  "Render `prompt`'s template with `arguments`, filling optional arguments the caller omitted with the
   default phrasing. Returns the message text, or throws with the missing argument named."
  [{:keys [template] :as prompt} arguments]
  (let [values (into {}
                     (for [{:keys [name required default]} (:arguments prompt)]
                       (let [supplied (some-> (get arguments (keyword name)) str str/trim not-empty)]
                         (cond
                           supplied [(keyword name) supplied]
                           required (throw (ex-info (str "Missing required argument: " name)
                                                    {:prompt (:name prompt) :argument name}))
                           :else    [(keyword name) default]))))]
    (stencil/render-file template values)))

(defn get-prompt
  "The MCP `prompts/get` payload for `prompt-name`, or `{:status :not-found}` when no prompt of that
   name is visible to `token-scopes` — an unknown prompt and one the token may not use are the same
   answer, so the listing and the fetch can't disagree.

   Throws with the argument named when a required one is missing."
  [prompt-name arguments token-scopes]
  (if-let [prompt (first (filter #(= prompt-name (:name %)) (visible-prompts token-scopes)))]
    {:status      :ok
     :description (:description prompt)
     :messages    [{:role    "user"
                    :content {:type "text" :text (render prompt arguments)}}]}
    {:status :not-found}))
