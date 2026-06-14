(ns metabase.documents.test-util
  "Shared test utilities for document tests."
  (:require
   [toucan2.core :as t2]))

(defn text->prose-mirror-ast
  "Convert plain text to a ProseMirror AST structure. Empty text yields an empty document."
  [text]
  (if (empty? text)
    {:type "doc" :content []}
    {:type "doc"
     :content [{:type "paragraph"
                :content [{:type "text"
                           :text text}]}]}))

(defn raw-body-text
  "Read a document's derived `:body_text` straight from the DB, bypassing the model's after-select
  (which strips it). Used to assert search-index sync in tests."
  [doc-id]
  (:body_text (t2/query-one {:select [:body_text] :from [:document] :where [:= :id doc-id]})))
