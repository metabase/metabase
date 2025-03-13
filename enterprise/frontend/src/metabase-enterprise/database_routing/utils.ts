import { skipToken } from "@reduxjs/toolkit/query";

export function paramIdToGetQuery(strId: string | undefined) {
  const id = strId ? parseInt(strId, 10) : undefined;
  return id ? { id } : skipToken;
}
