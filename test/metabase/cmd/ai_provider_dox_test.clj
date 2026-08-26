(ns metabase.cmd.ai-provider-dox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.cmd.ai-provider-dox :as ai-provider-dox]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]
   [metabase.test :as mt]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(def ^:private api-key-field
  {:key       :api-key
   :label     (deferred-tru "API key")
   :type      :password
   :required? true
   :docs-url  "https://example.com/keys"})

(def ^:private base-url-field
  {:key       :base-url
   :label     (deferred-tru "API base URL")
   :type      :text
   :advanced? true
   :default   "https://example.com"})

;;; Bedrock's shape since BOT-1918: the key pair is optional on a self-hosted Metabase, which can sign with the AWS
;;; default credentials chain instead, required on Metabase Cloud, and half a pair authenticates nothing.

(def ^:private access-key-field
  {:key              :access-key-id
   :label            (deferred-tru "Access key ID")
   :type             :password
   :help             (deferred-tru "Leave the keys blank to authenticate with the AWS default credentials chain.")
   :hosted-required? true
   :hosted-help      (deferred-tru "On Metabase Cloud, Bedrock always authenticates with your own AWS keys.")})

(def ^:private secret-key-field
  {:key              :secret-access-key
   :label            (deferred-tru "Secret access key")
   :type             :password
   :hosted-required? true})

