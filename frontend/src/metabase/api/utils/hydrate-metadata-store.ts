import { type Schema, normalize } from "normalizr";

import { handleQueryFulfilled } from "./lifecycle";

const UPDATE = "metabase/entities/UPDATE";

// Normalizes an entity (or list) and dispatches it into `state.entities`.
// Handled by the per-slice reducers in `metabase/redux/entities` — see
// `makeSliceReducer` there, which merges `payload.entities.<name>` into the
// matching `state.entities.<name>` slice so `getMetadata` picks up the change.
export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}

/**
 * `onQueryStarted` helper that mirrors an RTK Query response into the
 * normalized `state.entities.<slice>` store via `metabase/entities/UPDATE`.
 *
 * Why this exists: `getMetadata` in `metabase/selectors/metadata.ts` (and the
 * `Metadata`/`Database`/`Table`/… wrappers it builds) read directly from
 * `state.entities.*`, stitching one logical object together from several
 * endpoints' payloads. Every endpoint whose payload should flow into
 * `getMetadata` therefore needs to hydrate the slices on each successful fetch.
 */
export const hydrateMetadataStore =
  <Response>(
    schema: Schema,
    pick: (response: Response) => unknown = (response) => response,
  ) =>
  (
    _arg: unknown,
    {
      queryFulfilled,
      dispatch,
    }: {
      queryFulfilled: Promise<{ data: Response }>;
      dispatch: (action: ReturnType<typeof updateMetadata>) => unknown;
    },
  ) =>
    handleQueryFulfilled(queryFulfilled, (data) =>
      dispatch(updateMetadata(pick(data), schema)),
    );
