(ns metabase.metabot.tools.convert-document
  "Tool that turns the current conversation into a Metabase document.

  This is a deliberately thin signal: the tool only emits a
  `convert_to_document` data part. The client already holds the full
  conversation in its store, so it builds the document (embedding the charts and
  tables produced so far) and renders it inline."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "convert_conversation_to_doc"}
  convert-conversation-to-doc-tool
  "Convert the current conversation into a Metabase document, embedding the charts and tables produced so far. ONLY call this when the user explicitly asks to save, export, or turn the conversation into a document."
  [{:keys [title]} :- [:map {:closed true}
                       [:title {:optional true} [:maybe :string]]]]
  {:output "Creating a document from this conversation and showing it below."
   :instructions (str "The document is being created and rendered for the user below your "
                      "message. Do not repeat the conversation's contents in your response.")
   :data-parts [(streaming/convert-to-document-part {:title title})]})
