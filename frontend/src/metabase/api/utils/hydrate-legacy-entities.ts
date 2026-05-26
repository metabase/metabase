import type { Schema } from "normalizr";

import { updateMetadata } from "metabase/redux/metadata-typed";

import { handleQueryFulfilled } from "./lifecycle";

/**
 * Bridges RTK Query responses into the entity store.
 *
 * Legacy code paths still in use, ie. notably `Entity.actions.update`,
 * which reads the original object via `getObject` to build undo payloads
 * require those slices to be hydrated.
 *
 * TODO: Delete this helper, and remove every call site, when the legacy entity
 * system is gone.
 */
export const hydrateLegacyEntities =
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
