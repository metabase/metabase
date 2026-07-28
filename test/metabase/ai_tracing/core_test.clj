(ns metabase.ai-tracing.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.ai-tracing.core :as ait]
   [metabase.ai-tracing.log :as ait.log]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel gate-inert-without-binding-test
  (testing "with no capture binding, ops are inert (production safety) but the body still runs"
    (is (false? (ait/capture-active?)))
    (let [ran (atom false)]
      (is (= 42 (ait/with-agent-turn {:ai/profile-id "p"}
                  (reset! ran true)
                  (ait/record! {:ai/x 1})          ; no-op, must not throw
                  42)))
      (is (true? @ran) "body ran"))
    (is (false? (ait/capture-active?)) "binding did not leak")))

(deftest ^:parallel capture-nesting-test
  (testing "capturing builds a nested turn -> llm -> tool tree"
    (let [{:keys [result trace]}
          (ait/capturing
           (ait/with-agent-turn {:ai/profile-id "internal"}
             (ait/with-llm-call {:ai/model "m" :ai/iteration 0}
               (ait/record! {:ai/output-text "hi"})
               (ait/with-tool-call {:ai/tool-name "search"}
                 (ait/record! {:ai/tool-args {:q "x"} :ai/tool-output [{:r 1}]})
                 :tool-done))
             :turn-done))]
      (is (= :turn-done result))
      (is (= 1 (count trace)))
      (let [turn (first trace)
            llm  (first (:children turn))
            tool (first (:children llm))]
        (is (= :turn (:type turn)))
        (is (= "agent.turn" (:name turn)))
        (is (= :llm (:type llm)))
        (is (= "hi" (get-in llm [:attributes :ai/output-text])))
        (is (= :tool (:type tool)))
        (is (= "tool.search" (:name tool)))
        (is (= {:q "x"} (get-in tool [:attributes :ai/tool-args])))))))

(deftest ^:parallel record-test
  (testing "record! merges attrs onto the current span"
    (let [{:keys [trace]}
          (ait/capturing
           (ait/with-llm-call {:ai/model "m"}
             (ait/record! {:ai/output-text "a"})
             (ait/record! {:ai/iteration 2})
             :ok))
          llm (first trace)]
      (is (= "a" (get-in llm [:attributes :ai/output-text])))
      (is (= 2 (get-in llm [:attributes :ai/iteration]))))))

(deftest ^:parallel timing-fields-test
  (testing "finished spans carry a precise duration + wall-clock epoch millis"
    (let [{:keys [trace]} (ait/capturing (ait/with-llm-call {} (Thread/sleep 2) :ok))
          llm (first trace)]
      (is (number? (:duration-ms llm)))
      (is (<= 0 (:duration-ms llm)))
      (is (integer? (:start-epoch-ms llm)))
      (is (integer? (:end-epoch-ms llm)))
      (is (<= (long (:start-epoch-ms llm)) (long (:end-epoch-ms llm))))
      (is (nil? (:start-ns llm)) "internal monotonic marker stripped from finished node"))))

(deftest ^:parallel error-recorded-and-rethrown-test
  (testing "an exception in a span body is recorded as an event, attaches the node, and re-throws"
    (let [sink (atom [])]
      (is (thrown? Exception
                   (binding [ait/*capture* sink ait/*parent* nil ait/*retain-tree* true]
                     (ait/with-llm-call {:ai/model "m"}
                       (throw (ex-info "boom" {}))))))
      (let [llm (first @sink)]
        (is (= :llm (:type llm)))
        (is (= [:error] (mapv :event (:events llm))))))))

(deftest ^:parallel concurrent-tools-nest-correctly-test
  (testing "tools on separate threads (bound-fn conveyance) nest under the right parent"
    (let [{:keys [trace]}
          (ait/capturing
           (ait/with-llm-call {:ai/model "m"}
             (let [fs (mapv (fn [i]
                              (let [f (bound-fn []
                                        (ait/with-tool-call {:ai/tool-name (str "t" i)}
                                          (Thread/sleep 3) i))]
                                (future (f))))
                            (range 4))]
               (mapv deref fs))))
          llm (first trace)]
      (is (= :llm (:type llm)))
      (is (= 4 (count (:children llm))))
      (is (= #{"tool.t0" "tool.t1" "tool.t2" "tool.t3"}
             (set (map :name (:children llm))))))))

;; Not ^:parallel: references the destructive `emit!` (redef'd to a no-op here), which the
;; `validate-deftest` lint disallows in parallel tests regardless of the thread-local redef.
(deftest capture-reducible-test
  (testing "capture-reducible realizes a reducible and returns {:result :trace}"
    ;; redef the sink so the test never writes a trace file
    (mt/with-dynamic-fn-redefs [ait.log/emit! (constantly nil)]
      (let [reducible (reify clojure.lang.IReduceInit
                        (reduce [_ rf init]
                          (ait/with-agent-turn {:ai/profile-id "p"}
                            (-> init (rf {:type :text :text "a"}) (rf {:type :text :text "b"})))))
            {:keys [result trace]} (ait/capture-reducible reducible)]
        (is (= [{:type :text :text "a"} {:type :text :text "b"}] result))
        (is (= 1 (count trace)))
        (is (= "agent.turn" (:name (first trace))))))))

;; Not ^:parallel: redefs the destructive `emit!` to a spy.
(deftest capturing-writes-no-file-test
  (testing "capturing does NOT mint a session id, so emit! gets nil and writes no <id>.jsonl"
    (let [sessions (atom [])]
      (mt/with-dynamic-fn-redefs [ait.log/emit! (fn [_node session-id] (swap! sessions conj session-id) nil)]
        (let [{:keys [trace]} (ait/capturing (ait/with-llm-call {:ai/model "m"} :ok))]
          (is (= 1 (count trace)) "the span still comes back in :trace")
          (is (= [nil] @sessions)
              "emit! received a nil session-id (no file routing); the trace is the return value only"))))))

(deftest ^:parallel checked-session-id-test
  (testing "supplied ids that name a safe file pass through verbatim"
    (is (= "abc-123.def_4" (ait/checked-session-id "abc-123.def_4"))))
  (testing "a nil supplied id mints a fresh uuid"
    (let [id (ait/checked-session-id nil)]
      (is (string? id))
      (is (uuid? (parse-uuid id)))))
  (testing "unsafe ids throw rather than reaching the log-file path (no traversal)"
    (doseq [bad ["../../etc/passwd" ".." "a/b" ".hidden" "has space" ""]]
      (is (thrown? clojure.lang.ExceptionInfo (ait/checked-session-id bad))
          (str "should reject " (pr-str bad))))))

(deftest ^:parallel with-eval-session-rejects-unsafe-id-test
  (testing "with-eval-session validates a caller-supplied id when capture is enabled"
    (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly true)]
      (is (thrown? clojure.lang.ExceptionInfo
                   (ait/with-eval-session "../../pwned" :body)))))
  (testing "with the gate off it stays inert — the body runs, no validation"
    (mt/with-dynamic-fn-redefs [ai-tracing.settings/ai-eval-capture (constantly false)]
      (is (= :body (ait/with-eval-session "../../pwned" :body))))))
