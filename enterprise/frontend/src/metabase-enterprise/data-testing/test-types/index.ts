import type { DataTestType } from "metabase-types/api";

import type {
  DataTestByType,
  DataTestTypeDefinition,
  DataTestTypeDefinitions,
} from "../types";

import { cardTestDefinition } from "./card/definition";
import { transformTestDefinition } from "./transform/definition";

const DATA_TEST_TYPE_DEFINITIONS: DataTestTypeDefinitions = {
  transform: transformTestDefinition,
  card: cardTestDefinition,
};

export function getDataTestTypeDefinition<K extends DataTestType>(
  testType: K,
): DataTestTypeDefinition<DataTestByType[K]> {
  return DATA_TEST_TYPE_DEFINITIONS[testType];
}
