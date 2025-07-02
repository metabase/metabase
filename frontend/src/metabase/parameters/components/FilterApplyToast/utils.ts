import { msgid, ngettext } from "ttag";
import _ from "underscore";

function isParameterValueEmpty(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

export function getFilterChangeDescription(
  currentValues: Record<string, unknown>,
  draftValues: Record<string, unknown>,
): string {
  let added = 0;
  let removed = 0;
  let updated = 0;

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
      added++;
    } else if (!isCurrentEmpty && isDraftEmpty) {
      removed++;
    } else if (
      !isCurrentEmpty &&
      !isDraftEmpty &&
      !_.isEqual(currentValue, draftValue)
    ) {
      updated++;
    }
  }

  const changes = [];
  if (added > 0) {
    changes.push(
      ngettext(msgid`${added} filter added`, `${added} filters added`, added),
    );
  }
  if (updated > 0) {
    changes.push(
      ngettext(
        msgid`${updated} filter updated`,
        `${updated} filters updated`,
        updated,
      ),
    );
  }
  if (removed > 0) {
    changes.push(
      ngettext(
        msgid`${removed} filter removed`,
        `${removed} filters removed`,
        removed,
      ),
    );
  }

  return changes.join(", ");
}
