import { t } from "ttag";

import { areParameterValuesIdentical } from "metabase-lib/v1/parameters/utils/parameter-values";

const UPDATE = t`Update filter`;
const ADD = t`Add filter`;
const RESET = t`Set to default`;

/**
 * This is used to show the correct button when picking filter values.
 * Since the label and disable state depend on current value, unsaved value,
 * default value and whether a parameter is required or not, the logic is
 * a bit more sophisticated that we would like it to be.
 *
 * See tests for a better explanation.
 */
export function getUpdateButtonProps(
  value: unknown,
  unsavedValue: unknown,
  defaultValue?: unknown,
  required?: boolean,
): { label: string; isDisabled: boolean } {
  if (required) {
    return {
      label:
        !hasValue(unsavedValue) ||
        areParameterValuesIdentical(unsavedValue, defaultValue)
          ? RESET
          : UPDATE,
      isDisabled:
        areParameterValuesIdentical(unsavedValue, value) &&
        hasValue(unsavedValue),
    };
  }

  if (hasValue(defaultValue)) {
    return {
      label: areParameterValuesIdentical(unsavedValue, defaultValue)
        ? RESET
        : UPDATE,
      isDisabled: areParameterValuesIdentical(value, unsavedValue),
    };
  }

  return {
    label: hasValue(value) ? UPDATE : ADD,
    isDisabled: areParameterValuesIdentical(value, unsavedValue),
  };
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value != null;
}
