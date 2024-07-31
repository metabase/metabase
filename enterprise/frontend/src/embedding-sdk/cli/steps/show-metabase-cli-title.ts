import type { CliStepMethod } from "../types/types";
import { printEmptyLines, printTitle } from "../utils/print";

export const showMetabaseCliTitle: CliStepMethod = state => {
  printTitle(`Welcome to the Metabase Embedding SDK CLI`);
  printTitle(`View docs at https://npm.im/@metabase/embedding-sdk-react`);
  printEmptyLines();

  return [
    {
      type: "success",
    },
    state,
  ];
};
