import { useCallback } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { applyDraftParameterValues } from "metabase/dashboard/actions";
import { resetParameters } from "metabase/dashboard/actions/parameters";
import {
  getDraftParameterValues,
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Notification, Text } from "metabase/ui";
import { NotificationButton } from "metabase/ui/components/buttons/NotificationButton";

function isParameterValueEmpty(value: any): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

function getFilterChangeDescription(
  currentValues: Record<string, any>,
  draftValues: Record<string, any>,
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

export function FilterApplyToast() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const hasUnappliedParameterValues = useSelector(
    getHasUnappliedParameterValues,
  );
  const currentParameterValues = useSelector(getParameterValues);
  const draftParameterValues = useSelector(getDraftParameterValues);

  const dispatch = useDispatch();
  const handleApplyFilters = useCallback(() => {
    dispatch(applyDraftParameterValues());
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    dispatch(resetParameters());
  }, [dispatch]);

  if (isAutoApplyFilters || !hasUnappliedParameterValues) {
    return null;
  }

  const filterChangeDescription = getFilterChangeDescription(
    currentParameterValues,
    draftParameterValues,
  );

  const titleWithButtons = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        minHeight: "32px",
      }}
    >
      <Text c="var(--mb-color-text-white)">{filterChangeDescription}</Text>
      <Group>
        <NotificationButton onClick={handleCancel}>
          {t`Cancel`}
        </NotificationButton>
        <NotificationButton onClick={handleApplyFilters}>
          {t`Apply filter`}
        </NotificationButton>
      </Group>
    </div>
  );

  return (
    <Notification
      title={titleWithButtons}
      withCloseButton={false}
      style={{
        position: "fixed",
        bottom: "20px",
        margin: "0 auto",
        zIndex: 1000,
      }}
    />
  );
}
