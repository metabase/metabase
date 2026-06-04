(ns metabase.metabot.tools.convert-document
  "Tool that turns the current conversation into a Metabase document.

  The model authors the document body (a synthesized summary, not a transcript)
  and passes it as `content`. The tool emits a transient `convert_to_document`
  data part carrying that content; the client converts the Markdown to a Metabase
  document, resolves `[[chart:N]]` placeholders into live chart embeds (using the
  charts the conversation already produced, which it holds in its store), persists
  it, and renders it inline."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "convert_conversation_to_doc"}
  convert-conversation-to-doc-tool
  "Write a polished, standalone Metabase document that summarizes this conversation, and show it to the user inline.

  ONLY call this when the user explicitly asks to save, export, or turn the conversation into a document.

  Do NOT transcribe the chat. Synthesize the findings into a clear, well-structured report: an informative title, headings, prose, and lists. Describe what the data shows and what it means.

  Embedding charts: the charts and tables produced so far in this conversation are numbered 1, 2, 3, … in the order they appeared. To embed chart N as a LIVE, interactive chart, put a line containing exactly `[[chart:N]]` (nothing else on that line) at the point in the narrative where you discuss it. Reference the relevant charts directly where you describe their data — do not just list them at the end.

  Arguments:
  - `title`: a concise title for the document.
  - `content`: the full document body in Markdown (headings, paragraphs, lists, bold/italic, and `[[chart:N]]` chart embeds)."
  [{:keys [title content]} :- [:map {:closed true}
                               [:title {:optional true} [:maybe :string]]
                               [:content :string]]]
  {:output "Creating a document from this conversation and showing it below."
   :instructions (str "The document is being created and rendered for the user below your "
                      "message. Do not repeat the conversation's contents in your response.")
   :data-parts [(streaming/convert-to-document-part {:title title :content content})]})
