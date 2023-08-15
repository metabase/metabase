import { EnterpriseState } from "./types";

export const getUserAttributes = (state: EnterpriseState) => {
  return state.plugins.shared.attributes;
};
