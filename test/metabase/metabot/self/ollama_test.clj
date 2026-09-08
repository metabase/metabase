(ns metabase.metabot.self.ollama-test
  "Tests for the Ollama adapter.

  Deliberately narrower than [[metabase.metabot.self.vllm-test]]: the two adapters share a transport,
  and re-proving Chat Completions here would duplicate a thousand lines to no end. What is covered is
  what differs — the credential shape (a keyless server is the normal one), the catalog shape Ollama
  actually returns, the absence of a context-window gate, and the Ollama vocabulary in every
  diagnosis, which is the reason the provider type exists at all."
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.ollama :as ollama]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; not localhost: Metabase is a server, so a realistic self-hosted address is another host
(def ^:private base-url "http://ollama.internal:11434/v1")

(def ^:private credentials
  "A self-hosted connection. No API key: a self-hosted Ollama is unauthenticated, so this is the
  ordinary case rather than a degenerate one."
  {:hosting "self-hosted" :base-url base-url})

(def ^:private cloud-credentials
  "An Ollama Cloud connection: a key and no address, because Cloud's address is not configurable."
  {:hosting "cloud" :api-key "sk-cloud-key"})

(def ^:private keyed-credentials
  "A self-hosted Ollama behind a proxy that requires a key."
  (assoc credentials :api-key "proxy-key"))

(def ^:private reasoning-credentials
  "A connection whose connect-time probe found the pulled model streaming its reasoning."
  (assoc credentials ollama/reasoning-config-key "true"))

;;; The shape Ollama's OpenAI-compatible `/v1/models` actually returns: no `max_model_len`, no
;;; `parent`, no `name`. Every field vLLM's adapter reads beyond `id` is absent here, which is why
;;; the context-window check has nothing to stand on.
(def ^:private ollama-catalog
  [{:id "good-model"   :object "model" :created 1786676106 :owned_by "library"}
   {:id "chatty-model" :object "model" :created 1786676106 :owned_by "library"}])

