import type {
  StandardFormFieldDefinition,
  CustomFormFieldDefinition,
  FormFieldDefinition,
} from "metabase-types/forms/legacy";

export function isCustomWidget(
  formField: FormFieldDefinition,
): formField is CustomFormFieldDefinition {
  return (
    !(formField as StandardFormFieldDefinition).type &&
    typeof (formField as CustomFormFieldDefinition).widget === "function"
  );
}
