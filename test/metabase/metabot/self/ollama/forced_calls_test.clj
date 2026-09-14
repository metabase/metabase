(ns metabase.metabot.self.ollama.forced-calls-test
  "The decision table for forcing a tool call on Ollama.

  Covered through the adapter too, but pinned here as well: this is the seam the adapter hands its one
  deployment fact across, and every wrong answer in the table is a silent failure rather than an
  error — a missing grammar means structured output that works until it does not, and a grammar where
  none was asked for means a model that can no longer answer in prose."
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.ollama.forced-calls :as forced]))

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
  (testing "Cloud can only ask for structured output"
    (is (= {:mode :structured :mechanism :instruction}
           (decision {:schema schema} true))))
  (testing "and can do nothing at all about a forced call over real tools — the tools and the
           `tool_choice` naming them are already there, and the agent loop handles a turn that answers
           in text, so an extra instruction would add nothing"
    (is (= {:mode :tool-union :mechanism :none}
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
              {:role "user" :content forced/cloud-instruction}]
             (:input opts)))
      (is (= schema (:schema opts)) "the tool the shared builder mints from it is all Cloud has")
      (is (nil? (:response_format (forced/body-for plan {})))
          "and a grammar Cloud discards is not sent")))
  (testing "an unplanned request is passed through untouched, both ways"
    (is (= {:tools tools :input []} (forced/opts-for nil {:tools tools :input []})))
    (is (= {:tool_choice "auto"} (forced/body-for nil {:tool_choice "auto"})))))

(deftest ^:parallel read-back-only-where-something-was-constrained-test
  (testing "only a grammar puts its answer on the wrong channel, so only a grammar needs moving back"
    (is (some? (forced/read-back-xf (forced/plan {:schema schema} false))))
    (is (some? (forced/read-back-xf (forced/plan {:tools tools :tool_choice "required"} false))))
    (is (nil? (forced/read-back-xf (forced/plan {:schema schema} true)))
        "Cloud's tool call arrives the ordinary way and must not be touched")
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
