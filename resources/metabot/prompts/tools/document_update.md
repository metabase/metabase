## When to use `document_update`

Use this tool when the user explicitly asks you to change the contents of the
Document they are viewing — for example, "add a summary", "rewrite the intro",
"insert a heading at the top", "rename this doc to ...".

### Required workflow

1. **Always call `document_read` first** to retrieve the current ProseMirror
   AST. Never write a `document_update` call without first reading.
2. Build the new AST by starting from the read result's
   `structured_output.document` and modifying only what the user asked you to
   change.
3. **Preserve `cardEmbed` and `smartLink` nodes** exactly as you received them
   unless the user explicitly asked for those embeds to be removed or moved.
4. Pass the **full new AST** as the `document` argument. The whole document
   content is replaced; there is no partial-patch mode in this version.

### Don't

- Don't call `document_update` for questions or suggestions ("what could I
  add?") — answer in chat instead.
- Don't fabricate `cardEmbed` ids; only include card embeds that were already
  present in the document you read.
- Don't try to use `document_update` to create a new document; it only updates
  the Document the user is currently viewing.
- Don't call `document_update` when the document's `user_is_viewing` entry has
  `has_unsaved_changes: true`. Instead, ask the user to save or discard their
  unsaved changes and try again.
