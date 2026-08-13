(ns metabase.mcp.tools-test
  "scope-matches? tests moved to [[metabase.mcp.scope-test]]."
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.api.macros.scope :as api.scope]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.util.json :as json]))

(deftest ^:parallel drop-nil-args-test
  (testing "strips nil-valued top-level keys so 'missing' and 'explicit nil' are equivalent at the MCP boundary"
    (let [drop-nil-args (var-get #'mcp.tools/drop-nil-args)]
      (testing "removes top-level nils"
        (is (= {:id 42 :flag false}
               (drop-nil-args {:id 42 :flag false :extra nil}))))
      (testing "keeps non-nil falsey values"
        (is (= {:flag false :count 0 :text ""}
               (drop-nil-args {:flag false :count 0 :text ""}))))
      (testing "preserves nested nils (only top-level is rewritten)"
        (is (= {:source {:type "table" :id nil}}
               (drop-nil-args {:source {:type "table" :id nil} :continuation_token nil}))))
      (testing "nil argument → nil"
        (is (nil? (drop-nil-args nil))))
      (testing "empty map stays empty"
        (is (= {} (drop-nil-args {})))))))

(deftest ^:parallel overrides-cover-known-tools-test
  (testing "every key in `mcp-input-overrides` / `mcp-output-overrides` matches a real tool"
    ;; Catches the silent-no-op failure mode if a tool gets renamed or an override key is misspelled:
    ;; the override would otherwise be dropped on the floor and the wire-shape schema would be published
    ;; in place of the intended MCP shape. Lives as a test (not a runtime check at manifest generation)
    ;; so prod startup isn't burdened with a check that only catches developer mistakes.
    (let [manifest-fn (#'mcp.tools/manifest)
          tool-names  (into #{} (map :name) (:tools manifest-fn))]
      (doseq [[label override-map-var] [["mcp-input-overrides"  #'mcp.tools/mcp-input-overrides]
                                        ["mcp-output-overrides" #'mcp.tools/mcp-output-overrides]]]
        (testing label
          (let [unknown (remove tool-names (keys @override-map-var))]
            (is (empty? unknown)
                (str label " has keys that don't match any tool name: " (vec unknown)))))))))

(defn- data-node?
  "True if `x` is a value type our published JSON-Schema-shaped tool schemas
   are allowed to contain. Visited via `walk/postwalk`, which traverses every
   node (branches and leaves), so this predicate must accept both scalars and
   the container types that hold them. Excludes functions, vars, atoms —
   anything that would blow up `json/encode` or whose JSON encoding isn't
   byte-stable.

   `java.util.regex.Pattern` is allowed: `mjs/transform` lowers `[:re #\"...\"]`
   to `{:type \"string\" :pattern #\"...\"}`, leaving the compiled Pattern in
   the schema. Note that `(hash Pattern)` is identity-based and unstable, but
   `(json/encode Pattern)` writes the regex source string — which is stable.
   `tools-hash` hashes the JSON bytes, never the Pattern object, so Pattern
   nodes are safe in practice."
  [x]
  (or (nil? x) (boolean? x) (number? x) (string? x)
      (keyword? x) (symbol? x)
      (map? x) (vector? x) (seq? x) (set? x)
      (instance? java.util.regex.Pattern x)))

(deftest ^:parallel tool-schemas-are-pure-data-test
  (testing "published tool schemas must be JSON-encodable pure data so `tools-hash` is stable"
    ;; The MCP SSE keepalive emits `notifications/tools/list_changed` when `tools-hash` changes.
    ;; That hash is only meaningful if `inputSchema` / `outputSchema` are pure data: a stray fn
    ;; (e.g. a Malli predicate that leaked through `mjs/transform`) would either blow up
    ;; `json/encode` or, if hashed directly, produce an identity-hash that's stable within a JVM
    ;; but not across builds — silently breaking the list-changed contract.
    (let [tools (mcp.tools/list-tools #{::api.scope/unrestricted})]
      (is (seq tools) "list-tools should return some tools under the unrestricted scope")
      (doseq [{tool-name :name :keys [inputSchema outputSchema]} tools
              [label schema] [[:inputSchema inputSchema] [:outputSchema outputSchema]]
              :when schema]
        (testing (str tool-name " " label)
          (testing "every node is a pure-data type"
            (walk/postwalk
             (fn [x]
               (is (data-node? x)
                   (str "Non-data node in " tool-name " " label ": " (pr-str x) " (" (type x) ")"))
               x)
             schema))
          (testing "json-encodes without error"
            (is (string? (json/encode schema))))
          (testing "json encoding is deterministic"
            (is (= (json/encode schema) (json/encode schema)))))))))

(deftest ^:parallel tools-hash-test
  (testing "tools-hash is deterministic across calls"
    (let [scopes #{::api.scope/unrestricted}]
      (is (= (mcp.tools/tools-hash scopes) (mcp.tools/tools-hash scopes)))))
  (testing "tools-hash differs when the visible toolset differs"
    ;; Different scope set yields a different (possibly smaller) tool list, so the hash should change.
    ;; If this ever flakes because two scope filters happen to produce identical lists, narrow the
    ;; second scope to one that we know filters tools out.
    (let [unrestricted (mcp.tools/tools-hash #{::api.scope/unrestricted})
          empty-scopes (mcp.tools/tools-hash #{})]
      (is (not= unrestricted empty-scopes)))))