;;; ──────────────────────────────────────────────────────────────────
;;; ollama-request-body
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-applies-default-max-tokens-test
  (testing "an explicit max_tokens is always sent — without one a looping small model consumes the
           whole context window in a single call"
    (is (= (llm.settings/llm-max-tokens)
           (:max_tokens (ollama/ollama-request-body {:model "good-model"
                                                     :input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-caller-max-tokens-wins-test
  (testing "a caller-supplied max-tokens is not overridden by the default"
    (is (= 128
           (:max_tokens (ollama/ollama-request-body {:model      "good-model"
                                                     :input      [{:role :user :content "hi"}]
                                                     :max-tokens 128}))))))

(deftest ^:parallel request-body-raises-max-tokens-for-a-forced-tool-call-test
  (testing "a forced tool call gets the token floor even when the caller asked for less — below it a
           reasoning model spends the budget thinking and emits no call"
    (testing "schema"
      (is (= 2048
             (:max_tokens (ollama/ollama-request-body {:model      "good-model"
                                                       :input      [{:role :user :content "hi"}]
                                                       :schema     {:type "object"}
                                                       :max-tokens 128})))))
    (testing "tool_choice required"
      (is (= 2048
             (:max_tokens (ollama/ollama-request-body {:model       "good-model"
                                                       :input       [{:role :user :content "hi"}]
                                                       :tool_choice "required"
                                                       :max-tokens  128})))))))

(deftest ^:parallel request-body-raises-max-tokens-for-a-reasoning-connection-test
  (testing "a connection the probe found reasoning gets the larger floor — thinking, answer and tool
           call are billed against one budget"
    (is (= 16384
           (:max_tokens (ollama/ollama-request-body {:model       "good-model"
                                                     :input       [{:role :user :content "hi"}]
                                                     :credentials reasoning-credentials
                                                     :max-tokens  128})))))
  (testing "and a model the probe found does not reason keeps the caller's value"
    (is (= 128
           (:max_tokens (ollama/ollama-request-body {:model       "good-model"
                                                     :input       [{:role :user :content "hi"}]
                                                     :credentials credentials
                                                     :max-tokens  128}))))))

(deftest ^:parallel request-body-supplies-a-default-temperature-test
  (testing "a self-hosted server picks no sane default server-side, so the adapter supplies one"
    (is (= 0.3
           (:temperature (ollama/ollama-request-body {:model "good-model"
                                                      :input [{:role :user :content "hi"}]})))))
  (testing "and a caller-supplied temperature wins"
    (is (= 0
           (:temperature (ollama/ollama-request-body {:model       "good-model"
                                                      :input       [{:role :user :content "hi"}]
                                                      :temperature 0}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Credentials
;;; ──────────────────────────────────────────────────────────────────

(deftest a-connection-without-a-base-url-fails-rather-than-borrowing-the-setting-test
  (testing "the connection's credentials are the only source — a setting configuring another
           connection is not a fallback"
    (mt/with-temporary-setting-values [llm.settings/llm-ollama-api-base-url "http://saved:11434/v1"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Ollama base URL is set"
           (ollama/list-models {:credentials {}}))))))

(deftest ai-proxy-is-unsupported-test
  (testing "the managed proxy fronts hosted providers; a self-hosted server is reached directly"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for Ollama"
           (ollama/list-models {:credentials credentials :ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Model listing
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-passes-the-catalog-through-test
  (testing "every pulled model is offered — there is no whitelist — in the order the server lists them"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data ollama-catalog}})]
      (is (= {:models [{:id "good-model"   :display_name "good-model"}
                       {:id "chatty-model" :display_name "chatty-model"}]}
             (ollama/list-models {:credentials credentials}))))))

(deftest list-models-keeps-a-tagged-model-id-intact-test
  (testing "Ollama names models `family:tag`, and `llm-metabot-provider` stores the result as
           `ollama/{id}` — the tag separator must survive the listing"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data [{:id "qwen3:14b"}]}})]
      (is (= {:models [{:id "qwen3:14b" :display_name "qwen3:14b"}]}
             (ollama/list-models {:credentials credentials}))))))

(deftest list-models-fails-closed-on-a-body-that-is-not-a-catalog-test
  (testing "a 2xx whose body carries no model list throws, naming the base URL — the likeliest cause
           being a base URL that omits /v1"
    (doseq [body [{:status "ok"} {:object "list"} "<html>404</html>"]]
      (testing (str "body " (pr-str body))
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body body})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Ollama returned an unexpected model list response.*http://ollama\.internal:11434/v1"
               (ollama/list-models {:credentials credentials}))))))))

(deftest unreachable-diagnosis-splits-by-deployment-test
  (testing "a self-hosted server is unreachable for reasons the admin controls, and the address being
           reachable only from their own machine is the usual one"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (java.net.ConnectException. "Connection refused")))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not reach the Ollama server at http://ollama\.internal:11434/v1.*reachable from the Metabase server"
           (ollama/list-models {:credentials credentials})))))
  (testing "Ollama Cloud gets different advice — telling someone to start a server they do not run
           sends them nowhere"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (java.net.ConnectException. "Connection refused")))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not reach Ollama Cloud.*outbound proxy or firewall"
           (ollama/list-models {:credentials cloud-credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Preflight
;;; ──────────────────────────────────────────────────────────────────

(defn- probing-server
  "Stub `http/request` for the preflight path: `GET /models` returns `models`, and each
  `POST /chat/completions` returns whatever `choice-by-tool-choice` holds for the `tool_choice` it was
  sent, so the two probes can disagree."
  [models choice-by-tool-choice]
  (fn [{:keys [url body]}]
    (if (re-find #"/models$" (str url))
      {:status 200 :body {:data models}}
      (let [tool-choice (:tool_choice (json/decode+kw (str body)))]
        {:status 200 :body {:choices [(get choice-by-tool-choice tool-choice)]}}))))

(def ^:private tool-calling-message
  {:content    ""
   :tool_calls [{:id       "call-1"
                 :type     "function"
                 :function {:name "record_table_name" :arguments "{\"table_name\": \"orders\"}"}}]})

(defn- probe-choice!
  ([models chat-choice] (probe-choice! models chat-choice chat-choice))
  ([models auto-choice required-choice]
   (mt/with-dynamic-fn-redefs [http/request (probing-server models {"auto"     auto-choice
                                                                    "required" required-choice})]
     (ollama/list-models {:credentials credentials :probe? true}))))

(defn- probe!
  [models chat-message]
  (probe-choice! models {:message chat-message :finish_reason "tool_calls"}))

(deftest preflight-passes-on-a-model-that-calls-tools-test
  (testing "a model that returns a well-formed tool call passes and is adopted as the one to run on"
    (is (= {:models         [{:id "good-model" :display_name "good-model"}]
            :learned-config {ollama/reasoning-config-key "false"
                             :probed-model               "good-model"}}
           (probe! [{:id "good-model"}] tool-calling-message)))))

(deftest preflight-does-not-gate-on-a-context-window-test
  (testing "Ollama's catalog carries no `max_model_len`, so unlike vLLM there is nothing to check at
           connect time and a catalog entry without one still connects. A window too small surfaces
           later as truncation, which the ceiling messages name."
    (is (= "good-model"
           (get-in (probe! [{:id "good-model" :max_model_len 4096}] tool-calling-message)
                   [:learned-config :probed-model])))))

(deftest preflight-records-a-reasoning-model-test
  (testing "reasoning is observable only from the probe, and drives which renderer the frontend picks"
    (is (= "true"
           (get-in (probe! [{:id "good-model"}] (assoc tool-calling-message :reasoning "thinking..."))
                   [:learned-config ollama/reasoning-config-key])))
    (testing "the deprecated spelling some builds still emit counts too"
      (is (= "true"
             (get-in (probe! [{:id "good-model"}]
                             (assoc tool-calling-message :reasoning_content "thinking..."))
                     [:learned-config ollama/reasoning-config-key]))))))

(deftest preflight-rejects-a-model-that-cannot-call-tools-test
  (testing "the diagnosis names `ollama show` and pulling another model — Ollama drives tool calling
           from the model's own template, so there is no server flag to point the admin at"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"answered with text instead of calling a tool.*ollama show.*Capabilities"
         (probe! [{:id "chatty-model"}] {:content "Sure! The table is orders."})))))

(deftest preflight-rejects-a-model-that-leaks-its-thinking-into-chat-test
  (testing "reasoning that arrives as chat text would appear inside Metabot's answers"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"streamed its reasoning as chat text"
         (probe! [{:id "good-model"}] {:content "<think>hmm</think> orders"})))))

