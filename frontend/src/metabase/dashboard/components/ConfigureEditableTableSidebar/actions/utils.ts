import { t } from "ttag";

import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
import type {
  PartialRowActionFieldSettings,
  RowActionFieldSettings,
  RowActionFieldSourceType,
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

export const getDefaultSourceTypeOptions =
  (): SelectData<RowActionFieldSourceType> => {
    return [
      {
        label: t`Ask the user`,
        value: "ask-user",
      },
      {
        label: t`Get data from a row`,
        value: "row-data",
      },
      {
        label: t`Use constant value`,
        value: "constant",
      },
    ];
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
