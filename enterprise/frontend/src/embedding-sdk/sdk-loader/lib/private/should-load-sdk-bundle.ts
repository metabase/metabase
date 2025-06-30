import {
  isCypressActive,
  isJest,
  isStorybookActive,
  isTest,
} from "metabase/env";

export function shouldLoadSdkBundle() {
  return !isStorybookActive && !isCypressActive && !isTest && !isJest;
}
