(ns metabase.metabot.tools.runtime-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Fixtures ------------------------------------------------------

(tools.error/defrecoverable runtime-test-no-widget!
  "There is no widget with that id."
  {:payload [:map {:closed true} [:id :int]]}
  [{:keys [id]}]
  {:message  (str "Widget " id " does not exist.")
   :recovery [{:uses #{"search"}        :text "Call `search` to find a widget id."}
              {:uses #{"read_resource"} :text "Or call `read_resource` on the widget collection."}]})

(tools/deftool happy-tool
  "Always works."
  {:name "happy" :args [:map {:closed true} [:n :int]]}
  [{:keys [n]} ctx]
  {:output (str "got " n " in " (:profile-id ctx))})

(tools/deftool recoverable-tool
  "Raises a declared recoverable error."
  {:name "boom" :args [:map {:closed true} [:id :int]]}
  [{:keys [id]} _ctx]
  (runtime-test-no-widget! {:id id}))

(tools/deftool unrecoverable-tool
  "Gives up in a way only the user can act on."
  {:name "give_up" :args [:map {:closed true}]}
  [_args _ctx]
  (tools.error/unrecoverable! ::out-of-cheese {:user-message "Out of cheese. Redo from start."}))

(tools/deftool silent-unrecoverable-tool
  "Gives up without a user-facing message."
  {:name "give_up_quietly" :args [:map {:closed true}]}
  [_args _ctx]
  (tools.error/unrecoverable! ::no-comment))

(tools/deftool crashing-tool
  "Throws an undeclared exception whose message must never reach the model."
  {:name "crash" :args [:map {:closed true}]}
  [_args _ctx]
  (throw (ex-info "SELECT * FROM secrets failed: clojure.lang.ExceptionInfo at line 1"
                  {:password "hunter2"})))

(tools/deftool bad-shape-tool
  "Returns something that is not a handler-result."
  {:name "bad_shape" :args [:map {:closed true}]}
  [_args _ctx]
  {:outputs "a typo for :output"})

(tools/deftool scoped-tool
  "Needs a scope."
  {:name "scoped" :args [:map {:closed true}] :scope "agent:sql:create"}
  [_args _ctx]
  {:output "ok"})

(tools/deftool partial-failure-tool
  "Survives a declared sub-failure and reports it beside the successes."
  {:name "read_many" :args [:map {:closed true} [:ids [:sequential :int]]]}
  [{:keys [ids]} ctx]
  (let [{:keys [ok failed]} (->> (for [id ids]
                                   (assoc (tools/attempt
                                           (tools/with-entity {:kind :card :id id}
                                             (if (even? id)
                                               (str "card " id " contents")
                                               (throw (ex-info "nope" {:status-code 404})))))
                                          :id id))
                                 (group-by #(if (:error %) :failed :ok)))]
    {:output (str/join "\n"
                       (concat (map :value ok)
                               (for [{:keys [error]} failed]
                                 (tools/recoverable-text error (:tool-names ctx)))))}))

(tools/deftool attempted-crash-tool
  "Wraps an undeclared exception in `attempt`, which must not swallow it."
  {:name "attempted_crash" :args [:map {:closed true}]}
  [_args _ctx]
  {:output (str (tools/attempt (throw (ex-info "a real bug: hunter2" {:password "hunter2"}))))})

(tools/deftool memory-tool
  "Reads the memory atom out of ctx."
  {:name "memory" :args [:map {:closed true}]}
  [_args ctx]
  {:output (str "memory: " (pr-str (some-> (:memory-atom ctx) deref)))})

(def ^:private entries
  (tools/entries [#'happy-tool #'recoverable-tool #'unrecoverable-tool #'silent-unrecoverable-tool
                  #'crashing-tool #'bad-shape-tool #'scoped-tool #'memory-tool
                  #'partial-failure-tool #'attempted-crash-tool]))

(def ^:private all-tool-names
  (into #{"search" "read_resource"} (keys entries)))

(defn- ctx
  ([] (ctx {}))
  ([overrides]
   (merge {:profile-id :sql :metabot-id nil :tool-names all-tool-names} overrides)))

(defn- invoke
  ([tool-name args] (invoke (ctx) tool-name args))
  ([ctx tool-name args]
   (binding [scope/*current-user-scope* #{"agent:content:read"}]
     (tools.runtime/invoke entries ctx tool-name args))))

;;; ------------------------------------------------ Success -------------------------------------------------------

(deftest ^:parallel success-is-the-absence-of-an-error-test
  (let [outcome (invoke "happy" {:n 3})]
    (is (= {:output "got 3 in :sql"} outcome))
    (is (nil? (:error outcome)))
    (is (mr/validate ::tools.runtime/outcome outcome))
    (testing "nothing has to look at :structured-output to tell success from failure"
      (is (nil? (:structured-output outcome))))))

(deftest ^:parallel ctx-is-passed-to-the-handler-test
  (is (= {:output "got 1 in :nlq"} (invoke (ctx {:profile-id :nlq}) "happy" {:n 1}))))

(deftest ^:parallel memory-reaches-every-tool-test
  (testing "there is no per-tool memory allowlist: a tool gets the atom when the run has one"
    (is (= {:output "memory: {:state {}}"}
           (invoke (ctx {:memory-atom (atom {:state {}})}) "memory" {}))))
  (testing "and nil outside a conversation-backed run"
    (is (= {:output "memory: nil"} (invoke "memory" {})))))

(deftest ^:parallel stringified-scalars-are-coerced-test
  (testing "models send numbers as JSON strings; the tool's own schema says what to parse"
    (is (= {:output "got 7 in :sql"} (invoke "happy" {:n "7"})))))

;;; ------------------------------------------------ Validation ----------------------------------------------------

(deftest ^:parallel unknown-tool-test
  (let [outcome (invoke "nope" {})]
    (is (= {:class :validation :code :unknown-tool} (:error outcome)))
    (testing "the message lists what this profile does have, so the model can pick one"
      (is (str/starts-with? (:output outcome) "Tool `nope` does not exist. Available tools: "))
      (is (str/includes? (:output outcome) "happy")))))

(deftest ^:parallel invalid-arguments-test
  (let [outcome (invoke "happy" {:m 1})]
    (is (= {:class :validation :code :invalid-arguments} (:error outcome)))
    (is (= "Invalid tool arguments: `m` is not a supported argument. `n` is required."
           (:output outcome)))))

(deftest ^:parallel invalid-json-is-its-own-code-test
  (testing "malformed JSON and schema-invalid JSON are different mistakes with different repairs"
    (let [outcome (invoke "happy" {tools.runtime/raw-arguments-key "{\"n\": "})]
      (is (= {:class :validation :code :invalid-json} (:error outcome)))
      (is (= (str "Invalid tool arguments: the arguments were not valid JSON. "
                  "Send the call again as a JSON object.")
             (:output outcome)))
      (testing "and the model's own malformed output is not quoted back at it"
        (is (not (str/includes? (:output outcome) "{\"n\":")))))))

;;; ------------------------------------------------ Recoverable ---------------------------------------------------

(deftest ^:parallel recoverable-renders-message-then-steps-test
  (let [outcome (invoke "boom" {:id 9})]
    (is (= {:class :recoverable :code ::runtime-test-no-widget} (:error outcome)))
    (is (= ["Widget 9 does not exist."
            "Call `search` to find a widget id."
            "Or call `read_resource` on the widget collection."]
           (str/split-lines (:output outcome))))
    (is (mr/validate ::tools.runtime/outcome outcome))))

(deftest ^:parallel recovery-steps-are-filtered-by-profile-test
  (testing "a step naming a tool this turn does not have is dropped, not rewritten"
    (is (= ["Widget 9 does not exist."
            "Call `search` to find a widget id."]
           (str/split-lines
            (:output (invoke (ctx {:tool-names #{"boom" "search"}}) "boom" {:id 9}))))))
  (testing "and with neither tool only the message survives"
    (is (= ["Widget 9 does not exist."]
           (str/split-lines
            (:output (invoke (ctx {:tool-names #{"boom"}}) "boom" {:id 9})))))))

;;; ----------------------------------------------- Unrecoverable --------------------------------------------------

(deftest ^:parallel unrecoverable-tells-the-model-only-the-code-test
  (let [outcome (invoke "give_up" {})]
    (is (= "This call failed and the user was shown the error (:metabase.metabot.tools.runtime-test/out-of-cheese). Don't retry it."
           (:output outcome)))
    (testing "the user-facing message rides on :error and never becomes :output"
      (is (= {:class        :unrecoverable
              :code         ::out-of-cheese
              :user-message "Out of cheese. Redo from start."}
             (:error outcome)))
      (is (not (str/includes? (:output outcome) "Out of cheese"))))))

(deftest ^:parallel unrecoverable-without-a-user-message-test
  (testing "no :user-message means the frontend shows its generic error; nothing is invented here"
    (is (= {:class :unrecoverable :code ::no-comment}
           (:error (invoke "give_up_quietly" {}))))))

(deftest ^:parallel an-undeclared-exception-is-unrecoverable-and-leaks-nothing-test
  (let [outcome (invoke "crash" {})]
    (is (= {:class :unrecoverable :code :internal} (:error outcome)))
    (is (= "This call failed and the user was shown the error (:internal). Don't retry it."
           (:output outcome)))
    (testing "neither the exception message nor its ex-data reaches the model"
      (doseq [secret ["SELECT" "secrets" "clojure.lang" "hunter2"]]
        (is (not (str/includes? (:output outcome) secret))
            (str "leaked " secret))))))

(deftest ^:parallel a-wrong-handler-result-is-our-bug-not-the-models-test
  (is (= {:class :unrecoverable :code :internal} (:error (invoke "bad_shape" {})))))

(deftest ^:parallel scope-denial-is-unrecoverable-test
  (testing "the agent cannot acquire a scope, so there is no alternative path to offer it"
    (let [outcome (invoke "scoped" {})]
      (is (=? {:class :unrecoverable :code :scope-denied} (:error outcome)))
      (testing "and the user is told which tool to ask for"
        (is (str/includes? (get-in outcome [:error :user-message]) "scoped")))))
  (testing "a satisfied scope runs the tool"
    (is (= {:output "ok"}
           (binding [scope/*current-user-scope* #{"agent:sql:*"}]
             (tools.runtime/invoke entries (ctx) "scoped" {}))))))

(deftest ^:parallel invoke-never-throws-test
  (testing "every caller has to pair a tool_use with a tool_result, so nothing escapes"
    (doseq [[tool-name args] [["happy" {:n 1}] ["happy" {}] ["nope" {}] ["boom" {:id 1}]
                              ["crash" {}] ["bad_shape" {}] ["give_up" {}] ["scoped" {}]
                              ["happy" nil] ["happy" "not even a map"]]]
      (testing (str tool-name " " (pr-str args))
        (let [outcome (invoke tool-name args)]
          (is (mr/validate ::tools.runtime/outcome outcome)
              (pr-str outcome)))))))

;;; --------------------------------------------- Partial failure --------------------------------------------------

(deftest ^:parallel an-attempted-failure-is-a-successful-call-test
  (testing "a tool that decided to survive a sub-failure reports it and the call still succeeds"
    (let [outcome (invoke "read_many" {:ids [2 3 4]})]
      (is (nil? (:error outcome)))
      (is (= ["card 2 contents"
              "card 4 contents"
              "Card 3 was not found. It may not exist, or you may not have access to it."
              "Call `search` to find the entity you want and use an id from the results."]
             (str/split-lines (:output outcome))))))
  (testing "the captured error reads identically to one that ended the call, so the agent cannot
           tell the difference from the text"
    (let [whole-call (:output (invoke (ctx {:tool-names #{"boom" "search"}}) "boom" {:id 9}))
          captured   (:output (invoke (ctx {:tool-names #{"read_many" "search"}}) "read_many" {:ids [3]}))]
      (is (= 2 (count (str/split-lines whole-call))))
      (is (= 2 (count (str/split-lines captured))))
      (testing "and both drop the step the profile cannot act on"
        (is (not (str/includes? captured "read_resource")))))))

(deftest ^:parallel attempt-does-not-swallow-an-undeclared-exception-test
  (testing "wrapping a bug in `attempt` does not turn it into a half-answer the model reports as fact"
    (let [outcome (invoke "attempted_crash" {})]
      (is (= {:class :unrecoverable :code :internal} (:error outcome)))
      (doseq [secret ["hunter2" "a real bug"]]
        (is (not (str/includes? (:output outcome) secret))
            (str "leaked " secret))))))

;;; ------------------------------------------------- render -------------------------------------------------------

(deftest ^:parallel render-rejects-unauthored-text-test
  (testing "the dev/test assertions are what make the text rule more than a convention"
    (doseq [[label message] {"a stack-trace frame" "Failed:\n\tat clojure.core$foo.invoke(core.clj:1)"
                             "#error printing"     "Failed: #error {:cause \"boom\"}"
                             "a class name"        "Failed: clojure.lang.ExceptionInfo"
                             "an ANSI escape"      "Failed: \u001b[31mred\u001b[0m"}]
      (testing label
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"may only carry authored text"
             (tools.runtime/render {:class :validation :code :invalid-arguments :message message}
                                   all-tool-names)))))))

(deftest ^:parallel render-rejects-a-message-that-names-a-tool-test
  (testing "the runtime can drop a step but not a message, so a message must not name a tool"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Only recovery steps name tools"
         (tools.runtime/render {:class    :recoverable
                                :code     ::x
                                :message  "Call `search` instead."
                                :recovery []}
                               all-tool-names)))))

(deftest ^:parallel render-rejects-a-step-that-hides-its-tool-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo #"without declaring it in :uses"
       (tools.runtime/render {:class    :recoverable
                              :code     ::x
                              :message  "Nope."
                              :recovery [{:uses #{} :text "Call `search`."}]}
                             all-tool-names))))

(deftest ^:parallel render-caps-the-output-test
  (let [long-message (apply str (repeat 5000 "x"))
        outcome      (tools.runtime/render {:class :validation :code :invalid-arguments
                                            :message long-message}
                                           all-tool-names)]
    (is (= 4000 (count (:output outcome))))))

(deftest ^:parallel runtime-codes-are-declared-test
  (testing "the agent loop and the adapters branch on these, so the list is shared rather than
           re-spelled in each place"
    (is (= {:unknown-tool      :validation
            :invalid-json      :validation
            :invalid-arguments :validation
            :scope-denied      :unrecoverable
            :internal          :unrecoverable}
           tools.runtime/runtime-codes))
    (testing "and every one of them is reachable through invoke"
      (is (= #{:unknown-tool :invalid-json :invalid-arguments :scope-denied :internal}
             (set (keep #(get-in (invoke (first %) (second %)) [:error :code])
                        [["nope" {}]
                         ["happy" {tools.runtime/raw-arguments-key "{"}]
                         ["happy" {:m 1}]
                         ["scoped" {}]
                         ["crash" {}]])))))))
