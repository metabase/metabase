(ns metabase.metabot.tools.two-consumers-spike-test
  "SPIKE — one reified tool, two consumers. Delete before merging.

  The question this answers is not \"should Metabot and MCP share tools\" (they should not today:
  their `search` tools have different arguments, modes, projections and pagination). It is whether a
  tool can be *one concept in the codebase* that either surface can consume.

  It can, because everything the two surfaces disagree about is a consumer concern:

  | disagreement | whose problem |
  | --- | --- |
  | `{:output …}` vs `{:content [{:type \"text\"}] …}` | the consumer's; it adapts |
  | plain strings vs late-rendered `message/msg` | neither's — `tools.core/Renderable` |
  | which error class means what on the wire | the consumer's; it maps a ToolError |
  | annotations, extensions, title-fn, capabilities | namespaced in the declaration |
  | ctx shape | the consumer supplies it; only `:tool-names` is the framework's |
  | registry, manifest, nil-stripping, usage logging | the consumer's, and stays there |

  Below: one `GlossaryTool` record, consumed by the real Metabot runtime and by a sketch of an
  MCP-shaped consumer, with no change to the tool. The MCP sketch is ~30 lines and deliberately
  mirrors `metabase.mcp.v2.registry/dispatch-tool-call` rather than reusing it — the point is to show
  what an adapter has to do, not to build one."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.runtime :as tools.runtime]))

(set! *warn-on-reflection* true)

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; A renderable that is not a string — standing in for mcp.v2.message/Message
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(defrecord Lines [lines]
  tools/Renderable
  (render-text [_] (str/join "\n" lines)))

(defn- lines [& ls] (->Lines (vec ls)))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; One tool
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(tools.error/defrecoverable no-such-term!
  "No glossary entry for that term."
  {:payload [:map {:closed true} [:term :string] [:known [:sequential :string]]]}
  [{:keys [term known]}]
  {:message  (str "No glossary entry for " (pr-str term) ".")
   :recovery [{:uses #{"glossary"}
               :text (str "Call `glossary` with no term to list what is defined. Currently: "
                          (str/join ", " known) ".")}]})

(def ^:private glossary-entries
  {"churn"        "A customer who has not ordered in 90 days."
   "active user"  "A user who has run a query in the last 7 days."})

