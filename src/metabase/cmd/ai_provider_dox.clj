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

;;;; Markdown helpers

(defn- thousands
  "`1000000` -> `\"1,000,000\"`."
  [n]
  ;; not `format`, whose grouping separator follows the default locale and so would differ between a laptop and CI
  (str/replace (str n) #"(\d)(?=(\d{3})+$)" "$1,"))

(defn- label
  "The `:label` of a registry entry — a provider type, a credential field, or one of a field's options — as a plain
  string."
  [x]
  ;; `str` runs a `deferred-tru` through `MessageFormat`, which is how a doubled `''` in the registry reaches the
  ;; page as a single quote
  (str (:label x)))

;;;; Credential fields

(defn- fields-by-key
  "`fields` indexed by their `:key`."
  [fields]
  (into {} (map (juxt :key identity)) fields))

(defn- field-at
  "The field `k` names in a [[fields-by-key]] index. Throws when there is none."
  [fields-index k]
  ;; a `:show-when` or `:required-any` left pointing at a renamed key would otherwise render as an empty `****`
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
  "The `:show-when` condition that reveals a field, or nil when it is always shown."
  [{:keys [show-when]} fields-index]
  (when-let [{:keys [field value]} show-when]
    (let [controlling (field-at fields-index field)]
      (str "Only when " (md/bold (label controlling)) " is " (md/bold (option-label controlling value)) "."))))

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
  [env-var]
  (when env-var
    (str "Set it with " (md/code env-var) ".")))

(defn- field-entry
  "One credential field as a Markdown bullet. `fields-index` indexes the field's siblings, which a `:show-when`
  condition refers to; `env-var` is the environment variable that sets this field, or nil when none does."
  [field fields-index env-var]
  (md/sentences
   [(field-name-sentence field)
    (field-condition-sentence field fields-index)
    (md/sentence (:help field))
    (field-options-sentence field)
    (field-default-sentence field)
    (field-docs-sentence field)
    (field-env-var-sentence env-var)]))

;;;; Models

(defn- known-models-table
  "A `{model-id {:display-name ... :context-window ...}}` allow-list as a table, ordered by model ID."
  [models]
  ;; the context window column is dropped when nothing in the table publishes one — DeepSeek would otherwise get a
  ;; column of dashes, which reads as missing data rather than as a column that doesn't apply
  (let [sorted   (sort-by key models)
        windows? (boolean (some (comp :context-window val) sorted))
        row      (fn [[model-id {:keys [display-name context-window]}]]
                   (cond-> [(or display-name model-id) (md/code model-id)]
                     windows? (conj (if context-window (thousands context-window) "—"))))]
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
  [[tag value] provider-label]
  (case tag
    :known       (known-models-table value)
    :fixed       (fixed-models-table value)
    :deployments (deployment-models-paragraph provider-label value)
    :dynamic     (str "Metabase lists whichever models your " provider-label " server is serving, so what you can "
                      "pick depends on how you started it.")))

;;;; Gathering

(defn- model-source
  "Where a provider type's models come from, as `[:known models]`, `[:fixed models]`, `[:deployments field-labels]`, or
  `[:dynamic]`. Throws when the type matches none of them."
  [{:keys [type] :as provider-type} fields-index]
  (or (some->> (metabot.self/known-models type) not-empty (vector :known))
      (some->> (llm.provider/fixed-models type) not-empty (vector :fixed))
      ;; resolved here, so nothing downstream needs the field index
      (some->> (llm.provider/model-fields type) not-empty
               (mapv #(field-label fields-index %))
               (vector :deployments))
      (when (contains? dynamic-catalog-types type)
        [:dynamic])
      ;; a provider registered without its models wired up would otherwise ship a section that lists nothing
      (throw (ex-info (str "No model source for provider type " (pr-str type)
                           ". Add it to metabase.metabot.self/known-models, give it a :models or :model-fields key"
                           " in the registry, or name it in dynamic-catalog-types.")
                      {:provider type
                       :registry-keys (vec (keys provider-type))}))))

(defn- provider-doc
  "Everything the page says about one provider type, read out of the registry into plain data."
  [{:keys [type fields default-model mini-model managed? singleton? required-any] :as provider-type}]
  (let [fields-index (fields-by-key fields)]
    {:type          type
     :label         (label provider-type)
     :default-model default-model
     :mini-model    mini-model
     :managed?      (boolean managed?)
     :singleton?    (boolean singleton?)
     :fields        (vec fields)
     :fields-index  fields-index
     :env-vars      (llm.provider/connection-env-vars type)
     :required-any  required-any
     :model-source  (model-source provider-type fields-index)}))

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
    (when managed?
      (str "Managed by Metabase, so there's nothing to configure."
           (when singleton? " You can only connect one.")
           " See [Metabase AI Service](./settings.md#metabase-ai-service)."))]))

(defn- required-any-sentence
  "The `:required-any` credential groups spelled out, or nil for a type that has none."
  [provider-label required-any fields-index]
  ;; the per-field `(optional)` markers on their own would read as though none of the credentials were needed
  (when (seq required-any)
    (let [group (fn [field-keys] (str/join " and " (map #(md/bold (field-label fields-index %)) field-keys)))]
      (str provider-label " needs either " (str/join ", or " (map group required-any)) "."))))

(defn- credentials-section
  "What an admin has to enter to connect, and which combinations of it are enough."
  [{provider-label :label, :keys [type fields fields-index env-vars managed? required-any]}]
  (md/paragraphs
   [(cond
      (seq fields)
      (md/labeled-block "Credentials:"
                        (md/bullets (map #(field-entry % fields-index (get env-vars (:key %))) fields)))

      ;; only the managed provider has nothing to enter; saying so about any other type would tell an admin their
      ;; credentials are Metabase's problem when they are not
      managed?
      "Metabase authenticates this connection with your instance's license token, so there's no API key to enter."

      :else
      (throw (ex-info (str "No credential fields for provider type " (pr-str type)
                           ". Give it a :fields key in the registry, or mark it :managed?.")
                      {:provider type})))
    (required-any-sentence provider-label required-any fields-index)]))

(defn- provider-section
  "One provider's section of the page: heading, facts, models, then credentials."
  [{provider-label :label, models :model-source, :as doc}]
  (md/paragraphs
   [(md/heading 2 provider-label)
    (provider-facts doc)
    (md/labeled-block "Supported models:" (models-markdown models provider-label))
    (credentials-section doc)]))

(defn- document-markdown
  [intro provider-types]
  (when (empty? provider-types)
    (throw (ex-info "No provider types found; metabase.llm.provider's registry likely moved or changed shape" {})))
  (str (md/paragraphs (cons (str/trimr intro) (map (comp provider-section provider-doc) provider-types)))
       "\n"))

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
