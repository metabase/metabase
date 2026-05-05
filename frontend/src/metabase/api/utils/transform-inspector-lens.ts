import type { LensHandle } from "metabase-types/api";

export const getLensKey = (handle: LensHandle): string => {
  if (!handle.params) {
    return handle.id;
  }
  const searchParams = new URLSearchParams(
    Object.entries(handle.params).map(([key, value]) => [key, String(value)]),
  );
  searchParams.sort();
  return `${handle.id}?${searchParams.toString()}`;
};
