(ns metabase.metabot.self.ollama.forced-calls-test
  "The decision table for forcing a tool call on Ollama.

  Covered through the adapter too, but pinned here as well: this is the seam the adapter hands its one
  deployment fact across, and every wrong answer in the table is a silent failure rather than an
  error — a missing grammar means structured output that works until it does not, and a grammar where
  none was asked for means a model that can no longer answer in prose."
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.ollama.forced-calls :as forced]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]))

(set! *warn-on-reflection* true)

(def ^:private tools
  [{:tool-name "search_facts"
    :doc       "Search for facts."
    :schema    [:=> [:cat [:map [:question :string]]] :any]
    :fn        identity}
   {:tool-name "record_table_name"
    :doc       "Record a table name."
    :schema    [:=> [:cat [:map [:table_name :string]]] :any]
    :fn        identity}])

(def ^:private schema {:type "object" :properties {:title {:type "string"}} :required ["title"]})

(defn- decision [opts cloud?]
  (select-keys (forced/plan opts cloud?) [:mode :mechanism]))

(deftest ^:parallel plan-decision-table-test
  (testing "self-hosted structured output is held to a grammar"
    (is (= {:mode :structured :mechanism :grammar}
           (decision {:schema schema} false))))
  (testing "and so is a forced call over the caller's own tools"
    (is (= {:mode :tool-union :mechanism :grammar}
           (decision {:tools tools :tool_choice "required"} false))))
  (testing "Cloud can only ask, for structured output"
    (is (= {:mode :structured :mechanism :instruction}
           (decision {:schema schema} true))))
  (testing "and for a call over the caller's own tools too — `tool_choice` is discarded on the way
           out, so without the asking a profile that renders nothing but tool results (`:sql`) would
           take a prose answer it cannot show"
    (is (= {:mode :tool-union :mechanism :instruction}
           (decision {:tools tools :tool_choice "required"} true))))
  (testing "an `auto` turn is never planned for: a grammar would silently promote it to `required`,
           and the model could then never answer in prose again"
    (is (nil? (forced/plan {:tools tools} false)))
    (is (nil? (forced/plan {:tools tools :tool_choice "auto"} false)))
    (is (nil? (forced/plan {:tools tools :tool_choice "auto"} true))))
  (testing "`required` with no tools has nothing to choose among, so no mechanism can compel a call —
           but it is still a plan, because the token budget has to cover what was asked for"
    (is (= {:mode :tool-union :mechanism :none}
           (decision {:tool_choice "required"} false)))
    (is (nil? (:schema (forced/plan {:tool_choice "required"} false)))
        "and emphatically no grammar: a union over no tools could not be satisfied")))

(deftest ^:parallel every-forced-request-is-planned-for-test
  (testing "the token floor reads `(some? plan)`, so a plan has to exist wherever a call was asked for
           — including the cases nothing can enforce, which would otherwise lose their budget"
    (are [opts cloud?] (some? (forced/plan opts cloud?))
      {:schema schema}                       false
      {:schema schema}                       true
      {:tools tools :tool_choice "required"} false
      {:tools tools :tool_choice "required"} true
      {:tool_choice "required"}              false))
  (testing "and nowhere else"
    (is (nil? (forced/plan {:tools tools} false)))
    (is (nil? (forced/plan {} false)))))

