(ns metabase.mcp.tools-test
  "scope-matches? tests moved to [[metabase.mcp.scope-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.tools]))

(deftest ^:parallel drop-nil-args-test
  (testing "strips nil-valued top-level keys so 'missing' and 'explicit nil' are equivalent at the MCP boundary"
    (let [drop-nil-args (var-get #'metabase.mcp.tools/drop-nil-args)]
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
    (let [manifest-fn (#'metabase.mcp.tools/manifest)
          tool-names  (into #{} (map :name) (:tools manifest-fn))]
      (doseq [[label override-map-var] [["mcp-input-overrides"  #'metabase.mcp.tools/mcp-input-overrides]
                                        ["mcp-output-overrides" #'metabase.mcp.tools/mcp-output-overrides]]]
        (testing label
          (let [unknown (remove tool-names (keys @override-map-var))]
            (is (empty? unknown)
                (str label " has keys that don't match any tool name: " (vec unknown)))))))))
