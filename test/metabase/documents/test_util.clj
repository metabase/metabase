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

(defn cards->prose-mirror-ast
  "Build a ProseMirror document AST that embeds each id in `card-ids` as a `cardEmbed` node."
  [card-ids]
  {:type "doc"
   :content (mapv (fn [id] {:type "cardEmbed" :attrs {:id id :name nil}}) card-ids)})
