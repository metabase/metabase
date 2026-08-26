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

(defn- fields-by-key
  "`fields` indexed by their `:key`."
  [fields]
  (into {} (map (juxt :key identity)) fields))

(defn- field-at
  "The field `k` names in a [[fields-by-key]] index. Throws when there is none."
  [fields-index k]
  ;; a `:show-when`, `:requires`, or `:required-any` left pointing at a renamed key would otherwise render as an
  ;; empty `****`
  (or (get fields-index k)
      (throw (ex-info (str "No credential field named " (pr-str k))
                      {:field k :known-fields (vec (keys fields-index))}))))

(defn- field-label
  "The label of the field `k` names in a [[fields-by-key]] index."
  [fields-index k]
  (label (field-at fields-index k)))

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

(defn- field-name-sentence
  "What the field is called, carrying its qualifier: `**API key** (required).`"
  [field]
  (str (md/bold (label field))
       (some->> (field-qualifier field) (str " "))
       "."))

(defn- field-condition-sentence
  "The condition that reveals a field, or nil when it is always shown."
  [{:keys [show-when]} {:keys [fields-index]}]
  (when-let [{:keys [field value]} show-when]
    (let [controlling (field-at fields-index field)]
      (str "Only when " (md/bold (label controlling))
           " is " (md/bold (option-label controlling value)) "."))))

