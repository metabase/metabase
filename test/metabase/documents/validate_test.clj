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
  (testing "doc must have non-empty content"
    (is (= ["doc: doc has empty `content`; either remove the node or add children"]
           (validate/validate-prose-mirror {:type "doc" :content []})))
    (is (= ["doc: doc requires a non-empty `content` array"]
           (validate/validate-prose-mirror {:type "doc"})))))

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
