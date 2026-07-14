(ns metabase.mcp.tools-test
  "scope-matches? tests moved to [[metabase.mcp.scope-test]]."
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.agent-api.dashboard-write :as agent-api.dashboard-write]
   [metabase.api.macros.scope :as api.scope]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.mcp.toolsets :as mcp.toolsets]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
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

(deftest ^:parallel two-channel-content-test
  (testing "v2 result carries the data once — full payload in the text block, only next-step fields in structuredContent"
    (let [rows   {:cols ["id" "total"] :rows [[1 9.99] [2 4.50]]}
          next   {:query_handle "h1" :returned 2 :total 2 :truncated false}
          result (mcp.tools/two-channel-content rows next)]
      (testing "content text is the full data payload, serialized exactly once"
        (is (= (json/encode rows) (-> result :content first :text))))
      (testing "structuredContent is only the machine next-step fields, never a mirror of the body"
        (is (= next (:structuredContent result)))
        (is (not (contains? (:structuredContent result) :rows)))
        (is (not (contains? (:structuredContent result) :cols))))))
  (testing "a bare string text payload is passed through unencoded"
    (is (= "hello" (-> (mcp.tools/two-channel-content "hello") :content first :text))))
  (testing "single-arg form emits the text channel only — no structuredContent"
    (is (not (contains? (mcp.tools/two-channel-content {:a 1}) :structuredContent)))))

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

;;; ------------------------------------------- v2 tool results -----------------------------------------------------

(deftest search-carries-its-rows-once-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-new-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Card _ {:name "TwoChannel Question"}]
        (mt/with-test-user :rasta
          (let [result (mcp.tools/call-tool nil "search" {:term_queries ["TwoChannel"] :type ["question"]})
                text   (json/decode+kw (-> result :content first :text))]
            (testing "the rows travel once, in the text block"
              (is (= ["TwoChannel Question"] (map :name (:data text)))))
            (testing "and structuredContent carries only what a next call consumes — never a second copy"
              (is (= {:returned 1} (:structuredContent result)))
              (is (not (contains? (:structuredContent result) :data))))
            (testing "a fused ranking counts nothing, so it reports no total; a filter-only listing does"
              (is (= {:returned 1 :total 1}
                     (:structuredContent (mcp.tools/call-tool nil "search" {:type ["question"]})))))))))))

