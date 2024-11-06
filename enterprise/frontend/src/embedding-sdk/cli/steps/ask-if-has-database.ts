import toggle from "inquirer-toggle";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import { printHelperText } from "embedding-sdk/cli/utils/print";

/**
 * Asks the user first if they have a database to connect to.
 */
export const askIfHasDatabase: CliStepMethod = async state => {
  const hasDatabase = await toggle({
    message:
      "Do you have a database to connect to? This will be used to embed your data.",
    default: true,
  });

  if (!hasDatabase) {
    printHelperText(
      "Sample data will be used to demonstrate embedding features.",
    );
  }

  return [{ type: "success" }, { ...state, useSampleDatabase: !hasDatabase }];
};
