(ns metabase.documents.validate-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.documents.validate :as validate]))

(defn- text [s]
  {:type "text" :text s})

(defn- p [& children]
  {:type "paragraph" :content (vec children)})

(defn- doc [& children]
  {:type "doc" :content (vec children)})

(defn- h [level & children]
  {:type "heading" :attrs {:level level} :content (vec children)})

(defn- bl [& items]
  {:type "bulletList" :content (vec items)})

(defn- li [& blocks]
  {:type "listItem" :content (vec blocks)})

(deftest top-level-shape-test
  (testing "non-map docs fail with a clear error"
    (is (= ["Top-level document is not an object: nil"]
           (validate/validate-prose-mirror nil)))
    (is (= ["Top-level document is not an object: \"hi\""]
           (validate/validate-prose-mirror "hi"))))
  (testing "root type must be doc"
    (is (= ["Top-level node must have type=\"doc\", got `paragraph`"]
           (validate/validate-prose-mirror (p (text "x"))))))
  (testing "an empty root doc is valid — the backend itself creates {:type \"doc\" :content []}"
    (is (= [] (validate/validate-prose-mirror {:type "doc" :content []})))
    (is (= [] (validate/validate-prose-mirror {:type "doc"}))))
  (testing "root `content` must still be an array when present"
    (is (= ["doc: `content` must be an array, got java.lang.String"]
           (validate/validate-prose-mirror {:type "doc" :content "nope"}))))
  (testing "empty content on non-root containers is still rejected"
    (is (= ["doc.content[0]: bulletList has empty `content`; either remove the node or add children"]
           (validate/validate-prose-mirror (doc {:type "bulletList" :content []}))))))

(deftest valid-canonical-doc-test
  (testing "the canonical doc shape we ask the LLM to emit validates clean"
    (is (= []
           (validate/validate-prose-mirror
            (doc (h 2 (text "Summary"))
                 (p (text "Revenue grew ")
                    {:type "text" :text "42%" :marks [{:type "bold"}]}
                    (text " last quarter."))
                 (bl (li (p (text "Add region breakdown")))
                     (li (p (text "Check Q4 promotion timeline"))))))))))

(deftest heading-level-test
  (testing "heading level must be 1-3"
    (doseq [bad-level [0 4 7 nil "2" 1.5]]
      (is (seq (validate/validate-prose-mirror
                (doc (h bad-level (text "x")))))
          (str "level " (pr-str bad-level) " should fail"))))
  (testing "heading levels 1-3 are accepted"
    (doseq [level [1 2 3]]
      (is (= []
             (validate/validate-prose-mirror
              (doc (h level (text "x")))))))))

