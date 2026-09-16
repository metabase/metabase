(ns metabase.metabot.self.ollama.capabilities-test
  "The lookup that replaced a single reasoning flag on the connection. What matters here is that the
  answer is per *model* — a connection serves as many as the operator has pulled, and Metabot and the
  mini model need not be on the same one."
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.metabot.self.ollama.capabilities :as ollama.capabilities]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private credentials
  {:hosting "self-hosted" :base-url "http://ollama.internal:11434/v1"})

(def ^:private cloud-credentials
  {:hosting "cloud" :api-key "sk-cloud-key"})

(defn- showing
  "Stub `http/request` for `/api/show`, answering from `capabilities-by-model` — a model absent from it
  gets a body with no `capabilities` key, which is what an Ollama too old to report them returns.
  Records every request it saw, and which thread made it."
  [capabilities-by-model seen]
  (fn [{:keys [body] :as req}]
    ;; the thread, so a test can tell a lookup made on the caller's thread from one handed to a future
    (swap! seen conj (assoc req ::thread (Thread/currentThread)))
    (let [model (:model (json/decode+kw (str body)))]
      {:status 200
       :body   (cond-> {:model model}
                 (contains? capabilities-by-model model)
                 (assoc :capabilities (get capabilities-by-model model)))})))

(defn- with-stub!
  "Call `f` with `handler` standing in for every HTTP request, the capability cache emptied on both
  sides so that neither the lookups under test nor the next test's inherit an answer."
  [handler f]
  (ollama.capabilities/clear-cache!)
  (try
    (mt/with-dynamic-fn-redefs [http/request handler]
      (f))
    (finally
      (ollama.capabilities/clear-cache!))))