(defn- field-requires-sentence
  "The siblings a field cannot be set without, or nil when it stands on its own. The registry keys `:requires` by
  field, so this reads the map off the `ctx` rather than anything hung off the field itself."
  [{:keys [key]} {:keys [requires fields-index]}]
  (when-let [dependency-keys (seq (get requires key))]
    (str "Only together with "
         (str/join " and " (map #(md/bold (field-label fields-index %)) dependency-keys))
         ".")))

(defn- field-help-sentence
  "The registry's own explanation of the field, or nil when it carries none."
  [{:keys [help]}]
  (md/sentence help))

(defn- field-hosted-sentence
  "What Metabase Cloud asks of a field that a self-hosted Metabase does not, or nil when the two agree."
  [{:keys [help hosted-help hosted-required?]}]
  (cond
    ;; the `not=` is for a page generated with a hosting token, where the registry has already folded `:hosted-help`
    ;; into `:help` and repeating it would stutter
    (and hosted-help (not= (str help) (str hosted-help)))
    (md/sentence hosted-help)

    (and hosted-required? (not hosted-help))
    "Required on Metabase Cloud."))

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

(defn- field-docs-sentence
  "A link to the provider's own instructions for filling the field in, or nil when there is nothing to link to."
  [{:keys [docs-url]}]
  ;; the words the admin form's own link uses, so the page and the UI agree; the `?` terminates it, so no period
  (when docs-url
    (md/link "Where do I find this?" docs-url)))

(defn- field-env-var-sentence
  "How to set the field without writing JSON into the setting, or nil when no environment variable configures it."
  [{:keys [key]} {:keys [env-vars]}]
  (when-let [env-var (get env-vars key)]
    (str "Set it with " (md/code env-var) ".")))

(defn- field-entry
  "One credential field as a Markdown bullet, rendered against its provider's `ctx`: the type's `:requires` map, the
  environment variables that configure it, and its fields indexed by key."
  [field ctx]
  (md/sentences
   [(field-name-sentence field)
    (field-condition-sentence field ctx)
    (field-requires-sentence field ctx)
    (field-help-sentence field)
    ;; straight after `:help`, which on Bedrock is the keyless mode this qualifies
    (field-hosted-sentence field)
    (field-options-sentence field)
    (field-default-sentence field)
    (field-docs-sentence field)
    (field-env-var-sentence field ctx)]))

;;;; Models

(defn- model-source
  "Where a provider type's models come from, as `[:known models]`, `[:fixed models]`, `[:deployments field-keys]`, or
  `[:dynamic]`. Throws when the type matches none of them."
  [{:keys [type models model-fields] :as provider-type}]
  (or (some->> (metabot.self/known-models type) not-empty (vector :known))
      (some->> (not-empty models) (vector :fixed))
      (some->> (not-empty model-fields) (vector :deployments))
      (when (contains? dynamic-catalog-types type)
        [:dynamic])
      (throw (ex-info (str "No model source for provider type " (pr-str type)
                           ". Add it to metabase.metabot.self/known-models, give it a :models or :model-fields key"
                           " in the registry, or name it in dynamic-catalog-types.")
                      {:provider type
                       :registry-keys (vec (keys provider-type))}))))

(defn- known-models-table
  "A `{model-id {:display-name ... :context-window ...}}` allow-list as a table, ordered by model ID."
  [models]
  ;; the context window column is dropped when nothing in the table publishes one — DeepSeek would otherwise get a
  ;; column of dashes, which reads as missing data rather than as a column that doesn't apply
  (let [sorted   (sort-by key models)
        windows? (boolean (some (comp :context-window val) sorted))
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

(defn- deployment-models-paragraph
  "Prose for a provider type that has no catalog to list, whose model is composed from the fields labeled
  `model-field-labels`."
  [provider-label model-field-labels]
  (str provider-label " serves the deployments you create, not a fixed catalog, so there's no model list to pick "
       "from. Metabase works out the model from "
       (str/join " and " (map md/bold model-field-labels))
       " instead."))

(defn- models-markdown
  "A [[model-source]] rendered as the body of a provider's models block."
  [[tag value] fields-index provider-label]
  (case tag
    :known       (known-models-table value)
    :fixed       (fixed-models-table value)
    :deployments (deployment-models-paragraph provider-label (mapv #(field-label fields-index %) value))
    :dynamic     (str "Metabase lists whichever models your " provider-label " server is serving, so what you can "
                      "pick depends on how you started it.")))

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
      (when singleton? "You can only connect one.")
      (when managed?
        (str "See " (md/link "Metabase AI Service" "./settings.md#metabase-ai-service") "."))])]))

(defn- required-any-sentence
  "The `:required-any` credential groups spelled out, or nil for a type that has none."
  [provider-label required-any fields-index]
  ;; the per-field `(optional)` markers on their own would read as though none of the credentials were needed
  (when (seq required-any)
    (let [group (fn [field-keys]
                  (str/join " and " (map #(md/bold (field-label fields-index %)) field-keys)))]
      (str provider-label " needs either " (str/join ", or " (map group required-any)) "."))))

(defn- credentials-section
  "What an admin has to enter to connect, and which combinations of it are enough."
  [{:keys [type fields managed? required-any] :as provider-type} {:keys [fields-index] :as ctx}]
  (md/paragraphs
   [(cond
      (seq fields)
      (md/labeled-block "Credentials:" (md/bullets (map #(field-entry % ctx) fields)))

      ;; only the managed provider has nothing to enter; saying so about any other type would tell an admin their
      ;; credentials are Metabase's problem when they are not
      managed?
      "Metabase authenticates this connection with your instance's license token, so there's no API key to enter."

      :else
      (throw (ex-info (str "No credential fields for provider type " (pr-str type)
                           ". Give it a :fields key in the registry, or mark it :managed?.")
                      {:provider type})))
    (required-any-sentence (label provider-type) required-any fields-index)]))

(defn- provider-section
  "One provider's section of the page: heading, facts, models, then credentials."
  [{:keys [type fields requires] :as provider-type}]
  (let [fields-index   (fields-by-key fields)
        provider-label (label provider-type)
        ctx            {:requires     requires
                        :env-vars     (llm.provider/connection-env-vars type)
                        :fields-index fields-index}]
    (md/paragraphs
     [(md/heading 2 provider-label)
      (provider-facts provider-type)
      (md/labeled-block "Supported models:"
                        (models-markdown (model-source provider-type) fields-index provider-label))
      (credentials-section provider-type ctx)])))

(defn- document-markdown
  "The whole page: the `intro` resource, then a section per registered provider type."
  [intro provider-types]
  (when (empty? provider-types)
    (throw (ex-info "No provider types found; metabase.llm.provider's registry likely moved or changed shape" {})))
  (md/document (cons intro (map provider-section provider-types))))

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
                                                         provider-types))
     (printf "Wrote %s (%d providers)\n" path n)
     (println "Done.")
     {:path path :providers n})))