(defrecord GlossaryTool []
  tools/Tool
  (declaration [_]
    {:name        "glossary"
     :description "Look up a business term as this instance's analysts defined it."
     :args        [:map {:closed true} [:term {:optional true} [:maybe :string]]]
     :scope       scope/agent-content-read
     ;; Namespaced, so a consumer reads only what it understands. The Metabot runtime ignores the
     ;; :mcp/* keys; an MCP consumer ignores :metabot/*.
     :metabot/title-fn    (fn [{:keys [term]}] (or term "all terms"))
     :mcp/annotations     {:readOnlyHint true :idempotentHint true}
     :mcp/_meta           {:ui {:visibility ["app"]}}})
  (handle [_ {:keys [term]} _ctx]
    ;; Returns a renderable, not a string. Neither consumer is forced into the other's text model.
    (if term
      (if-let [definition (get glossary-entries term)]
        {:output            (lines (str "<term>" term "</term>") (str "<definition>" definition "</definition>"))
         :structured-output {:term term :definition definition}}
        (no-such-term! {:term term :known (vec (sort (keys glossary-entries)))}))
      {:output (apply lines (for [[t d] (sort glossary-entries)] (str t ": " d)))})))

(def glossary-tool (->GlossaryTool))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; Consumer 2: an MCP-shaped adapter
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(def ^:private jsonrpc-invalid-params -32602)
(def ^:private jsonrpc-internal       -32603)

(defn- mcp-manifest-entry
  "What `tools/list` would publish. Reads the neutral core plus its own namespace, and never sees a
  Metabot key."
  [tool]
  (let [{:keys [name description args] :as declared} (tools/declaration tool)]
    (cond-> {:name            name
             :description      description
             :inputSchema      args
             :securitySchemes  [{:type "oauth2" :scopes [(:scope declared)]}]
             :annotations      (merge {:readOnlyHint false :destructiveHint false :openWorldHint false}
                                      (:mcp/annotations declared))}
      (:mcp/_meta declared) (assoc :_meta (:mcp/_meta declared)))))

(defn- mcp-call
  "What `tools/call` would do: invoke the same tool, render for this wire, and map a ToolError onto
  JSON-RPC. Every class becomes `isError` content — MCP has no turn to end, so `:unrecoverable`
  means \"this call failed and the caller should not retry\" rather than \"stop\"."
  [tool args]
  (try
    (let [{:keys [output structured-output]} (tools/handle tool args {:tool-names #{"glossary"}})]
      (cond-> {:content [{:type "text" :text (tools/render-text output)}]}
        structured-output (assoc :structuredContent structured-output)))
    (catch Throwable e
      (let [{:keys [class message recovery]} (tools.error/classify e)]
        (if (= :unrecoverable class)
          ;; Nothing authored to show, so the generic message — the same judgement
          ;; `common/->mcp-error-content` makes.
          {:content  [{:type "text" :text "Internal error"}]
           :isError  true
           :mcp/code jsonrpc-internal}
          {:content  [{:type "text"
                       :text (tools.error/recoverable-text {:message message :recovery recovery}
                                                           #{"glossary"})}]
           :isError  true
           :mcp/code jsonrpc-invalid-params})))))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; Tests
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(def ^:private entries (tools/entries [glossary-tool]))

(defn- metabot-call [args]
  (binding [scope/*current-user-scope* #{"*"}]
    (tools.runtime/invoke entries
                          {:profile-id :nlq :metabot-id nil :tool-names #{"glossary"}}
                          "glossary" args)))

(deftest ^:parallel the-same-tool-serves-both-consumers-test
  (testing "Metabot gets a string in :output"
    (is (= {:output            "<term>churn</term>\n<definition>A customer who has not ordered in 90 days.</definition>"
            :structured-output {:term "churn" :definition "A customer who has not ordered in 90 days."}}
           (metabot-call {:term "churn"}))))
  (testing "MCP gets content blocks, from the same handle call and the same renderable"
    (is (= {:content           [{:type "text"
                                 :text  "<term>churn</term>\n<definition>A customer who has not ordered in 90 days.</definition>"}]
            :structuredContent {:term "churn" :definition "A customer who has not ordered in 90 days."}}
           (mcp-call glossary-tool {:term "churn"})))))

(deftest ^:parallel a-declared-error-maps-onto-both-wires-test
  (testing "Metabot: a recoverable error, its text in :output and its class on :error"
    (is (=? {:output #(str/starts-with? % "No glossary entry for \"revenue\".")
             :error  {:class :recoverable :code ::no-such-term}}
            (metabot-call {:term "revenue"}))))
  (testing "MCP: the same error as isError content with a JSON-RPC code"
    (is (=? {:isError  true
             :mcp/code jsonrpc-invalid-params
             :content  [{:text #(str/includes? % "No glossary entry for \"revenue\".")}]}
            (mcp-call glossary-tool {:term "revenue"}))))
  (testing "and both show the same authored sentence — one `recoverable-text`, two wires"
    (is (= (first (str/split-lines (:output (metabot-call {:term "revenue"}))))
           (first (str/split-lines (get-in (mcp-call glossary-tool {:term "revenue"})
                                           [:content 0 :text])))))))

(deftest ^:parallel each-consumer-reads-only-its-own-declaration-keys-test
  (let [declared (tools/declaration glossary-tool)]
    (testing "the neutral core is what both need"
      (is (= ["glossary" "Look up a business term as this instance's analysts defined it."]
             [(:name declared) (:description declared)]))
      (is (= scope/agent-content-read (:scope declared))))
    (testing "MCP's manifest carries its annotations and nothing of Metabot's"
      (let [entry (mcp-manifest-entry glossary-tool)]
        (is (= {:readOnlyHint true :destructiveHint false :openWorldHint false :idempotentHint true}
               (:annotations entry)))
        (is (= {:ui {:visibility ["app"]}} (:_meta entry)))
        (is (= [{:type "oauth2" :scopes [scope/agent-content-read]}] (:securitySchemes entry)))
        (is (not-any? #(= "metabot" (namespace %)) (keys entry)))))
    (testing "and Metabot's own extras sit under its namespace, invisible to MCP"
      (is (fn? (:metabot/title-fn declared))))))

(deftest ^:parallel a-renderable-is-rendered-by-the-consumer-not-the-tool-test
  (testing "the tool returned a Lines record; each consumer turned it into text itself"
    (let [{:keys [output]} (tools/handle glossary-tool {:term "churn"} {:tool-names #{}})]
      (is (instance? Lines output))
      (is (not (string? output)))
      (is (= "<term>churn</term>\n<definition>A customer who has not ordered in 90 days.</definition>"
             (tools/render-text output)))))
  (testing "a plain string is the trivial case, so a tool need not care"
    (is (= "plain" (tools/render-text "plain"))))
  (testing "and something with no rendering is rejected as a result rather than coerced"
    (is (not (tools/renderable? {:not :text})))
    (is (not (tools/renderable? :keyword)))))

(deftest ^:parallel what-stays-with-the-consumer-test
  (testing "the adapter above is ~30 lines and all of it is wire concerns: content blocks, JSON-RPC
           codes, manifest defaults, security schemes. None of it is in the tool, and none of the
           consumer-specific machinery either surface owns — registries, manifests, nil-stripping,
           pagination envelopes, projections, usage logging — moved anywhere."
    (is (= #{:content :structuredContent}
           (set (keys (mcp-call glossary-tool {:term "churn"})))))))
