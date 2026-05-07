## When to use `document_read`

Use this tool whenever the user is viewing a Document (their `user_is_viewing`
context contains an entry with `type: "document"`) and they ask a question
about, or want changes to, the document — for example:

- "Summarize this doc"
- "What else should I include?"
- "Rewrite the introduction"
- "Add a summary section"

The id to pass is the `id` from the `user_is_viewing` document entry.

`document_read` returns both a textual rendering of the document (suitable for
reasoning about prose) and the underlying ProseMirror AST in
`structured_output.document`. **You must base any subsequent `document_update`
call on this AST**, only changing the parts you intend to change. Card embeds
(`cardEmbed` nodes) and smart links (`smartLink` nodes) must be preserved
verbatim unless the user explicitly asks for them to be removed.

If the user is not viewing a document, do not call this tool.

If the document entry in `user_is_viewing` has `has_unsaved_changes: true`, do
not call this tool — the persisted contents won't match what the user sees in
the editor. Tell the user to save or discard their unsaved changes and try
again.
