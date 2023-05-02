import { Alert } from "metabase-types/api";

export const createMockAlert = (opts?: Partial<Alert>): Alert => ({
  id: 1,
  ...opts,
});