(defn- with-server!
  "[[with-stub!]] against a `/api/show` stub, calling `f` with the atom of requests it received."
  [capabilities-by-model f]
  (let [seen (atom [])]
    (with-stub! (showing capabilities-by-model seen) #(f seen))))

;;; ──────────────────────────────────────────────────────────────────
;;; Where the lookup goes
;;; ──────────────────────────────────────────────────────────────────

(deftest asks-ollamas-own-api-at-the-server-root-test
  (testing "`capabilities` is not on the OpenAI-compatible surface, so the lookup drops the `/v1` the
           connection's base URL ends in rather than posting to a path that does not exist"
    (with-server! {}
      (fn [seen]
        (ollama.capabilities/reasoning-model? credentials "qwen3:8b")
        (is (= [{:method :post
                 :url    "http://ollama.internal:11434/api/show"
                 :body   "{\"model\":\"qwen3:8b\"}"}]
               (mapv #(select-keys % [:method :url :body]) @seen)))))))

(deftest asks-cloud-at-its-own-address-test
  (testing "Cloud serves the same endpoint, on the host that is not configurable, and takes the key"
    (with-server! {}
      (fn [seen]
        (ollama.capabilities/reasoning-model? cloud-credentials "gpt-oss:20b")
        (is (= "https://ollama.com/api/show" (:url (first @seen))))
        (is (= "Bearer sk-cloud-key" (get-in (first @seen) [:headers "Authorization"])))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Reasoning, per model
;;; ──────────────────────────────────────────────────────────────────

(deftest reasoning-is-answered-per-model-not-per-connection-test
  (testing "one connection, two models: the flag the connect-time probe used to store could only ever
           describe one of them"
    (with-server! {"gpt-oss:20b"          ["completion" "tools" "thinking"]
                   "mistral-large-3:675b" ["completion" "tools" "vision"]}
      (fn [_]
        (is (true? (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b")))
        (is (false? (ollama.capabilities/reasoning-model? credentials "mistral-large-3:675b")))))))

(deftest a-server-that-reports-nothing-reads-as-not-reasoning-test
  (testing "an Ollama too old to report `capabilities` reads as not reasoning — a smaller token budget
           rather than a wrong answer, since `reasoning` is forwarded whenever it appears"
    (with-server! {}
      (fn [_]
        (is (false? (ollama.capabilities/reasoning-model? credentials "qwen3:8b")))))))

(deftest an-unreachable-server-is-not-an-error-test
  (testing "capabilities sharpen a decision the adapter can still make without them, so a server that
           will not answer must not take down the request that asked"
    (with-stub! (fn [_] (throw (ex-info "boom" {})))
      (fn []
        (is (false? (ollama.capabilities/reasoning-model? credentials "qwen3:8b")))
        (testing "and rules no model out, rather than emptying the picker because Ollama was down"
          (is (true? (ollama.capabilities/chat-capable? credentials "qwen3:8b"))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Caching
;;; ──────────────────────────────────────────────────────────────────

(deftest a-model-is-looked-up-once-test
  (testing "the lookup is on the request path, so repeating it per request would be a round-trip per
           message"
    (with-server! {"gpt-oss:20b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (dotimes [_ 3] (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b"))
        (is (= 1 (count @seen)))))))

(deftest a-server-that-will-not-answer-is-asked-once-too-test
  (testing "an unknown answer is cached like any other, so an old server is not asked once per request"
    (with-server! {}
      (fn [seen]
        (dotimes [_ 3] (ollama.capabilities/reasoning-model? credentials "qwen3:8b"))
        (is (= 1 (count @seen)))))))

(deftest repointing-the-connection-retires-what-was-cached-test
  (testing "the same tag on another server is another model"
    (with-server! {"qwen3:8b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (ollama.capabilities/reasoning-model? credentials "qwen3:8b")
        (ollama.capabilities/reasoning-model? (assoc credentials :base-url "http://other:11434/v1") "qwen3:8b")
        (is (= 2 (count @seen))))))
  (testing "but storing what the connect path learned back onto the config it probed with does not —
           that would empty the cache exactly when it was just filled"
    (with-server! {"qwen3:8b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (ollama.capabilities/reasoning-model? credentials "qwen3:8b")
        (ollama.capabilities/reasoning-model? (assoc credentials :probed-model "qwen3:8b") "qwen3:8b")
        (is (= 1 (count @seen)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The cache-only read
;;; ──────────────────────────────────────────────────────────────────

(deftest the-public-setting-never-calls-ollama-on-the-callers-thread-test
  (testing "`llm-metabot-supports-reasoning?` is public, so every client's page load reaches this — it
           has to answer without the caller waiting on the operator's Ollama"
    (with-server! {"gpt-oss:20b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (let [answer (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b")]
          (testing "a cold read answers immediately, from what it has"
            (is (false? answer)))
          (testing "and heals itself, so the next read is right without anyone asking it to"
            (is (true? (tu/poll-until 5000 (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b")))))
          (testing "with the lookup on some other thread — never the one that asked"
            (is (seq @seen))
            (is (not-any? #(= (Thread/currentThread) (::thread %)) @seen))))))))

(deftest a-model-less-reference-asks-for-nothing-test
  (testing "`llm-metabot-provider` can name a connection and no model. There is nothing to look up, and
           nothing would ever be cached for it, so scheduling a lookup would hand a future the same
           nothing to do on every page load."
    (with-server! {"gpt-oss:20b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (dotimes [_ 5] (is (false? (ollama.capabilities/cached-reasoning-model? credentials ""))))
        (Thread/sleep 100)
        (is (empty? @seen))))))

(deftest a-cold-read-starts-one-lookup-however-many-ask-test
  (testing "a burst of page loads against a cold cache must not each start their own lookup"
    (with-server! {"gpt-oss:20b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (dotimes [_ 20] (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b"))
        (is (true? (tu/poll-until 5000 (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b"))))
        (is (= 1 (count @seen)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Chat-capable
;;; ──────────────────────────────────────────────────────────────────

(deftest embedding-models-are-not-chat-models-test
  (with-server! {"nomic-embed-text"  ["embedding"]
                 "llama2-uncensored" ["completion"]
                 "qwen3:8b"          ["completion" "tools" "thinking"]}
    (fn [_]
      (testing "Ollama's OpenAI-compatible catalog lists embedding models alongside chat models and
             marks neither; this is the only thing that tells them apart"
        (is (false? (ollama.capabilities/chat-capable? credentials "nomic-embed-text")))
        (is (true? (ollama.capabilities/chat-capable? credentials "qwen3:8b"))))
      (testing "a completion model that cannot call tools is no use to the agent loop either"
        (is (false? (ollama.capabilities/chat-capable? credentials "llama2-uncensored"))))))
  (testing "and a server that reports nothing rules nothing out — an older Ollama goes on offering
           what it always did"
    (with-server! {}
      (fn [_]
        (is (true? (ollama.capabilities/chat-capable? credentials "nomic-embed-text")))))))
