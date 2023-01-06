import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";

export const isValidSourceConfig = (
  sourceType: ValuesSourceType,
  sourceConfig: ValuesSourceConfig,
) => {
  switch (sourceType) {
    case "static-list":
      return sourceConfig.values != null && sourceConfig.values.length > 0;
    default:
      return true;
  }
};

export const getDefaultSourceConfig = (
  sourceType: ValuesSourceType,
  fieldValues: string[][],
) => {
  switch (sourceType) {
    case "static-list":
      return { values: fieldValues.map(([key]) => key) };
    default:
      return {};
  }
};
