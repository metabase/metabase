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

(defn- tool
  "A one-off `Tool` with `declared` and a body of `f`, for the runtime to drive."
  [declared f]
  (reify tools/Tool
    (declaration [_] declared)
    (handle [_ args ctx] (f args ctx))))

(def ^:private happy-tool
  (tool {:name "happy" :description "Always works."
         :args [:map {:closed true} [:n :int]]}
        (fn [{:keys [n]} ctx] {:output (str "got " n " in " (:profile-id ctx))})))

(def ^:private recoverable-tool
  (tool {:name "boom" :description "Raises a declared recoverable error."
         :args [:map {:closed true} [:id :int]]}
        (fn [{:keys [id]} _] (runtime-test-no-widget! {:id id}))))

(def ^:private unrecoverable-tool
  (tool {:name "give_up" :description "Gives up in a way only the user can act on."
         :args [:map {:closed true}]}
        (fn [_ _] (tools.error/unrecoverable!
                   ::out-of-cheese {:user-message "Out of cheese. Redo from start."}))))

(def ^:private silent-unrecoverable-tool
  (tool {:name "give_up_quietly" :description "Gives up without a user-facing message."
         :args [:map {:closed true}]}
        (fn [_ _] (tools.error/unrecoverable! ::no-comment))))

(def ^:private crashing-tool
  (tool {:name "crash" :description "Throws an undeclared exception."
         :args [:map {:closed true}]}
        (fn [_ _] (throw (ex-info "SELECT * FROM secrets failed: clojure.lang.ExceptionInfo at line 1"
                                  {:password "hunter2"})))))

(def ^:private bad-shape-tool
  (tool {:name "bad_shape" :description "Returns something that is not a result."
         :args [:map {:closed true}]}
        (fn [_ _] {:outputs "a typo for :output"})))

(def ^:private scoped-tool
  (tool {:name "scoped" :description "Needs a scope."
         :args [:map {:closed true}] :scope "agent:sql:create"}
        (fn [_ _] {:output "ok"})))

(def ^:private memory-tool
  (tool {:name "memory" :description "Reads the memory atom out of ctx."
         :args [:map {:closed true}]}
        (fn [_ ctx] {:output (str "memory: " (pr-str (some-> (:memory-atom ctx) deref)))})))

(def ^:private multi-item-tool
  "A single-card tool that can also take several. The runtime never asks which it is."
  (reify
    tools/Tool
    (declaration [_] {:name "read_many" :description "Reads one card."
                      :args [:map {:closed true} [:id :int]]})
    (handle [_ {:keys [id]} _ctx]
      (tools/with-entity {:kind :card :id id}
        (if (even? id)
          {:output (str "card " id " contents")}
          (throw (ex-info "nope" {:status-code 404})))))
    tools/BatchedTool
    (batched-declaration [_ declared]
      (-> declared
          (assoc :description "Reads several cards.")
          (assoc :args [:map {:closed true} [:ids [:sequential {:min 1} :int]]])))
    (batched-args [_ {:keys [ids]}] (mapv (fn [id] {:id id}) ids))
    (around-batch [_ _item-args _ctx run] (run))
    (compose [_ entries _ctx] (tools/concatenated entries))))

(def ^:private entries
  (tools/entries [happy-tool recoverable-tool unrecoverable-tool silent-unrecoverable-tool
                  crashing-tool bad-shape-tool scoped-tool memory-tool multi-item-tool]))

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

;;; --------------------------------------------- Multiple items ---------------------------------------------------

(deftest ^:parallel the-runtime-does-not-branch-test
  (testing "it calls tools.core/call; one item or several is the tool's business"
    (let [outcome (invoke "read_many" {:ids [2 3 4]})]
      (is (nil? (:error outcome)) "a partial failure is not a failed call")
      (is (= ["card 2 contents"
              "Card 3 was not found. It may not exist, or you may not have access to it."
              "Call `search` to find the entity you want and use an id from the results."
              "card 4 contents"]
             (str/split-lines (:output outcome))))
      (is (mr/validate ::tools.runtime/outcome outcome)))))

