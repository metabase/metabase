(ns metabase.metabot.self.ollama.capabilities-test
  "The lookup that replaced a single reasoning flag on the connection. What matters here is that the
  answer is per *model* — a connection serves as many as the operator has pulled, and Metabot and the
  mini model need not be on the same one."
  (:require
   [clj-http.client :as http]
   [clojure.core.cache :as cache]
   [clojure.test :refer :all]
   [metabase.metabot.self.ollama.capabilities :as ollama.capabilities]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private credentials
  {:base-url "http://ollama.internal:11434/v1"})

(def ^:private cloud-credentials
  {:base-url "https://ollama.com/v1" :api-key "sk-cloud-key"})

(defn- showing
  "Stub `http/request` for `/api/show`, answering from `capabilities-by-model` — a model absent from it
  gets a body with no `capabilities` key, which is what an Ollama too old to report them returns.
  Records every request it saw, and which thread made it."
  ([capabilities-by-model] (showing capabilities-by-model (atom [])))
  ([capabilities-by-model seen]
   (fn [{:keys [body] :as req}]
     ;; the thread, so a test can tell a lookup made on the caller's thread from one handed to a future
     (swap! seen conj (assoc req ::thread (Thread/currentThread)))
     (let [model (:model (json/decode+kw (str body)))]
       {:status 200
        :body   (cond-> {:model model}
                  (contains? capabilities-by-model model)
                  (assoc :capabilities (get capabilities-by-model model)))}))))

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
  (testing "one connection, two models: a single flag on the connection could only ever
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

(deftest a-full-cache-evicts-the-model-read-least-recently-test
  (testing "reads count as use, so the models being asked about are the ones kept"
    (let [threshold @#'ollama.capabilities/cache-threshold
          model     #(str "model-" %)
          cached?   #(cache/has? @@#'ollama.capabilities/capabilities-cache
                                 (#'ollama.capabilities/cache-key credentials (model %)))]
      (with-server! {}
        (fn [_]
          (doseq [i (range threshold)]
            (ollama.capabilities/reasoning-model? credentials (model i)))
          (ollama.capabilities/reasoning-model? credentials (model 0))
          (ollama.capabilities/cached-reasoning-model? credentials (model 1))
          ;; two past the threshold, so without reads counting both 0 and 1 would be evicted
          (ollama.capabilities/reasoning-model? credentials (model threshold))
          (ollama.capabilities/reasoning-model? credentials (model (inc threshold)))
          (testing "the blocking reader's model survives"
            (is (cached? 0)))
          (testing "the cache-only reader's model survives"
            (is (cached? 1)))
          (testing "the oldest models nobody read since are the ones evicted"
            (is (not (cached? 2)))
            (is (not (cached? 3)))))))))

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

(defn- lookup-in-flight?
  "Whether this model's lookup is still running.

  Per model: the in-flight map is process-wide, so any other server's refresh would answer for it."
  [credentials model]
  (contains? @@#'ollama.capabilities/in-flight
             (#'ollama.capabilities/cache-key credentials model)))

(defn- age-lookups-by!
  "Backdate every entry by `ms`, so a test can put it either side of an interval.

  Always relative: `:at` is a `u/start-timer`, a monotonic reading in nanoseconds counted from whenever
  the machine decided to start counting. Nothing can be said about a fixed value of it."
  [ms]
  (swap! @#'ollama.capabilities/capabilities-cache
         (fn [c]
           (reduce (fn [acc [k v]] (cache/miss acc k (update v :at - (* ms 1000000))))
                   c
                   (into {} c)))))

(defn- age-out-lookups!
  "Backdate every entry past the refresh interval, so the next read finds it stale. Emptying the cache
  would not do: that is forgetting, which is the thing under test."
  []
  (age-lookups-by! (inc @#'ollama.capabilities/refresh-after-ms)))

(deftest a-stale-answer-is-served-not-waited-on-test
  (testing (str "an entry's age says when to re-ask, not what to believe. The listing asks about "
                "every model in the catalog, so with an answer already in hand there is nothing to "
                "wait for — serve it and re-ask behind.")
    (ollama.capabilities/clear-cache!)
    (try
      (mt/with-dynamic-fn-redefs [http/request (showing {"gpt-oss:20b" ["completion" "tools" "thinking"]})]
        (is (true? (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b"))))
      (age-out-lookups!)
      (is (true? (#'ollama.capabilities/stale?
                  (cache/lookup @@#'ollama.capabilities/capabilities-cache
                                (#'ollama.capabilities/cache-key credentials "gpt-oss:20b"))))
          "the entry this test serves from has to be stale, or nothing below is exercised")
      (let [attempts (atom 0)]
        (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                   (swap! attempts inc)
                                                   (Thread/sleep 300)
                                                   (throw (ex-info "hang" {})))]
          (testing "the blocking reader answers from what it has, without waiting on the server"
            (let [timer  (u/start-timer)
                  answer (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b")]
              (is (true? answer))
              (is (> 200 (u/since-ms timer)))))
          (testing "and the public setting does too"
            (is (true? (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b"))))
          (testing "once the re-ask has actually failed, the answer still stands — a server that
                   would not answer is not evidence that the model changed"
            (is (tu/poll-until 5000 (and (pos? @attempts)
                                         (not (lookup-in-flight? credentials "gpt-oss:20b")))))
            (is (true? (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b"))))))
      (finally
        (ollama.capabilities/clear-cache!)))))

(deftest a-server-that-never-answered-is-re-asked-sooner-test
  (testing (str "serving the last answer needs there to be one. A first lookup that fails records no "
                "answer at all, so until it is re-asked every model behind that server reads as not "
                "reasoning and runs on the smaller token budget — the shorter interval is how long "
                "that lasts.")
    ;; not written with `with-server!`: the failed entry has to survive into the second stub, and that
    ;; helper empties the cache on the way in
    (ollama.capabilities/clear-cache!)
    (try
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "down" {})))]
        (is (false? (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b"))))
      (testing "just short of the retry interval the failure still stands, and nothing is re-asked"
        ;; ten seconds either side of the interval rather than a millisecond: the wall clock this test
        ;; spends between backdating an entry and reading it counts towards that entry's age
        (age-lookups-by! (- @#'ollama.capabilities/retry-after-ms 10000))
        (let [seen (atom [])]
          (mt/with-dynamic-fn-redefs [http/request (showing {"gpt-oss:20b" ["completion" "tools" "thinking"]} seen)]
            (is (false? (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b")))
            (Thread/sleep 100)
            (is (empty? @seen)))))
      (testing "past it, the recovered server is asked and answers"
        (age-lookups-by! 20000)
        (mt/with-dynamic-fn-redefs [http/request (showing {"gpt-oss:20b" ["completion" "tools" "thinking"]})]
          (is (true? (tu/poll-until 5000 (ollama.capabilities/reasoning-model? credentials "gpt-oss:20b"))))))
      (finally
        (ollama.capabilities/clear-cache!)))))

(deftest an-ollama-that-answers-without-capabilities-is-not-re-asked-sooner-test
  (testing (str "a build too old to report `capabilities` will answer the same way for as long as it "
                "runs, so it keeps the long interval rather than being polled every minute")
    (with-server! {}
      (fn [seen]
        (is (false? (ollama.capabilities/reasoning-model? credentials "qwen3:8b")))
        (is (= 1 (count @seen)))
        (age-lookups-by! (inc @#'ollama.capabilities/retry-after-ms))
        (is (false? (ollama.capabilities/reasoning-model? credentials "qwen3:8b")))
        (Thread/sleep 100)
        (is (= 1 (count @seen)) "still the one lookup")
        (testing "and the long interval does re-ask it"
          (age-lookups-by! @#'ollama.capabilities/refresh-after-ms)
          (is (false? (ollama.capabilities/reasoning-model? credentials "qwen3:8b")))
          (is (tu/poll-until 5000 (= 2 (count @seen)))))))))

(deftest a-cold-read-starts-one-lookup-however-many-ask-test
  (testing "a burst of page loads against a cold cache must not each start their own lookup"
    (with-server! {"gpt-oss:20b" ["completion" "tools" "thinking"]}
      (fn [seen]
        (dotimes [_ 20] (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b"))
        (is (true? (tu/poll-until 5000 (ollama.capabilities/cached-reasoning-model? credentials "gpt-oss:20b"))))
        (is (= 1 (count @seen)))))))

(deftest a-cold-lookup-is-shared-by-every-caller-waiting-on-it-test
  (testing "requests for a model with no entry yet share one lookup rather than each asking the server"
    (let [seen    (atom [])
          handler (showing {"gpt-oss:20b" ["completion" "tools" "thinking"]} seen)]
      (with-stub! (fn [req] (Thread/sleep 200) (handler req))
        (fn []
          (let [answers (tu/repeat-concurrently 10 #(ollama.capabilities/reasoning-model?
                                                     credentials "gpt-oss:20b"))]
            (is (every? true? answers))
            (is (= 1 (count @seen)))))))))

(deftest lookups-in-front-of-the-caller-share-the-concurrency-bound-test
  (testing "two catalog listings at once stay within one bound, not one bound each"
    (let [open    (atom 0)
          peak    (atom 0)
          handler (showing {})
          models  (mapv #(str "model-" %) (range 24))]
      (with-stub! (fn [req]
                    (swap! peak max (swap! open inc))
                    (try
                      (Thread/sleep 50)
                      (handler req)
                      (finally
                        (swap! open dec))))
        (fn []
          (run! deref [(future (ollama.capabilities/chat-capable-ids credentials models))
                       (future (ollama.capabilities/chat-capable-ids credentials (rseq models)))])
          (is (<= @peak @#'ollama.capabilities/lookup-concurrency)))))))

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