(defn- index
  "`fields` indexed the way the renderers take them."
  [fields]
  (#'ai-provider-dox/fields-by-key fields))

(defn- registry-entry
  "The live registry entry for `type-name`, which is what the section renderers take."
  [type-name]
  (first (filter #(= type-name (:type %)) (llm.provider/provider-types))))

(deftest ^:parallel field-at-test
  (testing "a `:show-when` or `:required-any` left pointing at a renamed key fails loudly"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"No credential field named :nope"
                          (#'ai-provider-dox/field-at (index [api-key-field]) :nope)))))

(deftest ^:parallel field-qualifier-test
  (testing "only the facts that aren't the default get a marker"
    (is (= "(required)" (#'ai-provider-dox/field-qualifier api-key-field)))
    (is (= "(advanced)" (#'ai-provider-dox/field-qualifier base-url-field)))
    (is (= "(required, advanced)"
           (#'ai-provider-dox/field-qualifier {:required? true :advanced? true}))))
  (testing "a plain optional field gets no parenthetical, so `:help` opening with \"Optional\" doesn't stutter"
    (is (nil? (#'ai-provider-dox/field-qualifier {})))))

(deftest ^:parallel field-options-sentence-test
  (testing "a short list of choices is spelled out"
    (is (= "One of: `OpenAI`, `Anthropic`."
           (#'ai-provider-dox/field-options-sentence
            {:options [{:value "openai" :label "OpenAI"} {:value "anthropic" :label "Anthropic"}]}))))
  (testing "a long list is pointed at instead — but still says the field is a picker"
    (let [sentence (#'ai-provider-dox/field-options-sentence
                    {:options (for [n (range (inc @#'ai-provider-dox/max-enumerated-options))]
                                {:value (str n) :label (str "Region " n)})})]
      (is (= "Pick one from the dropdown in **Admin > AI**." sentence))
      (is (not (str/includes? sentence "Region 0")))))
  (testing "a field with no choices says nothing"
    (is (nil? (#'ai-provider-dox/field-options-sentence api-key-field)))))

(deftest ^:parallel field-default-sentence-test
  (testing "a plain default is shown as stored"
    (is (= "Defaults to `https://example.com`." (#'ai-provider-dox/field-default-sentence base-url-field))))
  (testing "a default with `:options` is shown as the label the form displays, not the stored value"
    (is (= "Defaults to `OpenAI`."
           (#'ai-provider-dox/field-default-sentence
            {:default "openai"
             :options [{:value "openai" :label "OpenAI"} {:value "anthropic" :label "Anthropic"}]}))))
  (testing "no default, nothing to say"
    (is (nil? (#'ai-provider-dox/field-default-sentence api-key-field)))))

(deftest ^:parallel field-requires-sentence-test
  (let [fields   [access-key-field secret-key-field api-key-field]
        requires {:access-key-id     [:secret-access-key]
                  :secret-access-key [:access-key-id :api-key]}]
    (testing "a field that needs one sibling names it"
      (is (= "Only together with **Secret access key**."
             (#'ai-provider-dox/field-requires-sentence access-key-field requires (index fields)))))
    (testing "a field that needs several names them all"
      (is (= "Only together with **Access key ID** and **API key**."
             (#'ai-provider-dox/field-requires-sentence secret-key-field requires (index fields)))))
    (testing "a field that stands on its own says nothing"
      (is (nil? (#'ai-provider-dox/field-requires-sentence api-key-field requires (index fields)))))
    (testing "a `:requires` left pointing at a renamed key fails loudly"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"No credential field named :nope"
                            (#'ai-provider-dox/field-requires-sentence
                             access-key-field {:access-key-id [:nope]} (index fields)))))))

(deftest ^:parallel field-hosted-sentence-test
  (testing "a field whose help changes on Metabase Cloud says how"
    (is (= "On Metabase Cloud, Bedrock always authenticates with your own AWS keys."
           (#'ai-provider-dox/field-hosted-sentence access-key-field))))
  (testing "a field Metabase Cloud merely requires says that much"
    (is (= "Required on Metabase Cloud."
           (#'ai-provider-dox/field-hosted-sentence secret-key-field))))
  (testing "generated with a hosting token the registry has already folded the text into `:help`, so don't stutter"
    (is (nil? (#'ai-provider-dox/field-hosted-sentence
               (assoc access-key-field :help (:hosted-help access-key-field))))))
  (testing "a field Metabase Cloud treats no differently says nothing"
    (is (nil? (#'ai-provider-dox/field-hosted-sentence api-key-field)))))

(defn- ctx
  "The per-provider context [[ai-provider-dox/field-entry]] renders a field against."
  [fields & {:keys [requires env-vars]}]
  {:requires requires :env-vars env-vars :fields-index (index fields)})

(deftest ^:parallel field-entry-test
  (testing "a required field names itself, links to its docs in the admin form's own words, and gives its env var"
    (is (= (str "**API key** (required). [Where do I find this?](https://example.com/keys) "
                "Set it with `MB_LLM_EXAMPLE_API_KEY`.")
           (#'ai-provider-dox/field-entry
            api-key-field (ctx [api-key-field] :env-vars {:api-key "MB_LLM_EXAMPLE_API_KEY"})))))
  (testing "a field with no environment variable simply omits it"
    (is (= "**API base URL** (advanced). Defaults to `https://example.com`."
           (#'ai-provider-dox/field-entry base-url-field (ctx [base-url-field])))))
  (testing "a `:show-when` field says which choice reveals it, by the label the form shows for that choice"
    (let [method  {:key     :auth-method
                   :label   (deferred-tru "Authentication method")
                   :type    :segmented
                   :options [{:value "key" :label (deferred-tru "Service account key")}
                             {:value "oauth" :label (deferred-tru "OAuth token")}]}
          keyfile {:key       :service-account-key
                   :label     (deferred-tru "Service account key file")
                   :type      :file
                   :show-when {:field :auth-method :value "key"}}]
      (is (= "**Service account key file**. Only when **Authentication method** is **Service account key**."
             (#'ai-provider-dox/field-entry keyfile (ctx [method keyfile]))))))
  (testing "a field optional here, required on Metabase Cloud, and useless without its partner says all three"
    (let [fields [access-key-field secret-key-field]]
      (is (= (str "**Access key ID**. Only together with **Secret access key**. "
                  "Leave the keys blank to authenticate with the AWS default credentials chain. "
                  "On Metabase Cloud, Bedrock always authenticates with your own AWS keys. "
                  "Set it with `MB_LLM_BEDROCK_ACCESS_KEY_ID`.")
             (#'ai-provider-dox/field-entry
              access-key-field
              (ctx fields
                   :requires {:access-key-id [:secret-access-key]}
                   :env-vars {:access-key-id "MB_LLM_BEDROCK_ACCESS_KEY_ID"})))))))

(deftest model-source-test
  (testing "each provider type resolves to the source its models really come from"
    (is (= :known (first (#'ai-provider-dox/model-source {:type "anthropic"} {}))))
    (is (= :fixed (first (#'ai-provider-dox/model-source {:type "google"} {}))))
    (is (= [:dynamic] (#'ai-provider-dox/model-source {:type "vllm"} {}))))
  (testing "a deployment type carries the labels of the fields its model is composed from, not their keys"
    (let [azure (registry-entry "azure")]
      (is (= [:deployments ["Model provider" "Deployment name"]]
             (#'ai-provider-dox/model-source azure (index (:fields azure)))))))
  (testing "a provider added to the registry but wired up nowhere fails loudly"
    ;; two guards stand behind this, and a brand-new type hits the first one: `known-models` refuses to answer for a
    ;; provider its `case` doesn't name, rather than shrugging and returning nil
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Unknown LLM provider"
                          (#'ai-provider-dox/model-source {:type "brand-new"} {}))))
  (testing "a provider known to have no allow-list, and no other model source either, fails loudly too"
    ;; the second guard: registering a type as having no allow-list isn't enough to document it
    (mt/with-dynamic-fn-redefs [metabot.self/known-models (constantly nil)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"No model source for provider type"
                            (#'ai-provider-dox/model-source {:type "brand-new"} {}))))))

(deftest ^:parallel models-markdown-test
  (testing "an adapter allow-list becomes a table with context windows"
    (let [markdown (#'ai-provider-dox/models-markdown
                    [:known {"claude-haiku" {:display-name "Claude Haiku 4.5" :context-window 200000}}]
                    "Anthropic")]
      (is (str/includes? markdown "| Context window (tokens) |"))
      (is (str/includes? markdown "| 200,000"))))
  (testing "a model with no context window still gets a row, dashed out under its neighbours"
    (is (str/includes? (#'ai-provider-dox/models-markdown
                        [:known {"deepseek-v4-flash" {:display-name "DeepSeek V4 Flash"}
                                 "deepseek-v4-pro"   {:display-name "DeepSeek V4 Pro" :context-window 131072}}]
                        "DeepSeek")
                       "| —")))
  (testing "a provider that publishes no context windows at all loses the column, rather than showing dashes"
    (let [markdown (#'ai-provider-dox/models-markdown
                    [:known {"deepseek-v4-pro" {:display-name "DeepSeek V4 Pro"}}]
                    "DeepSeek")]
      (is (str/includes? markdown "| Model "))
      (is (not (str/includes? markdown "Context window")))
      (is (not (str/includes? markdown "—")))))
  (testing "a registry-pinned catalog becomes a table with no context window column"
    (let [markdown (#'ai-provider-dox/models-markdown
                    [:fixed [{:id "google/gemini-3.5-flash" :display_name "gemini-3.5-flash"}]]
                    "Google Gemini Enterprise")]
      (is (str/includes? markdown "| Model "))
      (is (not (str/includes? markdown "Context window")))))
  (testing "Azure explains that the model comes from the deployment instead"
    (is (str/includes? (#'ai-provider-dox/models-markdown
                        [:deployments ["Model provider" "Deployment name"]]
                        "Microsoft Azure")
                       "**Model provider** and **Deployment name**")))
  (testing "vLLM says the catalog depends on the server"
    (is (str/includes? (#'ai-provider-dox/models-markdown [:dynamic] "vLLM")
                       "whichever models your vLLM server is serving"))))

(deftest ^:parallel provider-section-test
  (testing "a section heads with the provider's label, then runs facts, models, and credentials in that order"
    (let [markdown (#'ai-provider-dox/provider-section (registry-entry "anthropic"))]
      (is (str/starts-with? markdown "## Anthropic\n\n"))
      (is (< (str/index-of markdown "Provider key:")
             (str/index-of markdown "Supported models:")
             (str/index-of markdown "Credentials:")))
      (testing "the facts and the per-field environment variable both come off the registry entry"
        (is (str/includes? markdown "Default model: `claude-sonnet-4-6`"))
        (is (str/includes? markdown "Set it with `MB_LLM_ANTHROPIC_API_KEY`.")))))
  (testing "a field's references to its siblings are rendered as labels, not keys"
    (let [markdown (#'ai-provider-dox/provider-section (registry-entry "google"))]
      (is (str/includes? markdown
                         (str "needs either **Service account key file**, or "
                              "**OAuth access token** and **Project ID**.")))
      (is (str/includes? markdown "Only when **Authentication method** is **Service account key**."))
      (testing "a field with no `:show-when` carries no condition of its own"
        (let [project-id (->> (str/split-lines markdown)
                              (filter #(str/starts-with? % "- **Project ID**"))
                              first)]
          (is (some? project-id))
          (is (not (str/includes? project-id "Only when")))))))
  (testing "the managed provider has no credentials list to label"
    (let [markdown (#'ai-provider-dox/provider-section (registry-entry "metabase"))]
      (is (not (str/includes? markdown "Credentials:")))
      (is (str/includes? markdown "your instance's license token")))))

(deftest ^:parallel document-markdown-requires-providers-test
  (testing "an empty registry means the source moved, not that Metabase supports nothing"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"No provider types found"
                          (#'ai-provider-dox/document-markdown "# Intro" [])))))

(deftest generate-dox-test
  (mt/with-temp-file [path]
    (let [{:keys [providers]} (ai-provider-dox/generate-dox! path)
          markdown            (slurp path)]
      (testing "reports what it wrote"
        (is (= (count (llm.provider/provider-types)) providers)))
      (testing "the intro template is included"
        (is (str/starts-with? markdown "---\ntitle: Supported AI providers")))
      (testing "every provider in the registry gets a section"
        ;; the point of the page: a provider added to the registry can't quietly go undocumented
        (doseq [{:keys [label type]} (llm.provider/provider-types)]
          (is (str/includes? markdown (str "## " label))
              (str "no section for " type))
          (is (str/includes? markdown (str "Provider key: `" type "`"))
              (str "no provider key for " type))))
      (testing "each section runs provider facts, then models, then credentials"
        (let [section (second (str/split markdown #"\n## Anthropic\n"))]
          (is (< (str/index-of section "Provider key:")
                 (str/index-of section "Supported models:")
                 (str/index-of section "Credentials:")))))
      (testing "per-provider environment variables make it onto the page"
        (is (str/includes? markdown "`MB_LLM_ANTHROPIC_API_KEY`")))
      (testing "the page ends with exactly one newline"
        (is (str/ends-with? markdown "\n"))
        (is (not (str/ends-with? markdown "\n\n")))))))
