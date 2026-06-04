(ns metabase.metabot.tools.edit-document
  "Tool used by the `:document-edit` profile to return a revised document body.

  Document editing runs as an ephemeral, non-persisted agent turn (see
  `metabase.metabot.api.document`): the model receives the current document plus
  the parent conversation's context and returns the complete rewritten document
  through this tool. The caller reads the revised body from the tool's
  `:structured-output`, diffs it against the current document, and renders the
  change for the user to accept or reject — so this is a terminal tool
  (`:final-response? true`)."
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "write_document_content"}
  write-document-content-tool
  "Return the COMPLETE revised document, incorporating the user's requested edit.

  Always include the full document body in `content`, not just the changed parts — the entire document is replaced with what you return. Keep the parts the user didn't ask to change.

  Preserve `[[chart:N]]` placeholder lines for any charts that should remain; each embeds the conversation's chart N as a live chart.

  Arguments:
  - `content`: the full revised document body in Markdown (headings, paragraphs, lists, and `[[chart:N]]` chart embeds).
  - `title`: the document title; include it (changed or not) so the document stays titled."
  [{:keys [title content]} :- [:map {:closed true}
                               [:title {:optional true} [:maybe :string]]
                               [:content :string]]]
  {:output "Document updated."
   :final-response? true
   :structured-output {:content content
                       :title   title}})
