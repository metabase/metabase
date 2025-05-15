import type {
  PartialRowActionFieldSettings,
  RowActionFieldSettings,
} from "metabase-types/api";

export const isValidMapping = (
  mapping: PartialRowActionFieldSettings,
): mapping is RowActionFieldSettings => {
  if (mapping.sourceType === "ask-user") {
    return true;
  }

  if (mapping.sourceType === "row-data") {
    return "sourceValueTarget" in mapping && !!mapping.sourceValueTarget;
  }

  if (mapping.sourceType === "constant") {
    return "value" in mapping && mapping.value != null;
  }

  return false;
};
