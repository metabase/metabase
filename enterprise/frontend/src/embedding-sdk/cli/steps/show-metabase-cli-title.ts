import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

import type { CliStepMethod } from "../types/cli";
import { printEmptyLines, printTitle } from "../utils/print";

export const showMetabaseCliTitle: CliStepMethod = state => {
  printTitle(`Welcome to the Metabase Embedding SDK CLI`);
  printTitle(`View docs at https://npm.im/${SDK_PACKAGE_NAME}`);
  printEmptyLines();

  return [
    {
      type: "success",
    },
    state,
  ];
};
