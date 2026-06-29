(ns metabase.ai-tracing.log-test
  (:require
   [clojure.test :refer [deftest is testing]]
   ;; needed to install a recording logger factory for the MDC-routing probe; no util.log equivalent
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging.impl]
   [metabase.ai-tracing.core :as ait]
   [metabase.ai-tracing.log :as ait.log]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture])
  (:import
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(defn- entries
  "Parse captured `metabase.ai-tracing.log` messages (raw JSONL) into maps with string keys."
  [messages-fn]
  (mapv (comp json/decode :message) (messages-fn)))

(deftest ^:parallel node->entry-shape-test
  (testing "node->entry serializes a finished node + session into the JSONL map (string keys after encode)"
    (let [node {:type :llm :name "llm.call" :id "n1" :parent-id "p0"
                :attributes {:ai/model "claude" :ai/output-text "hi"}
                :events [{:event :note}]
                :duration-ms 12.5 :start-epoch-nanos 1000 :end-epoch-nanos 2000}
          e    (ait.log/node->entry node "sess-1")]
      (is (= {:session "sess-1" :id "n1" :parent "p0" :type :llm :name "llm.call"
              :start-ns 1000 :end-ns 2000 :dur-ms 12.5
              :attributes {:ai/model "claude" :ai/output-text "hi"}
              :events [{:event :note}]}
             e))
      (testing "round-trips through JSON cleanly"
        (let [j (json/decode (json/encode e))]
          (is (= "sess-1" (get j "session")))
          (is (= "llm" (get j "type")))
          (is (= "claude" (get-in j ["attributes" "ai/model"]))))))))

(deftest one-entry-per-span-test
  (testing "each finished span streams exactly one JSONL line, carrying the session id in the payload"
    (log.capture/with-log-messages-for-level [messages [metabase.ai-tracing.log :info]]
      (ait/capturing
       (ait/with-agent-turn {:ai/profile-id "p"}
         (ait/with-llm-call {:ai/model "m"}
           (ait/with-tool-call {:ai/tool-name "search"} :ok))))
      (let [es (entries messages)]
        (is (= 3 (count es)) "one line per span (turn, llm, tool)")
        (is (= #{"agent.turn" "llm.call" "tool.search"} (set (map #(get % "name") es))))
        (is (= 1 (count (distinct (map #(get % "session") es)))) "all share one session")
        (is (every? #(get % "session") es))))))

(deftest nesting-parent-chain-test
  (testing "parent ids chain turn -> llm -> tool; root has no parent"
    (log.capture/with-log-messages-for-level [messages [metabase.ai-tracing.log :info]]
      (ait/capturing
       (ait/with-agent-turn {}
         (ait/with-llm-call {}
           (ait/with-tool-call {:ai/tool-name "t"} :ok))))
      (let [by-name (into {} (map (juxt #(get % "name") identity)) (entries messages))
            turn    (by-name "agent.turn")
            llm     (by-name "llm.call")
            tool    (by-name "tool.t")]
        (is (nil? (get turn "parent")))
        (is (= (get turn "id") (get llm "parent")))
        (is (= (get llm "id") (get tool "parent")))))))

(deftest session-mint-vs-supplied-test
  (mt/with-dynamic-fn-redefs [ait/eval-capture-enabled? (constantly true)]
    (testing "with-eval-session supplies the session id verbatim"
      (log.capture/with-log-messages-for-level [messages [metabase.ai-tracing.log :info]]
        (ait/with-eval-session "supplied-sid"
          (ait/with-llm-call {} :ok))
        (is (= ["supplied-sid"] (distinct (map #(get % "session") (entries messages)))))))
    (testing "with-eval-session mints a fresh uuid when none supplied"
      (log.capture/with-log-messages-for-level [messages [metabase.ai-tracing.log :info]]
        (ait/with-eval-session nil
          (ait/with-llm-call {} :ok))
        (let [sid (get (first (entries messages)) "session")]
          (is (string? sid))
          (is (not= "supplied-sid" sid)))))))

(deftest session-inheritance-test
  (testing "a nested with-eval-session inherits the outer session (no re-mint)"
    (mt/with-dynamic-fn-redefs [ait/eval-capture-enabled? (constantly true)]
      (log.capture/with-log-messages-for-level [messages [metabase.ai-tracing.log :info]]
        (ait/with-eval-session "outer"
          (ait/with-agent-turn {}
            (ait/with-eval-session "inner-should-be-ignored"
              (ait/with-llm-call {} :ok))))
        (is (= ["outer"] (distinct (map #(get % "session") (entries messages)))))))))

(deftest inert-when-disabled-test
  (testing "with-eval-session emits nothing when capture is disabled"
    (mt/with-dynamic-fn-redefs [ait/eval-capture-enabled? (constantly false)]
      (log.capture/with-log-messages-for-level [messages [metabase.ai-tracing.log :info]]
        (is (= :ok (ait/with-eval-session nil (ait/with-llm-call {} :ok))))
        (is (= [] (entries messages)))))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn- recording-logger-factory
  "A tools.logging factory that records the Log4j2 ThreadContext present at each write."
  [sink]
  (reify clojure.tools.logging.impl/LoggerFactory
    (name [_] "recording")
    (get-logger [_ _logger-ns]
      (reify clojure.tools.logging.impl/Logger
        (enabled? [_ _level] true)
        (write! [_ _level _throwable message]
          (swap! sink conj {:mdc     (into {} (ThreadContext/getImmutableContext))
                            :message message}))))))

(deftest mdc-routing-key-test
  (testing "emit! sets mb-eval-session-id in the ThreadContext at log time (drives RoutingAppender)"
    (let [sink (atom [])]
      (binding [clojure.tools.logging/*logger-factory* (recording-logger-factory sink)]
        (ait.log/emit! {:type :llm :name "llm.call" :id "n" :parent-id nil
                        :attributes {} :events [] :duration-ms 1.0
                        :start-epoch-nanos 1 :end-epoch-nanos 2}
                       "route-me"))
      (is (= 1 (count @sink)))
      (is (= "route-me" (get-in (first @sink) [:mdc "mb-eval-session-id"]))
          "the routing key is set on the logging thread")
      (is (= "route-me" (get (json/decode (:message (first @sink))) "session"))))))
