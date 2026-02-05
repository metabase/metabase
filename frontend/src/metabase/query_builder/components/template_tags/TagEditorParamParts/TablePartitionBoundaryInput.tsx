import { t } from "ttag";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { ParameterValueWidget } from "metabase/parameters/components/ParameterValueWidget";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Field, TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

export function TablePartitionBoundaryInput({
  tag,
  side,
  onChange,
}: {
  tag: TemplateTag;
  side: "start" | "stop";
  onChange: (value: string | undefined) => void;
}) {
  const fieldId = tag["field-id"];
  const value = tag[side];

  const { data: field = null, isLoading } = useGetFieldQuery(
    fieldId != null ? { id: fieldId } : skipToken,
  );

  const parameter = getFauxParameterFromField({
    tag,
    value,
    side,
    field,
  });

  return (
    <InputContainer>
      <ContainerLabel id={`default-value-label-${tag.id}`}>
        {side === "start" ? t`Partition start` : t`Partition stop`}
      </ContainerLabel>
      <ParameterValueWidget
        disabled={fieldId == null || isLoading}
        parameter={parameter}
        value={value}
        setValue={onChange}
        isEditing
        commitImmediately
        mimicMantine
        placeholder={
          side === "start"
            ? t`Select partition start…`
            : t`Select partition stop…`
        }
      />
    </InputContainer>
  );
}

// Create a mock parameter based on the field type
// so we can reuse the ParameterValueWidget component
function getFauxParameterFromField({
  tag,
  value,
  side,
  field,
}: {
  tag: TemplateTag;
  value: string | undefined;
  side: "start" | "stop";
  field: Field | null;
}): UiParameter {
  return {
    id: `${tag.id}-boundary-${side}`,
    name: side,
    slug: `${tag.id}-${side}`,
    value,
    type: getParameterTypeFromField(field),
    isMultiSelect: false,
  };
}

function getParameterTypeFromField(field: Field | null): string {
  return fieldTypeToParameterTypeMap[field?.base_type ?? ""] ?? "string/=";
}

const fieldTypeToParameterTypeMap: Record<string, string> = {
  "type/*": "string/=",
  "type/Array": "string/=",
  "type/BigInteger": "number/=",
  "type/Boolean": "boolean/=",
  "type/Date": "date/=",
  "type/DateTime": "datetime/=",
  "type/DateTimeWithTZ": "datetime/=",
  "type/DateTimeWithZoneID": "datetime/=",
  "type/Decimal": "number/=",
  "type/Dictionary": "string/=",
  "type/Float": "number/=",
  "type/Instant": "datetime/=",
  "type/Integer": "number/=",
  "type/Number": "number/=",
  "type/Text": "string/=",
  "type/Time": "string/=",
  "type/TimeWithTZ": "string/=",
  "type/UUID": "string/=",
};
