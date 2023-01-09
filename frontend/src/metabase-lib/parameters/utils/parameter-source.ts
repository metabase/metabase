import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";

export const isValidSourceConfig = (
  sourceType: ValuesSourceType,
  sourceConfig: ValuesSourceConfig,
) => {
  switch (sourceType) {
    case "card":
      return sourceConfig.card_id != null && sourceConfig.value_field != null;
    case "static-list":
      return sourceConfig.values != null && sourceConfig.values.length > 0;
    default:
      return true;
  }
};

export const getDefaultSourceConfig = (
  sourceType: ValuesSourceType,
  sourceValues?: string[],
) => {
  switch (sourceType) {
    case "static-list":
      return { values: sourceValues };
    default:
      return {};
  }
};
