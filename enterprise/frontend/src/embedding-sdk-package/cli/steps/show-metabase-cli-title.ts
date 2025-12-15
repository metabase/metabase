import { SDK_DOCS_LINK } from "embedding-sdk-package/cli/constants/config";

import { SHOW_ON_STARTUP_MESSAGE } from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { printEmptyLines, printTitle, printWithPadding } from "../utils/print";

export const showMetabaseCliTitle: CliStepMethod = (state) => {
  printTitle(`Welcome to the Metabase modular embedding SDK CLI`);
  printTitle(`View docs at ${SDK_DOCS_LINK}`);
  printEmptyLines();

  printWithPadding(SHOW_ON_STARTUP_MESSAGE.trim());
  printEmptyLines();

  return [{ type: "success" }, state];
};
