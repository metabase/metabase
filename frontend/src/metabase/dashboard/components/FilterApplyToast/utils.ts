import { msgid, ngettext } from "ttag";
import _ from "underscore";

function isParameterValueEmpty(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

export function getFilterChangeDescription(
  currentValues: Record<string, unknown>,
  draftValues: Record<string, unknown>,
): string {
  let changedCount = 0;

  const allParameterIds = _.union(
    Object.keys(currentValues),
    Object.keys(draftValues),
  );

  for (const parameterId of allParameterIds) {
    const currentValue = currentValues[parameterId];
    const draftValue = draftValues[parameterId];

    const isCurrentEmpty = isParameterValueEmpty(currentValue);
    const isDraftEmpty = isParameterValueEmpty(draftValue);

    if (isCurrentEmpty && !isDraftEmpty) {
      // Filter was added
      changedCount++;
    } else if (!isCurrentEmpty && isDraftEmpty) {
      // Filter was removed
      changedCount++;
    } else if (
      !isCurrentEmpty &&
      !isDraftEmpty &&
      !_.isEqual(currentValue, draftValue)
    ) {
      // Filter was updated
      changedCount++;
    }
  }

  if (changedCount === 0) {
    return "";
  }

  return ngettext(
    msgid`${changedCount} filter changed`,
    `${changedCount} filters changed`,
    changedCount,
  );
}
