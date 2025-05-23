import { useField } from "formik";
import { useEffect, useMemo } from "react";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { FormSelect, type FormSelectProps } from "metabase/forms";
import type { DashboardId } from "metabase-types/api";

export const FormDashboardTabSelect = ({
  dashboardId,
  styles,
  ...props
}: { dashboardId: DashboardId | null | undefined } & Omit<
  FormSelectProps,
  "data"
>) => {
  const dashboardTabField = useField(props.name);
  const dashboardTabHelpers = dashboardTabField[2];

  const { currentData } = useGetDashboardQuery(
    dashboardId ? { id: dashboardId } : skipToken,
  );

  useEffect(
    function updateDefaultTabOnDashboardChange() {
      const firstTabId = currentData?.tabs?.length
        ? String(currentData.tabs[0].id)
        : undefined;
      dashboardTabHelpers.setValue(firstTabId);
    },
    [currentData, dashboardTabHelpers],
  );

  const options = useMemo(() => {
    return (
      currentData?.tabs?.map((tab) => ({
        label: tab.name,
        value: `${tab.id}`,
      })) ?? []
    );
  }, [currentData]);

  const showTabSelect = options.length > 1;

  if (!showTabSelect) {
    return null;
  }

  return (
    <FormSelect
      {...props}
      styles={{
        ...(styles ?? {}),
        wrapper: { marginBottom: "1.25rem" },
      }}
      data={options}
    />
  );
};
