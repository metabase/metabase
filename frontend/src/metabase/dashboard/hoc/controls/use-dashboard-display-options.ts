import { useState } from "react";

import type { DashboardFullscreenControls } from "metabase/dashboard/hoc/controls/use-dashboard-fullscreen";
import { useDashboardFullscreen } from "metabase/dashboard/hoc/controls/use-dashboard-fullscreen";
import type { DashboardRefreshPeriodControls } from "metabase/dashboard/hoc/controls/use-dashboard-refresh-period";
import { useDashboardRefreshPeriod } from "metabase/dashboard/hoc/controls/use-dashboard-refresh-period";
import type { DashboardThemeControls } from "metabase/dashboard/hoc/controls/use-dashboard-theme";
import { useDashboardTheme } from "metabase/dashboard/hoc/controls/use-dashboard-theme";
import { isWithinIframe } from "metabase/lib/dom";

type UseDashboardDisplayOptionsProps = {
  onRefresh: () => Promise<void>;
};

export type DashboardBorderControls = {
  bordered: boolean;
  setBordered: (bordered: boolean) => void;
};

export type DashboardTitledControls = {
  titled: boolean;
  setTitled: (titled: boolean) => void;
};

export type DashboardHideDownloadButtonControls = {
  hideDownloadButton: boolean;
  setHideDownloadButton: (hideDownloadButton: boolean) => void;
};

export type DashboardHideParametersControls = {
  hideParameters: string | null;
  setHideParameters: (hideParameters: string | null) => void;
};

export type DashboardDisplayOptionControls = DashboardFullscreenControls &
  DashboardThemeControls &
  DashboardRefreshPeriodControls &
  DashboardBorderControls &
  DashboardTitledControls &
  DashboardHideDownloadButtonControls &
  DashboardHideParametersControls;

export function useDashboardDisplayOptions({
  onRefresh,
}: UseDashboardDisplayOptionsProps): DashboardDisplayOptionControls {
  const [bordered, setBordered] = useState<boolean>(isWithinIframe());
  const [titled, setTitled] = useState(true);
  const [hideDownloadButton, setHideDownloadButton] = useState(false);

  const [hideParameters, setHideParameters] = useState<string | null>(null);

  return {
    ...useDashboardFullscreen(),
    ...useDashboardTheme(),
    ...useDashboardRefreshPeriod({ onRefresh }),
    bordered,
    setBordered,
    titled,
    setTitled,
    hideDownloadButton,
    setHideDownloadButton,
    hideParameters,
    setHideParameters,
  };
}
