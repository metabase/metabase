import type {
  DataCheckCatalogueEntry,
  DataCheckDefinition,
  DataCheckResult,
} from "../../types";

export type DataCheckViewProps = {
  definition: DataCheckDefinition;
  result: DataCheckResult;
  entry: DataCheckCatalogueEntry | undefined;
};
