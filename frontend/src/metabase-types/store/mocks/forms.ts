import { FormState } from "metabase-types/store";

export const createMockFormState = (opts?: Partial<FormState>): FormState => ({
  database: {},
  ...opts,
});
