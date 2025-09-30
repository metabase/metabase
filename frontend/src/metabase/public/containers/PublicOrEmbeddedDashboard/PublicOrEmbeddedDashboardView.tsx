import cx from "classnames";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Dashboard } from "metabase/dashboard/components/Dashboard";
import { DashboardHeaderButtonRow } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardHeaderButtonRow";
import { useDashboardContext } from "metabase/dashboard/context";
import { SetTitle } from "metabase/hoc/Title";
import { isWithinIframe } from "metabase/lib/dom";
import { getTabHiddenParameterSlugs } from "metabase/public/lib/tab-parameters";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

import { EmbedFrame } from "../../components/EmbedFrame";

export function PublicOrEmbeddedDashboardView() {
  const {
    setParameterValue,
    setParameterValueToDefault,
    dashboard,
    isFullscreen,
    selectedTabId,
    parameters,
    headerParameters,
    parameterValues,
    draftParameterValues,
    dashboardId,
    background,
    bordered,
    titled,
    hideParameters,
    withFooter,
    downloadsEnabled,
  } = useDashboardContext();

  const buttons = !isWithinIframe() ? (
    <DashboardHeaderButtonRow
      canResetFilters={false}
      onResetFilters={_.noop}
      isPublic={true}
    />
  ) : null;

  const dashboardHasTabs = dashboard?.tabs && dashboard.tabs.length > 1;
  const hasVisibleParameters =
    headerParameters.filter((p) => !p.hidden).length > 0;

  const hiddenParameterSlugs = getTabHiddenParameterSlugs({
    parameters,
    dashboard,
    selectedTabId,
  });

  const isCompactHeader = !titled && !hasVisibleParameters && !dashboardHasTabs;

  return (
    <EmbedFrame
      name={dashboard && dashboard.name}
      description={dashboard && dashboard.description}
      dashboard={dashboard}
      parameters={headerParameters}
      parameterValues={parameterValues}
      draftParameterValues={draftParameterValues}
      hiddenParameterSlugs={hiddenParameterSlugs}
      setParameterValue={setParameterValue}
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior
      actionButtons={buttons ? <div className={CS.flex}>{buttons}</div> : null}
      dashboardTabs={dashboardId && dashboardHasTabs && <Dashboard.Tabs />}
      background={background}
      bordered={bordered}
      titled={titled}
      hide_parameters={hideParameters}
      pdfDownloadsEnabled={downloadsEnabled.pdf}
      withFooter={withFooter}
    >
      {dashboard && <SetTitle title={dashboard.name} />}
      <FullWidthContainer
        className={cx({
          [DashboardS.DashboardFullscreen]: isFullscreen,
        })}
        mt={isCompactHeader ? "xs" : "sm"}
      >
        <Dashboard.Grid />
      </FullWidthContainer>
    </EmbedFrame>
  );
}
