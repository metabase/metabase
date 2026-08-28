(ns metabase.cmd.ai-provider-dox
  "Generate the reference page for the AI providers Metabase can connect to, by running

    clojure -M:ee:doc ai-providers-documentation

  The page is written from [[metabase.llm.provider/provider-types]]."
  (:require
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/ai/providers.md")

(def ^:private intro-resource "metabase/cmd/resources/ai-provider-intro.md")

(def ^:private provider-notes-resources
  "Hand-written prose appended to a provider type's section, keyed by type. Only the managed provider has an entry: its
  section is otherwise a models table, and what an admin needs to know about it — that it's a Metabase Cloud offering,
  how it's billed, how it authenticates — is prose rather than anything the registry holds."
  {"metabase" "metabase/cmd/resources/ai-provider-metabase.md"})

(def ^:private dynamic-catalog-types
  "Provider types that serve whatever models the operator loaded, so there is no list to publish."
  #{"vllm"})

(def ^:private max-enumerated-options
  "Above this many `:options`, a field's choices are pointed at rather than listed. Bedrock's dozens of regions are
  noise on a docs page, and are right there in the dropdown."
  6)

;;;; Credential fields

(defn- label
  "The `:label` of a registry entry — a provider type, a credential field, or one of a field's options — as a plain
  string."
  [x]
  ;; `str` runs a `deferred-tru` through `MessageFormat`, which is how a doubled `''` in the registry reaches the
  ;; page as a single quote
  (str (:label x)))

(defn- field-at
  "The field `k` names among `fields`. Throws when there is none."
  [fields k]
  ;; a `:show-when`, `:requires`, or `:required-any` left pointing at a renamed key would otherwise render as an
  ;; empty `****`
  (or (some #(when (= k (:key %)) %) fields)
      (throw (ex-info (str "No credential field named " (pr-str k))
                      {:field k :known-fields (mapv :key fields)}))))

(defn- field-labels
  "The fields `field-keys` name among `fields`, as bolded labels joined with `and` —
  `**Access key ID** and **API key**`."
  [fields field-keys]
  (str/join " and " (map #(md/bold (label (field-at fields %))) field-keys)))

(defn- option-label
  "The label a field's form control shows for the stored `value`, or `value` itself when no `:options` entry claims it."
  [{:keys [options]} value]
  (or (some #(when (= value (:value %)) (label %)) options)
      value))

(defn- field-qualifier
  "The parenthetical after a field's name, or nil when there is nothing to say."
  [{:keys [required? advanced?]}]
  ;; the defaults get no marker: spelling out `(optional)` would stutter against the `:help` text several
  ;; fields open with
  (when-let [notes (seq (cond-> []
                          required? (conj "required")
                          advanced? (conj "advanced")))]
    (str "(" (str/join ", " notes) ")")))

(defn- field-condition-sentence
  "The condition that reveals a field, or nil when it is always shown."
  [{:keys [show-when]} {:keys [fields]}]
  (when-let [{:keys [field value]} show-when]
    (let [controlling (field-at fields field)]
      (str "Only when " (md/bold (label controlling))
           " is " (md/bold (option-label controlling value)) "."))))

(defn- field-requires-sentence
  "The siblings a field cannot be set without, or nil when it stands on its own. The registry keys `:requires` by
  field, so this reads the map off the provider rather than anything hung off the field itself."
  [{:keys [key]} {:keys [requires fields]}]
  (when-let [dependency-keys (seq (get requires key))]
    (str "Only together with " (field-labels fields dependency-keys) ".")))

(defn- field-hosted-sentence
  "What Metabase Cloud asks of a field that a self-hosted Metabase does not, or nil when the two agree."
  [{:keys [help hosted-help hosted-required?]}]
  (if hosted-help
    ;; nil on a page generated with a hosting token, where the registry has already folded `:hosted-help` into
    ;; `:help` and repeating it would stutter
    (when (not= (str help) (str hosted-help))
      (md/sentence hosted-help))
    (when hosted-required?
      "Required on Metabase Cloud.")))

(defn- field-options-sentence
  "The choices a `:select` or `:segmented` field offers: listed when there are at most [[max-enumerated-options]] of
  them, and otherwise pointed at. Nil when the field has no `:options`."
  [{:keys [options]}]
  (when (seq options)
    (if (<= (count options) max-enumerated-options)
      (str "One of: " (str/join ", " (map #(md/code (label %)) options)) ".")
      ;; deliberately not a count: the long lists come from bundled SDKs, and would churn this page on every bump
      (str "Pick one from the dropdown in " (md/bold "Admin > AI") "."))))

(defn- field-default-sentence
  "The value a field starts at, or nil when it has no `:default`."
  [{:keys [default] :as field}]
  (when default
    ;; a field with `:options` stores one value but displays another, so show what the form shows
    (str "Defaults to " (md/code (option-label field default)) ".")))

(defn- field-env-var-sentence
  "The environment variable that can stand in for filling the field in, or nil when none configures it. Phrased as an
  alternative rather than an instruction: the admin form is how a connection is normally set up, and a Metabase Cloud
  admin can't set these themselves at all."
  [{:keys [key]} {:keys [env-vars]}]
  (when-let [env-var (get env-vars key)]
    (str "You can also set it with the environment variable " (md/code env-var) ".")))

(defn- field-entry
  "One credential field as a Markdown bullet, rendered against its `provider`: the type's `:requires` map, the
  environment variables that configure it, and its sibling fields."
  [{:keys [help docs-url] :as field} provider]
  (md/sentences
   [;; what the field is called, carrying its qualifier: `**API key** (required).`
    (str (md/sentences [(md/bold (label field)) (field-qualifier field)]) ".")
    (field-condition-sentence field provider)
    (field-requires-sentence field provider)
    (md/sentence help)
    ;; straight after `:help`, which on Bedrock is the keyless mode this qualifies
    (field-hosted-sentence field)
    (field-options-sentence field)
    (field-default-sentence field)
    ;; the words the admin form's own link uses, so the page and the UI agree; the `?` terminates it, so no period
    (when docs-url
      (md/link "Where do I find this?" docs-url))
    (field-env-var-sentence field provider)]))

;;;; Models

(defn- known-models-table
  "A `{model-id {:display-name ... :context-window ...}}` allow-list as a table, ordered by model ID."
  [models]
  ;; the context window column is dropped when nothing in the table publishes one — DeepSeek would otherwise get a
  ;; column of dashes, which reads as missing data rather than as a column that doesn't apply
  (let [sorted   (sort-by key models)
        windows? (some (comp :context-window val) sorted)
        row      (fn [[model-id {:keys [display-name context-window]}]]
                   (cond-> [(or display-name model-id) (md/code model-id)]
                     windows? (conj (if context-window (md/thousands context-window) "—"))))]
    (md/table (cond-> ["Model" "Model ID"]
                windows? (conj "Context window (tokens)"))
              (map row sorted))))

(defn- fixed-models-table
  "A registry-pinned `[{:id ... :display_name ...} ...]` catalog as a table, ordered by ID."
  [models]
  (md/table ["Model" "Model ID"]
            (for [{:keys [id display_name]} (sort-by :id models)]
              [(or display_name id) (md/code id)])))

(defn- models-markdown
  "Where a provider type's models come from, rendered as the body of its models block: an adapter allow-list, a
  registry-pinned catalog, deployments the admin names, or a catalog only the running server knows. Throws when the
  type matches none of them."
  [{:keys [type models model-fields fields] :as provider}]
  (let [known          (metabot.self/known-models type)
        provider-label (label provider)]
    (cond
      (seq known)
      (known-models-table known)

      (seq models)
      (fixed-models-table models)

      (seq model-fields)
      (str "Whichever model your deployment serves. " provider-label
           " serves the deployments you create, not a fixed catalog, so there's no list to pick from — Metabase "
           "works out the model from " (field-labels fields model-fields) " instead.")

      (contains? dynamic-catalog-types type)
      (str "Metabase lists whichever models your " provider-label " server is serving, so what you can "
           "pick depends on how you started it.")

      :else
      (throw (ex-info (str "No model source for provider type " (pr-str type)
                           ". Add it to metabase.metabot.self/known-models, give it a :models or :model-fields key"
                           " in the registry, or name it in dynamic-catalog-types.")
                      {:provider type
                       :registry-keys (vec (keys provider))})))))

;;;; Sections

(defn- provider-facts
  "The bullets under a provider's heading: how to name it in settings, and what it runs by default."
  [{:keys [type default-model mini-model managed? singleton?]}]
  (md/bullets
   [(str "Provider key: " (md/code type))
    (when default-model
      (str "Default model: " (md/code default-model)))
    (when mini-model
      (str "Model for short tasks like naming a conversation: " (md/code mini-model)))
    ;; each fact carries its own guard, so a singleton type that isn't managed still says so
    (md/sentences
     [(when managed? "Managed by Metabase, so there's nothing to configure.")
      (when singleton? "You can only connect one.")])]))

(defn- required-any-sentence
  "The `:required-any` credential groups spelled out, or nil for a type that has none."
  [{:keys [required-any fields] :as provider}]
  ;; the per-field `(optional)` markers on their own would read as though none of the credentials were needed
  (when (seq required-any)
    (str (label provider) " needs either "
         (str/join ", or " (map #(field-labels fields %) required-any))
         ".")))

(defn- credentials-section
  "What an admin has to enter to connect, and which combinations of it are enough."
  [{:keys [type fields managed?] :as provider}]
  (md/paragraphs
   [(cond
      (seq fields)
      (md/labeled-block "Credentials:" (md/bullets (map #(field-entry % provider) fields)))

      ;; only the managed provider has nothing to enter, so it gets no block at all — what it does instead of taking
      ;; credentials is prose, and lives in its `provider-notes-resources` entry. Saying so about any other type would
      ;; tell an admin their credentials are Metabase's problem when they are not
      managed?
      nil

      :else
      (throw (ex-info (str "No credential fields for provider type " (pr-str type)
                           ". Give it a :fields key in the registry, or mark it :managed?.")
                      {:provider type})))
    (required-any-sentence provider)]))

(defn- provider-section
  "One provider's section of the page: heading, facts, models, credentials, then whatever `notes` — a `{type markdown}`
  map of hand-written prose — holds for this type."
  [{:keys [type] :as registry-entry} notes]
  ;; one map carries the whole section: the registry entry, plus the environment variables that configure it
  (let [provider (assoc registry-entry :env-vars (llm.provider/connection-env-vars type))]
    (md/paragraphs
     [(md/heading 2 (label provider))
      (provider-facts provider)
      (md/labeled-block "Supported models:" (models-markdown provider))
      (credentials-section provider)
      (get notes type)])))

(defn- document-markdown
  "The whole page: the `intro` resource, then a section per registered provider type, each carrying whatever prose
  `notes` holds for it."
  [intro provider-types notes]
  (when (empty? provider-types)
    (throw (ex-info "No provider types found; metabase.llm.provider's registry likely moved or changed shape" {})))
  (md/document (cons intro (map #(provider-section % notes) provider-types))))

;;;; Entry point

(defn generate-dox!
  "Write the AI provider reference to `path`, defaulting to `docs/ai/providers.md`. Returns
  `{:path ... :providers n}`."
  ([]
   (generate-dox! output-path))
  ([path]
   (printf "Generating AI provider documentation in %s\n" path)
   (let [provider-types (llm.provider/provider-types)
         n              (count provider-types)]
     (cmd.common/write-doc-file! path (document-markdown (cmd.common/load-resource! intro-resource)
                                                         provider-types
                                                         (update-vals provider-notes-resources
                                                                      cmd.common/load-resource!)))
     (printf "Wrote %s (%d providers)\n" path n)
     (println "Done.")
     {:path path :providers n})))
