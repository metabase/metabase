import { useCallback } from "react";
import { t } from "ttag";

import { applyDraftParameterValues } from "metabase/dashboard/actions";
import { resetParameters } from "metabase/dashboard/actions/parameters";
import {
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Group, Notification, Text } from "metabase/ui";
import { NotificationButton } from "metabase/ui/components/buttons/NotificationButton";

export function FilterApplyToast() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const hasUnappliedParameterValues = useSelector(
    getHasUnappliedParameterValues,
  );

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
      <Text c="var(--mb-color-text-white)">{t`N filter added`}</Text>
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
