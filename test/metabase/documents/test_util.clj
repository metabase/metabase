(ns metabase.documents.test-util
  "Shared test utilities for document tests.")

(defn text->prose-mirror-ast
  "Convert plain text to a ProseMirror AST structure. Empty text yields an empty document."
  [text]
  (if (empty? text)
    {:type "doc" :content []}
    {:type "doc"
     :content [{:type "paragraph"
                :content [{:type "text"
                           :text text}]}]}))