(deftest paragraph-content-test
  (testing "empty paragraph (blank line) is accepted"
    (is (= []
           (validate/validate-prose-mirror
            (doc (p) (p (text "stuff")))))))
  (testing "block child inside paragraph is rejected"
    (let [errs (validate/validate-prose-mirror
                (doc (p {:type "paragraph" :content [(text "x")]})))]
      (is (= 1 (count errs)))
      (is (re-find #"expected an inline node" (first errs)))))
  (testing "text marks are validated"
    (is (= []
           (validate/validate-prose-mirror
            (doc (p {:type "text" :text "bold" :marks [{:type "bold"}]})))))
    (let [errs (validate/validate-prose-mirror
                (doc (p {:type "text" :text "x"
                         :marks [{:type "strikethrough"}]})))]
      (is (= 1 (count errs)))
      (is (re-find #"unsupported mark" (first errs))))))

(deftest list-structure-test
  (testing "bulletList children must be listItems"
    (let [errs (validate/validate-prose-mirror
                (doc (bl (p (text "wrong")))))]
      (is (= 1 (count errs)))
      (is (re-find #"expected a `listItem` node, got `paragraph`" (first errs)))))
  (testing "listItem children must be blocks"
    (let [errs (validate/validate-prose-mirror
                (doc (bl (li (text "wrong")))))]
      (is (= 1 (count errs)))
      (is (re-find #"expected a block node" (first errs)))))
  (testing "orderedList is treated identically to bulletList"
    (is (= []
           (validate/validate-prose-mirror
            (doc {:type "orderedList"
                  :content [(li (p (text "one")))]}))))))

(deftest unknown-node-test
  (testing "unknown node types are rejected with the allowed list"
    (let [errs (validate/validate-prose-mirror
                (doc {:type "callout" :content [(p (text "hi"))]}))]
      (is (= 1 (count errs)))
      (is (re-find #"expected a block node" (first errs)))
      (is (re-find #"paragraph" (first errs))
          "the allowed list is shown in the error")))
  (testing "missing :type is a specific error"
    (let [errs (validate/validate-prose-mirror
                (doc {:content [(text "x")]}))]
      (is (= 1 (count errs)))
      (is (re-find #"missing a `type` field" (first errs))))))

(deftest jsonpath-style-paths-test
  (testing "paths in errors point at the actual offending node"
    (let [errs (validate/validate-prose-mirror
                (doc (p (text "ok"))
                     (p (text "ok"))
                     (h 99 (text "bad"))))]
      (is (= 1 (count errs)))
      (is (re-find #"^doc\.content\[2\]\.attrs\.level" (first errs))
          (str "expected path doc.content[2].attrs.level, got: " (first errs))))))

(deftest valid-predicate-test
  (testing "valid-prose-mirror? returns true/false"
    (is (true?  (validate/valid-prose-mirror? (doc (p (text "ok"))))))
    (is (false? (validate/valid-prose-mirror? (doc (h 99 (text "x"))))))))

(deftest string-key-tolerance-test
  (testing "string-keyed maps validate the same way as keyword-keyed ones"
    (is (= []
           (validate/validate-prose-mirror
            {"type"    "doc"
             "content" [{"type"    "paragraph"
                         "content" [{"type" "text" "text" "hi"}]}]})))
    (is (seq (validate/validate-prose-mirror
              {"type"    "doc"
               "content" [{"type"    "heading"
                           "attrs"   {"level" 99}
                           "content" [{"type" "text" "text" "x"}]}]})))))

(deftest custom-block-nodes-test
  (testing "custom block node types are accepted when registered"
    (let [opts {:custom-block-nodes {"chartEmbed" (fn [_ _] [])}}]
      (is (= []
             (validate/validate-prose-mirror
              (doc {:type "chartEmbed" :attrs {:id 42}})
              opts)))))
  (testing "custom node validators can return their own errors"
    (let [opts {:custom-block-nodes
                {"chartEmbed"
                 (fn [node path]
                   (let [id (get-in node [:attrs :id])]
                     (if (pos-int? id)
                       []
                       [(str path ".attrs.id: must be a positive integer, got " (pr-str id))])))}}]
      (is (= []
             (validate/validate-prose-mirror
              (doc {:type "chartEmbed" :attrs {:id 42}}) opts)))
      (is (= ["doc.content[0].attrs.id: must be a positive integer, got nil"]
             (validate/validate-prose-mirror
              (doc {:type "chartEmbed" :attrs {}}) opts)))))
  (testing "without registration, the custom node fails as unknown"
    (let [errs (validate/validate-prose-mirror
                (doc {:type "chartEmbed" :attrs {:id 42}}))]
      (is (= 1 (count errs)))
      (is (re-find #"expected a block node" (first errs)))
      (is (not (re-find #"one of[^)]*chartEmbed" (first errs)))
          "unregistered type does not appear in the allowed-types list")))
  (testing "registered custom types appear in the allowed-block-types error message"
    (let [opts {:custom-block-nodes {"chartEmbed" (fn [_ _] [])}}
          errs (validate/validate-prose-mirror
                (doc {:type "totallyMadeUp"}) opts)]
      (is (re-find #"chartEmbed" (first errs))
          "registered type should be listed alongside built-ins"))))

(deftest aggregates-all-errors-test
  (testing "validator collects every error in one pass, not just the first"
    (let [errs (validate/validate-prose-mirror
                (doc (h 99 (text "x"))
                     (p {:type "totallyBogus"})
                     (h 0 (text "y"))))]
      (is (= 3 (count errs))
          (str "expected 3 errors, got: " (pr-str errs))))))

(deftest ^:parallel add-ids-to-nodes-adds-missing-ids-test
  (testing "nodes in nodes-with-id set receive an _id when missing"
    (let [result (validate/add-ids-to-nodes
                  (doc (p (text "hello"))
                       (h 2 (text "title"))))]
      (is (uuid? (get-in result [:content 0 :attrs :_id])))
      (is (uuid? (get-in result [:content 1 :attrs :_id])))))
  (testing "each generated _id is unique"
    (let [result (validate/add-ids-to-nodes
                  (doc (p (text "a")) (p (text "b")) (p (text "c"))))
          ids    (map #(get-in % [:attrs :_id]) (:content result))]
      (is (= (count ids) (count (set ids)))))))

(deftest ^:parallel add-ids-to-nodes-preserves-existing-ids-test
  (testing "nodes that already have an _id are not modified"
    (let [existing-id (random-uuid)
          input       (doc {:type "paragraph"
                            :attrs {:_id existing-id}
                            :content [(text "keep me")]})
          result      (validate/add-ids-to-nodes input)]
      (is (= existing-id (get-in result [:content 0 :attrs :_id]))))))

(deftest ^:parallel add-ids-to-nodes-skips-non-target-nodes-test
  (testing "text nodes and listItems do not receive _id attributes"
    (let [result (validate/add-ids-to-nodes
                  (doc (bl (li (p (text "item"))))))]
      (is (nil? (get-in result [:attrs :_id]))
          "doc node itself should not get an _id")
      (let [bullet-list (get-in result [:content 0])
            list-item   (get-in bullet-list [:content 0])
            paragraph   (get-in list-item [:content 0])
            text-node   (get-in paragraph [:content 0])]
        (is (uuid? (:_id (:attrs bullet-list)))
            "bulletList gets an _id")
        (is (nil? (:_id (:attrs list-item)))
            "listItem does not get an _id")
        (is (uuid? (:_id (:attrs paragraph)))
            "paragraph gets an _id")
        (is (nil? (:_id (:attrs text-node)))
            "text does not get an _id")))))

(deftest ^:parallel add-ids-to-nodes-handles-all-target-types-test
  (testing "every node type in nodes-with-id gets an _id"
    (let [input  (doc {:type "paragraph" :content [(text "x")]}
                      {:type "heading" :attrs {:level 1} :content [(text "x")]}
                      {:type "bulletList" :content [(li (p (text "x")))]}
                      {:type "orderedList" :content [(li (p (text "x")))]}
                      {:type "blockquote" :content [(p (text "x"))]}
                      {:type "codeBlock" :attrs {:language nil} :content [(text "x")]}
                      {:type "cardEmbed" :attrs {:cardId 1 :storedResultId 2}}
                      {:type "supportingText" :content [(text "x")]})
          result (validate/add-ids-to-nodes input)]
      (doseq [child (:content result)]
        (is (uuid? (get-in child [:attrs :_id]))
            (str (:type child) " should have an _id"))))))

(deftest ^:parallel add-ids-to-nodes-string-key-tolerance-test
  (testing "adds _id to a node with string-keyed type and string-keyed attrs"
    (let [result (validate/add-ids-to-nodes
                  {"type" "doc"
                   "content" [{"type" "paragraph"
                               "attrs" {"class" "intro"}
                               "content" [{"type" "text" "text" "hi"}]}]})]
      (is (uuid? (get-in result ["content" 0 "attrs" :_id])))))
  (testing "respects existing string-keyed _id"
    (let [existing-id "already-here"
          result      (validate/add-ids-to-nodes
                       {"type" "doc"
                        "content" [{"type" "paragraph"
                                    "attrs" {"_id" existing-id}
                                    "content" [{"type" "text" "text" "hi"}]}]})]
      (is (= existing-id (get-in result ["content" 0 "attrs" "_id"])))
      (is (nil? (get-in result ["content" 0 "attrs" :_id]))
          "should not add a duplicate keyword _id")))
  (testing "adds _id to a node with no attrs key at all"
    (let [result (validate/add-ids-to-nodes
                  {"type" "doc"
                   "content" [{"type" "heading"
                               "content" [{"type" "text" "text" "title"}]}]})]
      (is (uuid? (get-in result ["content" 0 :attrs :_id]))))))
