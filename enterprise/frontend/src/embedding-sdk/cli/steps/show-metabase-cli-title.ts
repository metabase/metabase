import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

import { SHOW_ON_STARTUP_MESSAGE } from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { printEmptyLines, printTitle, printWithPadding } from "../utils/print";

export const showMetabaseCliTitle: CliStepMethod = state => {
  printTitle(`Welcome to the Metabase Embedding SDK CLI`);
  printTitle(`View docs at https://npm.im/${SDK_PACKAGE_NAME}`);
  printEmptyLines();

  printWithPadding(SHOW_ON_STARTUP_MESSAGE.trim());
  printEmptyLines();

  return [{ type: "success" }, state];
};
