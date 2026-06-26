(ns metabase.ai-tracing.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.ai-tracing.core :as ait]
   [metabase.ai-tracing.export :as ait.export]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel gate-inert-without-binding-test
  (testing "with no capture binding, ops are inert (production safety) but the body still runs"
    (is (false? (ait/capture-active?)))
    (let [ran (atom false)]
      (is (= 42 (ait/with-agent-turn {:ai/profile-id "p"}
                  (reset! ran true)
                  (ait/record! {:ai/x 1})          ; no-op, must not throw
                  (ait/event! {:event :note})       ; no-op, must not throw
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

(deftest ^:parallel record-and-event-test
  (testing "record! merges attrs and event! appends events onto the current span"
    (let [{:keys [trace]}
          (ait/capturing
           (ait/with-llm-call {:ai/model "m"}
             (ait/record! {:ai/output-text "a"})
             (ait/record! {:ai/iteration 2})
             (ait/event! {:event :note :msg "hello"})
             :ok))
          llm (first trace)]
      (is (= "a" (get-in llm [:attributes :ai/output-text])))
      (is (= 2 (get-in llm [:attributes :ai/iteration])))
      (is (= [{:event :note :msg "hello"}] (:events llm))))))

(deftest ^:parallel timing-fields-test
  (testing "finished spans carry duration + wall-clock epoch nanos for OTLP replay"
    (let [{:keys [trace]} (ait/capturing (ait/with-llm-call {} (Thread/sleep 2) :ok))
          llm (first trace)]
      (is (number? (:duration-ms llm)))
      (is (<= 0 (:duration-ms llm)))
      (is (integer? (:start-epoch-nanos llm)))
      (is (integer? (:end-epoch-nanos llm)))
      (is (<= (long (:start-epoch-nanos llm)) (long (:end-epoch-nanos llm))))
      (is (nil? (:start-ns llm)) "internal monotonic marker stripped from finished node"))))

(deftest ^:parallel error-recorded-and-rethrown-test
  (testing "an exception in a span body is recorded as an event, attaches the node, and re-throws"
    (let [sink (atom [])]
      (is (thrown? Exception
                   (binding [ait/*capture* sink ait/*parent* nil]
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

(deftest capture-reducible-test
  (testing "capture-reducible realizes a reducible and returns {:result :trace}"
    ;; redef export so the test never ships to a configured OTLP endpoint
    (mt/with-dynamic-fn-redefs [ait.export/export-trace! (constantly nil)]
      (let [reducible (reify clojure.lang.IReduceInit
                        (reduce [_ rf init]
                          (ait/with-agent-turn {:ai/profile-id "p"}
                            (-> init (rf {:type :text :text "a"}) (rf {:type :text :text "b"})))))
            {:keys [result trace]} (ait/capture-reducible reducible)]
        (is (= [{:type :text :text "a"} {:type :text :text "b"}] result))
        (is (= 1 (count trace)))
        (is (= "agent.turn" (:name (first trace))))))))
