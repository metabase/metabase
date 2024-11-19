import { t } from "ttag";

import type Field from "metabase-lib/v1/metadata/Field";
import type { ParameterOptions, TemplateTag } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import {
  ID_OPTION,
  OPTIONS_WITH_OPERATOR_SUBTYPES,
  PARAMETER_OPERATOR_TYPES,
} from "../constants";

import { fieldFilterForParameter } from "./filters";
import {
  buildTypedOperatorOptions,
  deriveFieldOperatorFromParameter,
  getOperatorDisplayName,
} from "./operators";
import { getTemplateTagParameter } from "./template-tags";

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
    .filter(option =>
      fieldFilterForParameter(createMockParameter(option))(field),
    )
    .map(option => {
      return {
        ...option,
        name: "combinedName" in option ? option.combinedName : option.name,
      };
    });
}

function fallbackParameterWidgetType(tag: TemplateTag): "none" | undefined {
  return tag.type === "dimension" ? "none" : undefined;
}

export function getDefaultParameterWidgetType(tag: TemplateTag, field: Field) {
  const options = getParameterOptionsForField(field);
  if (options.length === 0) {
    return fallbackParameterWidgetType(tag);
  }

  const widgetType = tag["widget-type"];
  if (
    widgetType != null &&
    widgetType !== "none" &&
    options.some(option => option.type === widgetType)
  ) {
    return widgetType;
  }

  const distinctCount = field.fingerprint?.global?.["distinct-count"];
  if (
    distinctCount != null &&
    distinctCount > 20 &&
    options.some(option => option.type === "string/contains")
  ) {
    return "string/contains";
  }

  return options[0].type;
}

export function getDefaultParameterOptions(
  tag: TemplateTag,
): ParameterOptions | undefined {
  const parameter = getTemplateTagParameter(tag);
  const operator = deriveFieldOperatorFromParameter(parameter);
  return operator?.optionsDefaults;
}
