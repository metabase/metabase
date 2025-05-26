import { t } from "ttag";

import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import type {
  PartialRowActionFieldSettings,
  RowActionFieldSettings,
} from "metabase-types/api";

export const isValidMapping = (
  mapping: PartialRowActionFieldSettings,
  tableColumns: BasicTableViewColumn[],
): mapping is RowActionFieldSettings => {
  if (mapping.sourceType === "ask-user") {
    return true;
  }

  if (mapping.sourceType === "row-data") {
    return (
      "sourceValueTarget" in mapping &&
      !!mapping.sourceValueTarget &&
      !!tableColumns.find(({ name }) => name === mapping.sourceValueTarget)
    );
  }

  if (mapping.sourceType === "constant") {
    return "value" in mapping && mapping.value != null;
  }

  return false;
};

export const getFieldFlagsCaption = ({
  isRequired,
  isHidden,
}: {
  isRequired: boolean;
  isHidden: boolean;
}) => {
  return [isRequired ? t`required` : "", isHidden ? t`hidden` : ""]
    .filter(Boolean)
    .join(", ");
};

export const cleanEmptyVisibility = (
  parameters: RowActionFieldSettings[],
): RowActionFieldSettings[] => {
  return parameters.map((parameter) => {
    if (parameter.sourceType === "ask-user" && "visibility" in parameter) {
      const copy = { ...parameter };

      delete copy.visibility;

      return copy;
    }

    return parameter;
  });
};