(deftest search-is-granted-by-its-toolset-test
  (testing "the tool declares the group scope its toolset grants, so tools/list filters it with the rest of discover"
    (let [tool (some #(when (= "search" (:name %)) %)
                     (mcp.tools/list-tools #{(mcp.toolsets/toolset-scope :discover)}))]
      (is (some? tool))
      (is (true? (get-in tool [:annotations :readOnlyHint])))
      (testing "and its outputSchema describes the structured channel, not the body"
        (is (= #{:returned :total :truncated :truncation_message}
               (set (keys (get-in tool [:outputSchema :properties])))))))))

(deftest browse-data-is-granted-by-its-toolset-test
  (testing "browse_data rides the discover grant, and its outputSchema describes the structured channel"
    (let [tool (some #(when (= "browse_data" (:name %)) %)
                     (mcp.tools/list-tools #{(mcp.toolsets/toolset-scope :discover)}))]
      (is (some? tool))
      (is (true? (get-in tool [:annotations :readOnlyHint])))
      (is (= #{:returned :total :truncated :truncation_message :omitted}
             (set (keys (get-in tool [:outputSchema :properties]))))))))

(deftest browse-collection-is-granted-by-its-toolset-test
  (testing "browse_collection rides the discover grant, and its outputSchema describes the structured channel"
    (let [tool (some #(when (= "browse_collection" (:name %)) %)
                     (mcp.tools/list-tools #{(mcp.toolsets/toolset-scope :discover)}))]
      (is (some? tool))
      (is (true? (get-in tool [:annotations :readOnlyHint])))
      (is (= #{:returned :total :truncated :truncation_message}
             (set (keys (get-in tool [:outputSchema :properties]))))))))

(deftest browse-collection-carries-its-items-once-test
  (mt/with-temp [:model/Collection coll {:name "TwoChannel Collection"}
                 :model/Card       _    {:name "TwoChannel Item" :collection_id (:id coll)}]
    (mt/with-test-user :rasta
      (let [result (mcp.tools/call-tool nil "browse_collection" {:id (:id coll)})
            text   (json/decode+kw (-> result :content first :text))]
        (testing "the items travel once, in the text block"
          (is (= ["TwoChannel Item"] (map :name (:data text)))))
        (testing "and structuredContent carries only the counts — never a second copy"
          (is (= {:returned 1 :total 1} (:structuredContent result))))))))

(deftest get-parameter-values-carries-its-values-once-test
  (testing "the one v2 read whose body is the REST shape rather than an envelope still splits into two channels"
    (mt/with-temp [:model/Card      card {:dataset_query (mt/mbql-query products)}
                   :model/Dashboard dash {:parameters [{:name "Category" :slug "category"
                                                        :id   "cat" :type "string/="}]}
                   :model/DashboardCard _ {:dashboard_id       (:id dash)
                                           :card_id            (:id card)
                                           :parameter_mappings [{:parameter_id "cat"
                                                                 :card_id      (:id card)
                                                                 :target       [:dimension (mt/$ids products $category)]}]}]
      (mt/with-test-user :rasta
        (let [result (mcp.tools/call-tool nil "get_parameter_values"
                                          {:target "dashboard" :id (:id dash) :parameter_id "cat"})
              text   (json/decode+kw (-> result :content first :text))]
          (is (contains? (set (map first (:values text))) "Doohickey"))
          (testing "and the structured channel carries only the steer: whether the list was capped"
            (is (= {:has_more_values false} (:structuredContent result)))))))))

;;; ---------------------------------- Descriptions name only real tools --------------------------------------------

(def ^:private tool-name-pattern
  "A tool name as a description writes it: a snake_case word of two or more segments. Every tool in the
   catalog is named that way, and so are a good many wire properties, which is what [[not-tool-names]] is
   for."
  #"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")

(def ^:private not-tool-names
  "The snake_case words a tool description uses that are not tools: wire property names, action and mode
   enums, the ops of `dashboard_write` (which are named like tools because they are named like the gestures
   they perform), and the Metabot prompt document the construct tools point at."
  (into
   (set agent-api.dashboard-write/ops)
   #{"query_handle" "collection_path" "collection_id" "database_id" "table_id" "source_card_id"
     "parameter_id" "source_table" "source_card" "content_markdown" "template_tags" "has_more_values"
     "template_tag_values"
     "row_limit" "row_count" "response_format" "sort_column" "sort_direction" "display_size"
     "question_ids" "dashcard_id" "card_id" "include_hidden" "term_queries" "semantic_queries"
     "created_by" "validate_only" "parent_collection_id" "visualization_settings" "dataset_query"
     "truncation_message" "skipped_includes" "parameter_mappings" "continuation_token" "last_edited_at"
     "construct_notebook_query" "query_metadata" "entity_id" "table_ids" "field_id" "has_field_values"
     "list_databases" "list_schemas" "list_tables" "list_models" "get_fields" "download_url"
     "card_type" "column_metadata" "collection_position" "display_name" "semantic_type" "visibility_type"
     "widget_type" "dashboard_id"
     "card_ids" "tab_id" "inline_parameters" "auto_apply_filters" "size_x" "size_y" "action_id"
     "column_settings" "click_behavior" "dashboard_tab_id"}))

(defn- named-tools
  "Every tool name `text` mentions."
  [text]
  (into #{}
        (remove not-tool-names)
        (re-seq tool-name-pattern (str text))))

(deftest descriptions-name-only-tools-that-exist-test
  (testing "a description that tells the model to call a tool the catalog does not contain teaches a call the
            model cannot make: it spends a turn discovering that, or it invents a fallback"
    (let [catalog   (into #{} (mcp.toolsets/all-tools))
          ;; The manifest tools: the ones whose descriptions live on a `defendpoint` in `agent-api`. The UI
          ;; tools are authored in `metabase.mcp.resources` and are checked where they are written.
          published (into #{} (map :name) (:tools (#'mcp.tools/manifest)))
          tools     (filter #(and (published (:name %)) (mcp.toolsets/tool->toolset (:name %)))
                            (mcp.tools/list-tools #{::api.scope/unrestricted}))]
      (is (seq tools) "there are tools in the catalog to check")
      (doseq [{tool-name :name :keys [description inputSchema]} tools
              [where text] (into [[:description description]]
                                 (for [[property schema] (:properties inputSchema)]
                                   [property (:description schema)]))
              named (named-tools text)]
        (testing (str tool-name " / " (name where))
          (is (contains? catalog named)
              (str "names `" named "`, which is not a tool in the catalog")))))))