(deftest ^:parallel grammar-shapes-test
  (testing "structured output constrains the decoder with the caller's schema, untouched"
    (is (= schema (:schema (forced/plan {:schema schema} false)))))
  (testing "a forced call becomes one `anyOf` arm per tool, each pinning the name to that tool so the
           only text satisfying the grammar is a call to one of them"
    (let [arms (get-in (forced/plan {:tools tools :tool_choice "required"} false) [:schema :anyOf])]
      (is (= [["search_facts"] ["record_table_name"]]
             (mapv #(get-in % [:properties :name :enum]) arms)))
      (is (every? #(= ["name" "parameters"] (:required %)) arms))
      (is (= [:question :table_name]
             (mapv #(first (keys (get-in % [:properties :parameters :properties]))) arms))
          "each arm carries that tool's own parameters, so arguments are constrained too")))
  (testing "Cloud is given no schema to constrain with, because it would discard it"
    (is (nil? (:schema (forced/plan {:schema schema} true))))))

(deftest ^:parallel opts-and-body-follow-the-plan-test
  (testing "under a grammar the shared builder's synthetic tool and `tool_choice` are redundant, and
           its real-tool handling would hand the model tools this request never had"
    (let [plan (forced/plan {:schema schema} false)
          opts (forced/opts-for plan {:schema schema :tools tools :input []})]
      (is (nil? (:schema opts)))
      (is (nil? (:tools opts)))
      (is (= "json_schema" (get-in (forced/body-for plan {}) [:response_format :type])))
      (is (nil? (:tool_choice (forced/body-for plan {:tool_choice "auto"})))
          "a body saying \"auto\" while being grammar-forced reads as the opposite of what it does")))
  (testing "a forced call over real tools keeps them — the template still renders their definitions"
    (let [plan (forced/plan {:tools tools :tool_choice "required"} false)]
      (is (= tools (:tools (forced/opts-for plan {:tools tools :tool_choice "required"}))))))
  (testing "Cloud asks in words, last, where an instruction carries furthest"
    (let [plan (forced/plan {:schema schema} true)
          opts (forced/opts-for plan {:schema schema :input [{:role "user" :content "hi"}]})]
      (is (= [{:role "user" :content "hi"}
              {:role "user" :content (forced/cloud-instruction [chat-completions/structured-output-tool-name])}]
             (:input opts)))
      (is (= schema (:schema opts)) "the tool the shared builder mints from it is all Cloud has")
      (is (nil? (:response_format (forced/body-for plan {})))
          "and a grammar Cloud discards is not sent")))
  (testing "a Cloud forced call names the caller's own tools, since naming them is all the
           instruction can do that the discarded `tool_choice` did not already say"
    (let [plan (forced/plan {:tools tools :tool_choice "required"} true)
          opts (forced/opts-for plan {:tools tools :tool_choice "required" :input []})]
      (is (= [{:role "user"
               :content "Answer by calling one of these tools: `search_facts`, `record_table_name`. Do not reply in chat."}]
             (:input opts)))
      (is (= tools (:tools opts)) "and keeps them, because they are what it just named")))
  (testing "an unplanned request is passed through untouched, both ways"
    (is (= {:tools tools :input []} (forced/opts-for nil {:tools tools :input []})))
    (is (= {:tool_choice "auto"} (forced/body-for nil {:tool_choice "auto"})))))

(deftest ^:parallel read-back-only-where-something-was-constrained-test
  (testing "only a grammar puts its answer on the wrong channel, so only a grammar needs moving back"
    (is (some? (forced/read-back-xf (forced/plan {:schema schema} false))))
    (is (some? (forced/read-back-xf (forced/plan {:tools tools :tool_choice "required"} false))))
    (is (nil? (forced/read-back-xf (forced/plan {:schema schema} true)))
        "Cloud's tool call arrives the ordinary way and must not be touched")
    (is (nil? (forced/read-back-xf (forced/plan {:tools tools :tool_choice "required"} true))))
    (is (nil? (forced/read-back-xf nil)))))

(deftest ^:parallel probe-verdict-reads-the-mechanism-that-will-run-test
  (testing "self-hosted reads the content channel, where a grammar puts its answer"
    (is (nil? (forced/probe-verdict false {:message {:content "{\"title\": \"Late orders\"}"}
                                           :finish_reason "stop"})))
    (is (= :not-honored (forced/probe-verdict false {:message {:content "How about \"Late orders\"?"}
                                                     :finish_reason "stop"})))
    (testing "JSON alone is not the contract — the caller reads named fields out of it"
      (is (= :not-honored (forced/probe-verdict false {:message {:content "{\"summary\": \"x\"}"}
                                                       :finish_reason "stop"}))))
    (testing "and being cut off is a different diagnosis from not complying"
      (is (= :truncated (forced/probe-verdict false {:message {:content "{\"title\": \"Late or"}
                                                     :finish_reason "length"})))))
  (testing "Cloud reads the tool-call channel, because that is where its answer arrives"
    (is (nil? (forced/probe-verdict true {:message {:tool_calls [{:function {:name "structured_output"
                                                                             :arguments "{\"title\": \"Late orders\"}"}}]}
                                          :finish_reason "tool_calls"})))
    (is (= :not-honored (forced/probe-verdict true {:message {:content "Late orders"}
                                                    :finish_reason "stop"}))))
  (testing "each deployment reads only its own channel: an answer on the other one is not compliance,
           because it is not what the runtime will look at"
    (is (= :not-honored (forced/probe-verdict false {:message {:tool_calls [{:function {:arguments "{\"title\": \"x\"}"}}]}
                                                     :finish_reason "tool_calls"})))
    (is (= :not-honored (forced/probe-verdict true {:message {:content "{\"title\": \"x\"}"}
                                                    :finish_reason "stop"})))))

;;; ------------------------------------------- Reading the answer back --------------------------------------------

(defn- content-chunk
  ([content] (content-chunk content nil))
  ([content finish-reason]
   {:choices [(cond-> {:index 0 :delta {:content content}}
                finish-reason (assoc :finish_reason finish-reason))]}))

(defn- finish-chunk [finish-reason]
  {:choices [{:index 0 :delta {} :finish_reason finish-reason}]})

(defn- read-back
  "`chunks` put through the transducer `plan` calls for, as a vector."
  [plan chunks]
  (into [] (forced/read-back-xf plan) chunks))

(defn- tool-calls [chunks]
  (mapcat #(get-in % [:choices 0 :delta :tool_calls]) chunks))

(defn- finish-reasons [chunks]
  (keep #(get-in % [:choices 0 :finish_reason]) chunks))

(def ^:private structured-plan (forced/plan {:schema schema} false))

(def ^:private tool-union-plan (forced/plan {:tools tools :tool_choice "required"} false))

(deftest ^:parallel read-back-moves-the-answer-onto-the-tool-channel-test
  (testing "content is held back and re-emitted as one tool call, so the raw answer is never shown"
    (let [out (read-back structured-plan
                         [(content-chunk "{\"title\": ")
                          (content-chunk "\"Late orders\"}")
                          (finish-chunk "stop")])]
      (is (= [{:name "structured_output" :arguments "{\"title\": \"Late orders\"}"}]
             (map :function (tool-calls out))))
      (is (empty? (keep #(get-in % [:choices 0 :delta :content]) out))
          "no content reaches the channel this transducer exists to keep it off")
      (testing "and `stop` is restated as the tool call it actually was"
        (is (= ["tool_calls"] (finish-reasons out)))))))

(deftest ^:parallel read-back-reads-a-chunk-carrying-both-content-and-finish-reason-test
  (testing (str "an Ollama build older than ollama/ollama#17485 puts the last content fragment and "
                "`finish_reason` in one chunk, so taking the content must not end the chunk's "
                "handling — the finish chunk still has to be emitted.")
    (testing "the trailing fragment still lands in the call, and the finish chunk still closes it"
      (let [out (read-back structured-plan
                           [(content-chunk "{\"title\": ")
                            (content-chunk "\"Late orders\"}" "stop")])]
        (is (= [{:name "structured_output" :arguments "{\"title\": \"Late orders\"}"}]
               (map :function (tool-calls out)))
            "the fragment that shared the finish chunk is not lost")
        (is (= ["tool_calls"] (finish-reasons out)))
        (is (empty? (keep #(get-in % [:choices 0 :delta :content]) out))
            "and the fragment does not also ride out on the content channel")))
    (testing "a truncated answer stays diagnosable as truncation rather than as a broken call"
      (let [out (read-back structured-plan
                           [(content-chunk "{\"title\": \"Late or" "length")])]
        (is (= ["length"] (finish-reasons out))
            "`length` reaches the caller as the diagnosis, not as a parse error over a half-written answer")
        (is (empty? (tool-calls out))
            (str "and no call is minted from the half-written buffer: `:structured`'s name is fixed, so it "
                 "would mint one regardless, and the caller would see `structured-output-invalid` instead "
                 "of the truncation"))
        (is (empty? (keep #(get-in % [:choices 0 :delta :content]) out))
            (str "nor does the fragment ride out as text. Prose goes back on the content channel only "
                 "for a `stop` the grammar failed to shape — on `length` the buffer is a half-written "
                 "call, and half a JSON object is not an answer to show anyone"))))))

(deftest ^:parallel read-back-call-carries-the-message-id-test
  (testing (str "The call goes out before the chunk it was read from, and `:start` is built from the first "
                "chunk carrying a message id — so the call has to carry it, or it opens before its message.")
    (let [out (read-back structured-plan
                         [(assoc (content-chunk "{\"title\": \"x\"}" "stop") :id "chatcmpl-1")])]
      (is (= "chatcmpl-1" (:id (first out)))))))

(deftest ^:parallel read-back-call-carries-the-model-test
  (testing (str "`:start` takes the message's model from the chunk it is built from, which in a one-chunk "
                "answer is the call — so the call has to carry the model, or usage reports none.")
    (let [out (read-back structured-plan
                         [(assoc (content-chunk "{\"title\": \"x\"}" "stop") :id "chatcmpl-1" :model "gpt-oss:20b")])]
      (is (= "gpt-oss:20b" (:model (first out)))))))

(deftest ^:parallel read-back-stops-when-the-consumer-has-had-enough-test
  (testing (str "The call and the finish chunk that closes it come from one input chunk, so the first is "
                "handed downstream while the reduction may already be over — the writer ends it as soon "
                "as the client hangs up.")
    (let [seen (atom [])
          rf   (fn ([acc] acc)
                 ([acc chunk]
                  (swap! seen conj chunk)
                  (reduced acc)))]
      (transduce (forced/read-back-xf structured-plan) rf nil
                 [(content-chunk "{\"title\": \"Late orders\"}" "stop")])
      (is (= 1 (count @seen)) "the finish chunk is not emitted past the end of the reduction")
      (is (= [{:name "structured_output" :arguments "{\"title\": \"Late orders\"}"}]
             (map :function (tool-calls @seen)))
          "and the one chunk that did go is the call"))))

(deftest ^:parallel read-back-mints-no-call-from-a-stream-without-a-finish-chunk-test
  (testing (str "a stream that ends without a finish chunk leaves no `stop` to vouch for the buffer, so "
                "no call is minted from it — `:structured`'s name is fixed, so it would mint one from "
                "half-written JSON and the caller would see `structured-output-invalid`")
    (doseq [[plan fragment] [[structured-plan "{\"title\": \"Late or"]
                             [tool-union-plan "{\"name\": \"search_facts\", \"parame"]]]
      (testing (:mode plan)
        (let [out (read-back plan [(content-chunk fragment)])]
          (is (empty? (tool-calls out)))
          (is (empty? (keep #(get-in % [:choices 0 :delta :content]) out))))))))

(deftest ^:parallel read-back-passes-on-the-chunks-it-holds-content-from-test
  (testing (str "Ollama opens a stream with content rather than OpenAI's empty chunk "
                "(ollama/ollama#17485), so a held content chunk may be the first one carrying the "
                "message `id` — it has to go on, or the minted call precedes `:start`.")
    (doseq [[plan answer] [[structured-plan "{\"title\": \"Late orders\"}"]
                           [tool-union-plan "{\"name\": \"search_facts\", \"parameters\": {\"question\": \"q\"}}"]]]
      (testing (:mode plan)
        (let [chunk (fn [content & [finish-reason]]
                      (assoc (content-chunk content finish-reason) :id "chatcmpl-1" :model "qwen2.5"))
              types (into []
                          (comp (chat-completions/chat-completions->aisdk-chunks-xf) (map :type))
                          (read-back plan [(chunk (subs answer 0 5)) (chunk (subs answer 5))
                                           (chunk "" "stop")]))]
          (is (= :start (first types)))
          (is (= [:tool-input-start :tool-input-delta :tool-input-available]
                 (filterv #{:tool-input-start :tool-input-delta :tool-input-available} types)))
          (is (not-any? #{:text-start :text-delta} types)
              "the held content still stays off the text channel"))))))

(deftest ^:parallel a-union-answer-that-is-not-a-call-is-not-reported-as-one-test
  (testing (str "`:tool-union` reads the tool's name out of the answer, so a model that answers in "
                "prose yields no call. Restating `stop` as `tool_calls` would promise the agent loop "
                "a call and hand it none, and dropping the content would swallow the only answer.")
    (let [out (read-back tool-union-plan
                         [(content-chunk "No tool is needed ")
                          (content-chunk "for that." "stop")])]
      (is (empty? (tool-calls out)))
      (is (= ["stop"] (finish-reasons out))
          "the finish reason stands: nothing was turned into a call")
      (is (= "No tool is needed for that."
             (apply str (keep #(get-in % [:choices 0 :delta :content]) out)))
          "and the answer reaches the caller"))))

(deftest ^:parallel read-back-leaves-an-unconstrained-stream-alone-test
  (testing "without a grammar there is no transducer, so nothing is buffered or rewritten"
    (is (nil? (forced/read-back-xf (forced/plan {:schema schema} true))))
    (is (nil? (forced/read-back-xf nil))))
  (testing "chunks carrying neither content nor a finish reason pass straight through"
    (let [reasoning {:choices [{:index 0 :delta {:reasoning "thinking"}}]}]
      (is (= [reasoning] (read-back structured-plan [reasoning]))))))