(deftest preflight-rejects-a-model-that-ignores-a-forced-tool-call-test
  (testing "a model can manage an optional call and still ignore a forced one, which chats fine but
           breaks titling and the whole sql profile"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"did not honor a forced tool call"
         (probe-choice! [{:id "good-model"}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message {:content "no thanks"} :finish_reason "stop"})))))

(deftest preflight-rejects-a-model-the-server-has-not-pulled-test
  (testing "falling back to another pulled model would pass every check and then persist a provider
           string naming a model the server does not have"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"missing-model is not available.*Models on offer: good-model, chatty-model"
         (mt/with-dynamic-fn-redefs
           [http/request (probing-server ollama-catalog
                                         {"auto"     {:message tool-calling-message :finish_reason "tool_calls"}
                                          "required" {:message tool-calling-message :finish_reason "tool_calls"}})]
           (ollama/list-models {:credentials credentials :probe? true :model "missing-model"}))))))

(deftest preflight-on-an-empty-catalog-names-ollama-pull-test
  (testing "a reachable server with nothing pulled is a distinct, actionable failure"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:object "list" :data []}})]
      (is (= {:models []} (ollama/list-models {:credentials credentials})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"no models pulled.*ollama pull"
           (ollama/list-models {:credentials credentials :probe? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Registration
;;; ──────────────────────────────────────────────────────────────────

(deftest ollama-is-a-registered-provider-type-test
  (testing "the type is in the registry, so it reaches the admin dropdown and the generated docs page"
    (is (some? (llm.provider/provider-type "ollama")))
    (is (= "Ollama" (str (:label (llm.provider/provider-type "ollama")))))
    (testing "with no default model — the operator serves whatever they pulled"
      (is (nil? (llm.provider/default-model "ollama"))))))

(deftest ollama-form-asks-which-deployment-test
  (testing "the two deployments need opposite things, so the admin says which they have rather than
           the form guessing"
    (let [fields   (:fields (llm.provider/provider-type "ollama"))
          by-key   (into {} (map (juxt :key identity)) fields)
          hosting  (:hosting by-key)
          base-url (:base-url by-key)]
      (testing "self-hosted leads and is the default: this type exists because operators asked to run
               their own models, so defaulting to a paid hosted service would invert the request"
        (is (= :segmented (:type hosting)))
        (is (= "self-hosted" (:default hosting)))
        (is (= ["self-hosted" "cloud"] (mapv :value (:options hosting)))))
      (testing "the address is asked for only when it is knowable — Cloud's is not configurable"
        (is (= {:field :hosting :value "self-hosted"} (:show-when base-url))))
      (testing "no default address: a self-hosted Ollama is wherever the operator put it, and on a
               real install localhost is the Metabase container rather than that host. The
               placeholder shows the shape without asserting an address."
        (is (nil? (:default base-url)))
        (is (= "http://ollama.your.company:11434/v1" (:placeholder base-url)))))))

(deftest ollama-requires-an-address-or-a-key-test
  (testing "`:required?` cannot say 'required in one mode' — validate-field! ignores :show-when — so
           the real rule lives in :required-any, as it does for Google's two auth methods"
    (is (= [[:base-url] [:api-key]] (:required-any (llm.provider/provider-type "ollama"))))
    (testing "either deployment configured on its own is complete"
      (is (true? (llm.provider/credentials-complete? "ollama" {:hosting "cloud" :api-key "sk-x"})))
      (is (true? (llm.provider/credentials-complete? "ollama" {:hosting  "self-hosted"
                                                               :base-url base-url}))))
    (testing "and neither is not"
      (is (false? (llm.provider/credentials-complete? "ollama" {})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"ollama needs one of: API base URL or API key"
           (llm.provider/validate-config! "ollama" {:hosting "self-hosted"})))))
  (testing "a trailing slash still cannot double up when a path is joined onto it"
    (is (= "http://host:11434/v1"
           (:base-url (llm.provider/with-field-defaults "ollama" {:base-url "http://host:11434/v1///"}))))))

(deftest ollama-resolves-the-address-from-the-deployment-test
  ;; Credentials go through `with-field-defaults` on every real path — `resolve-model-ref` for
  ;; requests, the provider API for connect — so these run through it too. Testing the adapter with a
  ;; hand-built map would pass for a `:hosting` value no caller can actually produce.
  (let [called (atom nil)
        url-of (fn [raw-config]
                 (reset! called nil)
                 (let [credentials (llm.provider/with-field-defaults "ollama" raw-config)]
                   (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                              (reset! called (:url req))
                                                              {:status 200 :body {:data []}})]
                     (ollama/list-models {:credentials credentials})))
                 @called)]
    (testing "Cloud has one address, so it is not configurable and a stray stored base URL cannot
             override the deployment the admin chose"
      (is (= "https://ollama.com/v1/models" (url-of {:hosting "cloud" :api-key "sk-cloud-key"})))
      (is (= "https://ollama.com/v1/models"
             (url-of {:hosting "cloud" :base-url "http://leftover:11434/v1"}))))
    (testing "a self-hosted connection goes exactly where it was told"
      (is (= (str base-url "/models") (url-of {:hosting "self-hosted" :base-url base-url}))))
    (testing "a self-hosted connection with no address throws rather than falling through to Cloud,
             which would send an operator's data somewhere they did not choose"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Ollama base URL is set"
           (url-of {:hosting "self-hosted" :api-key "proxy-key"}))))
    (testing "an environment-configured connection names its deployment with MB_LLM_OLLAMA_HOSTING.
             Without it `:hosting` defaults to self-hosted, so a key on its own is an incomplete
             self-hosted connection rather than a silent Cloud one."
      (is (= "http://env:11434/v1/models" (url-of {:base-url "http://env:11434/v1"})))
      (is (= "https://ollama.com/v1/models" (url-of {:hosting "cloud" :api-key "sk-x"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Ollama base URL is set"
           (url-of {:api-key "sk-x"}))))))

(deftest ollama-is-configurable-from-the-environment-test
  (testing "`:hosting` is not a credential, but it has to be settable or an env-configured Cloud
           connection could not say that is what it is"
    (is (= {:hosting  "MB_LLM_OLLAMA_HOSTING"
            :base-url "MB_LLM_OLLAMA_API_BASE_URL"
            :api-key  "MB_LLM_OLLAMA_API_KEY"}
           (llm.provider/connection-env-vars "ollama"))))
  ;; End to end through the real machinery — env var, setting, connection synthesis, field defaults,
  ;; adapter — because the seam being protected here spans all of it: an earlier cut of this provider
  ;; inferred the deployment from which fields were set, which `with-field-defaults` made unreachable,
  ;; and a unit test on the adapter alone did not notice.
  (letfn [(connection-config []
            (:config (first (llm.provider/connections))))
          (url-for [config]
            (let [called (atom nil)]
              (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                         (reset! called (:url req))
                                                         {:status 200 :body {:data []}})]
                (ollama/list-models
                 {:credentials (llm.provider/with-field-defaults "ollama" config)}))
              @called))]
    (mt/with-temporary-setting-values [llm-providers []]
      (testing "a base URL alone synthesizes a self-hosted connection and reaches that server"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-base-url base-url]
          (is (= {:base-url base-url} (connection-config)))
          (is (= (str base-url "/models") (url-for (connection-config))))))
      (testing "a key plus MB_LLM_OLLAMA_HOSTING=cloud synthesizes a Cloud connection and reaches Cloud"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-key "sk-env"
                                      mb-llm-ollama-hosting "cloud"]
          (is (= {:api-key "sk-env" :hosting "cloud"} (connection-config)))
          (is (= "https://ollama.com/v1/models" (url-for (connection-config))))))
      (testing "a key on its own is an incomplete self-hosted connection rather than a silent Cloud
               one — `:hosting` defaults to self-hosted, so the address has to be said out loud"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-key "sk-env"]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"No Ollama base URL is set"
               (url-for (connection-config)))))))))

