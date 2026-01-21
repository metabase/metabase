import { type ReactNode, useEffect } from "react";
import { t } from "ttag";

import { useSdkInternalNavigationBack } from "embedding-sdk-bundle/hooks/private/use-sdk-internal-navigation-back";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { initSdkInternalNavigation } from "embedding-sdk-bundle/store/reducer";
import {
  getCurrentInternalNavEntry,
  getInternalNavigationStack,
} from "embedding-sdk-bundle/store/selectors";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { Button, Icon } from "metabase/ui";

import { InteractiveQuestion } from "../public/InteractiveQuestion";
import {
  SdkDashboard,
  type SdkDashboardInnerProps,
} from "../public/dashboard/SdkDashboard";

type Props = {
  children: ReactNode;
  dashboardProps?: Partial<Omit<SdkDashboardInnerProps, "dashboardId">>;
};

const SdkInternalNavigationBackButton = () => {
  const { previousName, canGoBack, goBack } = useSdkInternalNavigationBack();

  if (!canGoBack) {
    return null;
  }

  return (
    <Button
      variant="subtle"
      color="text-secondary"
      size="sm"
      leftSection={<Icon name="chevronleft" />}
      onClick={goBack}
      style={{ marginBottom: 8 }}
    >
      {t`Back to ${previousName}`}
    </Button>
  );
};

export const SdkInternalNavigationProvider = ({
  children,
  dashboardProps,
}: Props) => {
  const dispatch = useSdkDispatch();
  const stack = useSdkSelector(getInternalNavigationStack);
  const currentEntry = useSdkSelector(getCurrentInternalNavEntry);

  // Get the current dashboard to init with the real name
  const dashboard = useSdkSelector(getDashboardComplete);

  // Init once the dashboard loads so we have the real name
  useEffect(() => {
    if (dashboard?.id != null && dashboard?.name && stack.length === 0) {
      dispatch(
        initSdkInternalNavigation({
          type: "dashboard",
          id:
            typeof dashboard.id === "number"
              ? dashboard.id
              : parseInt(String(dashboard.id), 10),
          name: dashboard.name,
        }),
      );
    }
  }, [dashboard?.id, dashboard?.name, stack.length, dispatch]);

  // If stack is empty or only has initial entry, render children
  if (stack.length <= 1) {
    return <>{children}</>;
  }

  // Otherwise, render the current navigation target with back button
  if (currentEntry?.type === "dashboard") {
    return (
      <div style={{ height: "100%" }}>
        <SdkInternalNavigationBackButton />
        <SdkDashboard
          {...dashboardProps}
          dashboardId={currentEntry.id}
          initialParameters={currentEntry.parameters}
        />
      </div>
    );
  }

  if (currentEntry?.type === "question") {
    return (
      <div style={{ height: "100%" }}>
        <SdkInternalNavigationBackButton />
        <InteractiveQuestion questionId={currentEntry.id} />
      </div>
    );
  }

  return <>{children}</>;
};
