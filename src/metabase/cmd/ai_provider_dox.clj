(ns metabase.cmd.ai-provider-dox
  "Generate the reference page for the AI providers Metabase can connect to, by running

    clojure -M:ee:doc ai-providers-documentation

  The page is written from [[metabase.llm.provider/provider-types]], the registry the admin UI renders its
  connection forms from."
  (:require
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/ai/providers.md")

(def ^:private intro-resource "metabase/cmd/resources/ai-provider-intro.md")

(def ^:private dynamic-catalog-types
  "Provider types that serve whatever models the operator loaded, so there is no list to publish. Naming them keeps
  [[model-source]] able to tell them apart from a type whose models nobody remembered to wire up."
  #{"vllm"})

(def ^:private max-enumerated-options
  "Above this many `:options`, a field's choices are pointed at rather than listed. Bedrock's region list runs to
  dozens of entries, which is noise in a docs page and is right there in the dropdown anyway."
  6)

;;;; Markdown helpers

(defn- thousands
  "`1000000` -> `\"1,000,000\"`."
  [n]
  ;; grouped by hand rather than with `format`, whose grouping separator follows the default locale and so would
  ;; differ between a laptop and CI
  (str/replace (str n) #"(\d)(?=(\d{3})+$)" "$1,"))

(defn- code [s] (str "`" s "`"))

(defn- bold [s] (str "**" s "**"))

(defn- label
  "The `:label` of a registry entry — a provider type, a credential field, or one of a field's options — as a plain
  string. Forcing it through `str` is what runs a `deferred-tru` through `MessageFormat`, which is how a doubled `''`
  in the registry reaches the page as a single quote."
  [x]
  (str (:label x)))

(defn- sentence
  "`s` as a sentence: forced out of i18n and terminated with a period. Nil when there is nothing to say, so a field
  whose text is blank contributes no stray `.` to its bullet."
  [s]
  (let [s (str s)]
    (when-not (str/blank? s)
      ;; text that already ends in punctuation is left alone rather than given a second terminator
      (cond-> s
        (not (contains? #{\. \! \?} (last s))) (str ".")))))

(defn- sentences
  "Join the non-blank parts into one run of prose, a space between them."
  [parts]
  (str/join " " (remove str/blank? parts)))

(defn- paragraphs
  "Join the non-blank parts with blank lines between them."
  [parts]
  (str/join "\n\n" (remove str/blank? parts)))

(defn- bullets
  "Join the non-blank items as a Markdown list."
  [items]
  (str/join "\n" (map #(str "- " %) (remove str/blank? items))))

(defn- labeled-block
  "A `heading` line followed by `body`."
  [heading body]
  (str heading "\n\n" body))

(defn- table
  "A Markdown table. `rows` is a sequence of already-rendered cell vectors."
  [headers rows]
  ;; columns are padded to a common width: the rendered page is what reviewers read in a PR diff, and a ragged table
  ;; is hard to scan there even though it renders identically
  (let [widths    (apply mapv (fn [& cells] (apply max (map count cells))) headers rows)
        row->line (fn [cells]
                    (str "| " (str/join " | " (map #(format (str "%-" %2 "s") %1) cells widths)) " |"))]
    (str/join "\n"
              ;; the separator is just another row — its dashes are already exactly column width, so it pads to itself
              (list* (row->line headers)
                     (row->line (map #(apply str (repeat % "-")) widths))
                     (map row->line rows)))))

;;;; Credential fields

(defn- fields-by-key
  "`fields` indexed by their `:key`."
  [fields]
  (into {} (map (juxt :key identity)) fields))

(defn- field-at
  "The field `k` names in a [[fields-by-key]] index. Throws when nothing does: a `:show-when` or `:required-any` left
  pointing at a renamed key would otherwise render as an empty `****` on the page."
  [fields-index k]
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
  ;; only the facts that aren't the default get a marker: a field with none is optional and shown up front, and
  ;; spelling out `(optional)` as well would read as a stutter next to the `:help` text several of them open with
  (when-let [notes (seq (cond-> []
                          required? (conj "required")
                          advanced? (conj "advanced")))]
    (str "(" (str/join ", " notes) ")")))

(defn- field-name-sentence
  "What the field is called, carrying its qualifier: `**API key** (required).`"
  [field]
  (str (bold (label field))
       (some->> (field-qualifier field) (str " "))
       "."))

(defn- field-condition-sentence
  "The `:show-when` condition that reveals a field, or nil when it is always shown."
  [{:keys [show-when]} fields-index]
  (when-let [{:keys [field value]} show-when]
    (let [controlling (field-at fields-index field)]
      (str "Only when " (bold (label controlling)) " is " (bold (option-label controlling value)) "."))))

(defn- field-options-sentence
  "The choices a `:select` or `:segmented` field offers — listed when there are few enough to read, and otherwise
  pointed at, so that a field with a long list still reads as a picker rather than as free text."
  [{:keys [options]}]
  (when (seq options)
    (if (<= (count options) max-enumerated-options)
      (str "One of: " (str/join ", " (map #(code (label %)) options)) ".")
      ;; deliberately not a count: Bedrock's regions come from the bundled AWS SDK, so a number here would churn
      ;; this page on every SDK bump while telling the reader nothing they can act on
      (str "Pick one from the dropdown in " (bold "Admin > AI") "."))))

(defn- field-default-sentence
  "The value a field starts at, or nil when it has no `:default`."
  [{:keys [default] :as field}]
  (when default
    ;; a field with `:options` stores one value but displays another, so show what the form shows — `Defaults to
    ;; `openai`` under a list of `OpenAI` and `Anthropic` reads like a third choice
    (str "Defaults to " (code (option-label field default)) ".")))

(defn- field-docs-sentence
  "A link to the provider's own instructions for filling the field in, or nil when there is nothing to link to."
  [{:keys [docs-url]}]
  (when docs-url
    (str "[Where to find this](" docs-url ").")))

(defn- field-env-var-sentence
  "How to set the field without writing JSON into the setting, or nil when no environment variable configures it."
  [env-var]
  (when env-var
    (str "Set it with " (code env-var) ".")))

(defn- field-entry
  "One credential field as a bullet: what it's called, whether it's needed, where to find it, and the environment
  variable that sets it. `fields-index` indexes the field's siblings, which a `:show-when` condition refers to."
  [field fields-index env-var]
  (sentences
   [(field-name-sentence field)
    (field-condition-sentence field fields-index)
    (sentence (:help field))
    (field-options-sentence field)
    (field-default-sentence field)
    (field-docs-sentence field)
    (field-env-var-sentence env-var)]))

;;;; Models

(defn- known-models-table
  "A `{model-id {:display-name ... :context-window ...}}` allow-list as a table, ordered by model ID."
  [models]
  (table ["Model" "Model ID" "Context window (tokens)"]
         (for [[model-id {:keys [display-name context-window]}] (sort-by key models)]
           [(or display-name model-id)
            (code model-id)
            (if context-window (thousands context-window) "—")])))

(defn- fixed-models-table
  "A registry-pinned `[{:id ... :display_name ...} ...]` catalog as a table, ordered by ID."
  [models]
  (table ["Model" "Model ID"]
         (for [{:keys [id display_name]} (sort-by :id models)]
           [(or display_name id) (code id)])))

(defn- deployment-models-paragraph
  "Why a type whose model is composed from the fields labeled `model-field-labels` has no catalog to list — Azure
  serves deployments that the admin names."
  [provider-label model-field-labels]
  (str provider-label " serves the deployments you create, not a fixed catalog, so there's no model list to pick "
       "from. Metabase works out the model from "
       (str/join " and " (map bold model-field-labels))
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
      ;; the labels are resolved here rather than by the renderer, so nothing downstream needs the field index
      (some->> (llm.provider/model-fields type) not-empty
               (mapv #(field-label fields-index %))
               (vector :deployments))
      (when (contains? dynamic-catalog-types type)
        [:dynamic])
      ;; worth failing on: a provider added to the registry without its models wired up would otherwise ship a
      ;; section that looks complete and lists nothing
      (throw (ex-info (str "No model source for provider type " (pr-str type)
                           ". Add it to metabase.metabot.self/known-models, give it a :models or :model-fields key"
                           " in the registry, or name it in dynamic-catalog-types.")
                      {:provider type
                       :registry-keys (vec (keys provider-type))}))))

(defn- provider-doc
  "Everything the page says about one provider type, read out of the registry into plain data."
  [{:keys [type fields managed? singleton? required-any] :as provider-type}]
  (let [fields-index (fields-by-key fields)]
    {:type          type
     :label         (label provider-type)
     :default-model (llm.provider/default-model type)
     :mini-model    (llm.provider/mini-model type)
     :managed?      (boolean managed?)
     :singleton?    (boolean singleton?)
     :fields        (vec fields)
     :fields-index  fields-index
     :env-vars      (into {} (llm.provider/connection-env-vars type))
     :required-any  required-any
     :model-source  (model-source provider-type fields-index)}))

;;;; Sections

(defn- provider-facts
  "The bullets under a provider's heading: how to name it in settings, and what it runs by default."
  [{:keys [type default-model mini-model managed? singleton?]}]
  (bullets
   [(str "Provider key: " (code type))
    (when default-model
      (str "Default model: " (code default-model)))
    (when mini-model
      (str "Model for short tasks like naming a conversation: " (code mini-model)))
    (when managed?
      (str "Managed by Metabase, so there's nothing to configure."
           (when singleton? " You can only connect one.")
           " See [Metabase AI Service](./settings.md#metabase-ai-service)."))]))

(defn- required-any-sentence
  "The `:required-any` credential groups spelled out, or nil for a type that has none."
  [provider-label required-any fields-index]
  ;; Google takes either of two credential combinations, and the per-field `(optional)` markers on their own would
  ;; read as though none of them were needed
  (when (seq required-any)
    (let [group (fn [field-keys] (str/join " and " (map #(bold (field-label fields-index %)) field-keys)))]
      (str provider-label " needs either " (str/join ", or " (map group required-any)) "."))))

(defn- credentials-section
  "What an admin has to enter to connect, and which combinations of it are enough."
  [{provider-label :label, :keys [fields fields-index env-vars required-any]}]
  (paragraphs
   [(if (seq fields)
      (labeled-block "Credentials:"
                     (bullets (map #(field-entry % fields-index (get env-vars (:key %))) fields)))
      "Metabase authenticates this connection with your instance's license token, so there's no API key to enter.")
    (required-any-sentence provider-label required-any fields-index)]))

(defn- provider-section
  "One provider's section of the page: heading, facts, models, then credentials."
  [{provider-label :label, models :model-source, :as doc}]
  (paragraphs
   [(str "## " provider-label)
    (provider-facts doc)
    (labeled-block "Supported models:" (models-markdown models provider-label))
    (credentials-section doc)]))

(defn- document-markdown
  [intro provider-types]
  (when (empty? provider-types)
    (throw (ex-info "No provider types found; metabase.llm.provider's registry likely moved or changed shape" {})))
  (str (paragraphs (cons (str/trimr intro) (map (comp provider-section provider-doc) provider-types)))
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
