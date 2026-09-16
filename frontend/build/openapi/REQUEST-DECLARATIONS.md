# Explicit request declarations (PoC)

The pilot moves 24 endpoints to `defineRequest`. The route describes the wire
path; the callback divides the existing RTK argument into path values, query
parameters and a body. RTK still infers the callback's argument type.

```ts
updateTable: builder.mutation<Table, UpdateTableRequest>({
  query: defineRequest({
    method: "PUT",
    route: "/api/table/{id}",
    request: ({ id, ...body }) => ({ path: { id }, body }),
  }),
  // Existing tags, cache updates and lifecycle callbacks stay here.
});
```

The callable exposes its own frozen declaration as `apiContract`. The checker
reads the method, route and inferred callback return type from it. It does not
interpret callback statements: aliases, local variables and conditional returns
work through TypeScript's inferred types. There is no second contract annotation.

Path values are required, encoded once, and kept separate from query/body keys.
Empty and dot path segments throw before sending. GET bodies are forbidden.
Only headers, cache and noEvent options are forwarded; they cannot replace the
declared route, method or payload. ApiClient still performs serialization and
runs authentication and embed middleware.

## What disappears

Normalizing the remaining app query declarations lets the checker drop:

- The inline query representation, parsing and decoding.
- GET-body folding and its special serialization branches.
- Merging multiple sources into a query payload.
- The corresponding runtime-modelling fixtures, replaced by checks that these
  declaration forms are unsupported and should use `params`.

This removal preserves all report IDs and statuses after app normalization.
ApiClient retains its GET-body behavior because embed middleware uses it.

For the 24 pilot endpoints, the checker also bypasses callback AST parsing,
URL-template reconstruction and implicit `:tag` consumption. Their legacy
implementations remain necessary for endpoints that have not migrated. This PoC
adds code overall while both declaration formats coexist; it is not a claim that
a helper alone makes the checker smaller.

## Limits and the next migration

- The checker compares the canonical app route. It does not analyse middleware
  transformations into public/guest embed routes. The six parameter endpoints
  whose `:tags` feed those transformations remain on the legacy declaration.
  Moving them requires making the embed route and its path inputs explicit before
  URL expansion; simply interpolating their current parameters is insufficient.
- Dynamic routes need separate explicit declarations. A method or route whose
  type is a union is not treated as one statically known operation.
- JSON conversion, omitted query values, repeated arrays, raw uploads and
  unconstrained types still need modelling and diagnostics. Raw uploads and
  payloads with no known properties remain unverified.
- Transforming a response still needs a separate raw-response contract. This
  change does not infer one from `transformResponse`.

## Focused validation

```sh
bun x jest --config jest.api-contract.conf.js --runInBand
bun run api-contract-check-pure
```

The focused Jest configuration runs compiler, CLI, helper and real-client
conformance tests without loading the visualization registry. The pure checker
requires an existing generated OpenAPI snapshot. Neither command rebuilds CLJS
or regenerates the backend schema.