(deftest ollama-takes-one-key-for-either-deployment-test
  (testing "one field shown in both modes: Cloud always needs a key and a self-hosted server needs
           one only behind a proxy, but the admin has already said which they have, so copy spelling
           out both cases would always be half noise"
    (let [api-key (->> (:fields (llm.provider/provider-type "ollama"))
                       (m/find-first (comp #{:api-key} :key)))]
      (is (nil? (:show-when api-key)))
      (testing "and the help names neither deployment"
        (is (not (re-find #"(?i)cloud|self-hosted|proxy" (str (:help api-key))))))
      (testing "nor is there a docs link, which would be right for one mode and a wrong turn for the other"
        (is (nil? (:docs-url api-key))))))
  (testing "it is the only secret the type stores"
    (is (= #{:api-key} (llm.provider/secret-field-keys "ollama"))))
  (testing "and it authenticates either deployment, since both take the same Bearer header"
    (let [seen   (atom nil)
          bearer (fn [creds]
                   (mt/with-dynamic-fn-redefs
                     [http/request (fn [req]
                                     (reset! seen (get-in req [:headers "Authorization"]))
                                     {:status 200 :body {:data []}})]
                     (ollama/list-models {:credentials creds}))
                   @seen)]
      (is (= "Bearer sk-cloud-key" (bearer cloud-credentials)))
      (is (= "Bearer proxy-key" (bearer keyed-credentials)))
      (testing "a plain self-hosted server takes no key, and must not get an empty header"
        (is (nil? (bearer credentials)))))))
(deftest ollama-has-no-model-allow-list-test
  (testing "`known-models` returns nil rather than throwing — the catalog is whatever is pulled"
    (is (nil? (self/known-models "ollama")))))
