import { ImpersonationParams } from "./types";

export const getImpersonationKey = (params: ImpersonationParams) =>
  `${params.databaseId}:${params.groupId}`;
