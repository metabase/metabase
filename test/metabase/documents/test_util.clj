(ns metabase.documents.test-util
  "Shared test utilities for document tests.")

(defn text->prose-mirror-ast
  "Convert plain text to a ProseMirror AST structure."
  [text]
  {:type "doc"
   :content [{:type "paragraph"
              :content [{:type "text"
                         :text text}]}]})
