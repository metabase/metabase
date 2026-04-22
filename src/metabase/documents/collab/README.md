# metabase.documents.collab

Embedded collaborative document editing for Metabase. Wires a JVM
[`yhocuspocus`](https://github.com/edpaget/y-crdt-jni) server into the
existing Jetty process so browser clients can open a WebSocket at
`/api/document/collab` and co-edit a single document with CRDT conflict
resolution.

This is internal orientation for developers working on the feature.
User-facing docs live elsewhere.

## Boot flow

1. `metabase.documents.collab.native/native-library-available?` probes the
   JNI-backed Y-CRDT library at JVM startup (no-op if it fails — the feature
   just stays disabled).
2. On the first WebSocket upgrade, `metabase.documents.collab.handler/routes`
   calls `server/get-server`, which lazily builds a `YHocuspocus` singleton
   iff `MB_ENABLE_DOCUMENT_COLLAB=true` and the native library loads.
3. The handler reifies a `Transport` (see `transport.clj`) wired to the Ring
   WebSocket listener, then calls `YHocuspocus.handleConnection` with the
   transport and a small context map (`connectionId`, `remoteAddress`).
4. yhocuspocus dispatches messages between connections for the same
   `documentName`, calling the persistence extension to load and save state.
5. On app shutdown, `metabase.core.core/destroy!` calls `server/stop!`, which
   closes the server and releases its executors.

## File roles

| File                | Responsibility                                                           |
|---------------------|--------------------------------------------------------------------------|
| `native.clj`        | JNI load probe — gates all collab initialization.                        |
| `transport.clj`     | Ring WebSocket ↔ `yhocuspocus.Transport` bridge (byte buffers, futures). |
| `handler.clj`       | `/api/document/collab` endpoint; feature-flag gate + `handleConnection`. |
| `server.clj`        | Lazy `YHocuspocus` singleton + `stop!` lifecycle hook.                   |
| `persistence.clj`   | `DatabaseExtension` — dual-writes `document.ydoc` + `document.document`. |
| `authz.clj`         | `Extension#onAuthenticate` — per-document read/write permission check.   |
| `prose_mirror.clj`  | Schema-free `YXmlFragment` ↔ ProseMirror JSON walker.                    |

## Doc naming

yhocuspocus identifies documents by string name. Metabase uses
`"document:<entity-id>"` — the 21-char NanoID `document.entity_id`. Parsed
by `collab.persistence/parse-doc-name`. Future protocols (cards,
dashboards) can claim their own prefixes; unknown prefixes throw
`ex-info` so regressions surface explicitly.

## Storage

Binary Y-CRDT state lives in `document.ydoc` (`bytea` / `blob`). The existing
ProseMirror JSON in the `document.document` column is kept in sync on every
save — `saveToDatabase` derives PM JSON from the post-edit YDoc via the
schema-free walker in `prose_mirror.clj` and writes both columns in one
transaction. Viewers of `GET /api/document/:id` therefore always see the
latest state without needing to know about collab.

When a document that has existing JSON but no ydoc connects for the first
time, `loadFromDatabase` hydrates bytes from the JSON so the collab session
starts at the current state rather than empty.

## Authorization

The handler is mounted behind `+auth` in the top-level route map, so
session resolution + 401 rejection happens upstream — we don't duplicate
that work. Inside the handler, `api/*current-user-id*` is already bound;
we stash it in the yhocuspocus context `HashMap` as `"userId"`.

The `authz.clj` `Extension` runs on the yhocuspocus executor. Its
`onAuthenticate` hook reads `"userId"` from the context, rebinds it via
`request.session/with-current-user`, and checks `mi/can-read?` /
`mi/can-write?` on the resolved document. Three outcomes:

- Unknown entity-id or no read perms → throws; yhocuspocus closes the
  connection.
- Read perms but no write perms → `payload.setReadOnly(true)`.
- Write perms → connection accepted as-is.

## Feature flag

`MB_ENABLE_DOCUMENT_COLLAB=true` — unset by default, read via
`config/config-bool :mb-enable-document-collab`. When off:

- the handler returns 404 for `/api/document/collab`
- `server/get-server` returns `nil` (no `YHocuspocus` ever built)
- `server/stop!` is a no-op