(deftest ^:parallel the-batched-declaration-is-what-the-model-sees-test
  (testing "arguments are validated against the shape the tool was offered in"
    (is (= {:class :validation :code :invalid-arguments}
           (:error (invoke "read_many" {:id 2})))
        "the single form's args are not what this tool publishes")))

(deftest ^:parallel item-failures-are-profile-filtered-test
  (testing "the same step filtering as a failed call, in the same place"
    (is (= ["card 2 contents"
            "Card 3 was not found. It may not exist, or you may not have access to it."]
           (str/split-lines
            (:output (invoke (ctx {:tool-names #{"read_many"}}) "read_many" {:ids [2 3]})))))))

(deftest ^:parallel everything-failed-is-still-a-success-test
  (testing "OPEN QUESTION — nothing was delivered, yet the call succeeds and its whole output is
           failure text. Arguably it should fail, but as which error? There is no code for \"your
           five items were five different kinds of missing\", and collapsing them loses the
           attribution the agent needs to retry."
    (let [outcome (invoke "read_many" {:ids [3]})]
      (is (nil? (:error outcome)))
      (is (= ["Card 3 was not found. It may not exist, or you may not have access to it."
              "Call `search` to find the entity you want and use an id from the results."]
             (str/split-lines (:output outcome)))))))

(deftest ^:parallel a-renderable-output-is-rendered-at-the-boundary-test
  (testing "a tool may return a non-string renderable; this consumer wants a string and renders it"
    (let [tool    (tool {:name "lines" :description "Returns a renderable."
                         :args [:map {:closed true}]}
                        (fn [_ _] {:output (reify tools/Renderable
                                             (render-text [_] "line one\nline two"))}))
          outcome (binding [scope/*current-user-scope* #{"*"}]
                    (tools.runtime/invoke (tools/entries [tool])
                                          (ctx {:tool-names #{"lines"}})
                                          "lines" {}))]
      (is (= {:output "line one\nline two"} outcome))
      (is (string? (:output outcome))))))

(defn- capped-tool
  "A batched-shaped tool whose item cap lives in its `:args`, with `opts` on the `:sequential`
  entry."
  [opts]
  (tool {:name "capped" :description "Takes at most 5."
         :args [:map {:closed true}
                [:uris [:sequential (merge {:min 1 :max 5} opts) :string]]]}
        (fn [_ _] {:output "ok"})))

(defn- over-the-cap
  [tool]
  (binding [scope/*current-user-scope* #{"*"}]
    (tools.runtime/invoke (tools/entries [tool])
                          (ctx {:tool-names #{"capped"}})
                          "capped" {:uris ["a" "b" "c" "d" "e" "f"]})))

(deftest ^:parallel an-item-limit-is-a-schema-fact-test
  (testing "an item cap belongs in `:args`, so the runtime rejects the call before the tool runs
           and the model is told how to repair it"
    (let [outcome (over-the-cap (capped-tool nil))]
      (is (= "Invalid tool arguments: `uris` should have at most 5 elements; received an array."
             (:output outcome)))
      (is (= {:class :validation :code :invalid-arguments} (:error outcome)))))
  (testing "the generated sentence is accurate but says nothing about what to do instead, so a tool
           with teaching to do writes its own with `:error/message`. This is what resolved the open
           question the branch recorded here: `read_resource` had a hand-written count check whose
           text was better than the generated one, and this is where that text now lives."
    (let [outcome (over-the-cap (capped-tool {:error/message "must be an array of 1 to 5 URIs"}))]
      (is (= "Invalid tool arguments: `uris` must be an array of 1 to 5 URIs; received an array."
             (:output outcome)))
      (is (= {:class :validation :code :invalid-arguments} (:error outcome))))))

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
