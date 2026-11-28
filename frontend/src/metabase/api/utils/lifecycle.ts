import { isBaseEntityID } from "metabase-types/api/entity-id";

type QueryData<T> = {
  data: T;
};

/*
  When `queryFulfilled` is used in the `onQueryStarted` lifecycle callback, RTK
  throws an exception if the base query fails. Furthermore, it throws another
  exception if the exception from `queryFulfilled` is unhandled. The docs
  recommend wrapping all `queryFulfilled` calls in a try-catch block.

  If there is a redirect, `queryFulfilled` resolves to an object with `data`
  as a string. This is not expected by callers of this function, so we check
  for it here and avoid calling `handleSuccess` in this case.
 */
export async function handleQueryFulfilled<T>(
  queryFulfilled: Promise<QueryData<T>>,
  handleSuccess: (data: T) => void,
  handleError?: () => void,
) {
  try {
    const { data } = await queryFulfilled;
    if (data != null && typeof data == "object") {
      handleSuccess(data);
    }
  } catch {
    handleError?.();
  }
}

/**
 * Calls `handleEntity` with the result of a query that was made by entity ID.
 * An endpoint uses it to cache the entity under its numeric ID as well, so that a page asking by numeric ID finds it.
 */
export function handleLoadedByEntityId<T>(
  id: unknown,
  queryFulfilled: Promise<QueryData<T>>,
  handleEntity: (entity: T) => void,
) {
  if (!isBaseEntityID(id)) {
    return undefined;
  }

  return handleQueryFulfilled(queryFulfilled, handleEntity);
}
