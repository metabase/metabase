import { t } from "ttag";

import { areParameterValuesIdentical } from "metabase-lib/v1/parameters/utils/parameter-values";

const getUpdateLabel = () => t`Update filter`;
const getAddLabel = () => t`Add filter`;
const getResetLabel = () => t`Set to default`;

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
  const isDefaultValue = areParameterValuesIdentical(
    unsavedValue,
    defaultValue,
  );
  const isEmpty = !hasValue(unsavedValue);
  const isUnchanged = areParameterValuesIdentical(value, unsavedValue);

  if (required) {
    if (isDefaultValue || isEmpty) {
      return {
        label: getResetLabel(),
        isDisabled: isUnchanged,
      };
    }

    return {
      label: getUpdateLabel(),
      isDisabled: isUnchanged,
    };
  }

  if (hasValue(defaultValue)) {
    return {
      label: isDefaultValue ? getResetLabel() : getUpdateLabel(),
      isDisabled: isUnchanged,
    };
  }

  return {
    label: hasValue(value) ? getUpdateLabel() : getAddLabel(),
    isDisabled: isUnchanged,
  };
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value != null;
}
