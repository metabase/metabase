import { t } from "ttag";
import { TemplateTag } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";
import {
  ID_OPTION,
  OPTIONS_WITH_OPERATOR_SUBTYPES,
  PARAMETER_OPERATOR_TYPES,
} from "../constants";
import { buildTypedOperatorOptions, getOperatorDisplayName } from "./operators";
import { fieldFilterForParameter } from "./filters";

export function getParameterOptions() {
  return [
    ID_OPTION,
    ...OPTIONS_WITH_OPERATOR_SUBTYPES.map(({ type, typeName }) =>
      PARAMETER_OPERATOR_TYPES[type].map(option => ({
        ...option,
        combinedName: getOperatorDisplayName(option, type, typeName),
      })),
    ),
    ...buildTypedOperatorOptions("string", "location", t`Location`),
  ].flat();
}

export function getParameterOptionsForField(field: Field) {
  return getParameterOptions()
    .filter(option => fieldFilterForParameter(option)(field))
    .map(option => {
      return {
        ...option,
        name: "combinedName" in option ? option.combinedName : option.name,
      };
    });
}

export function getDefaultParameterWidgetType(tag: TemplateTag, field: Field) {
  const options = getParameterOptionsForField(field);
  const widgetType = tag["widget-type"];

  if (options.length === 0) {
    return undefined;
  } else if (
    widgetType != null &&
    options.some(option => option.type === widgetType)
  ) {
    return widgetType;
  } else {
    return options[0].type;
  }
}
