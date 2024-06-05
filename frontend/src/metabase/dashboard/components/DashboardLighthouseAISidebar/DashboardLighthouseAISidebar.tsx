import type { ThunkDispatch, AnyAction } from "@reduxjs/toolkit";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { isEqual } from "underscore";

import { setDashboardSummary } from "metabase/dashboard/actions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Center, Loader } from "metabase/ui";
import type { DashCardDataMap, Dashboard } from "metabase-types/api";
import type {
  DashboardSummary,
  SelectedTabId,
  State,
} from "metabase-types/store";

import {
  DashboardInfoSidebarRoot,
  ContentSection,
  DescriptionHeader,
} from "../DashboardInfoSidebar/DashboardInfoSidebar.styled";

import {
  ChartTitle,
  Disclaimer,
  InsightDescription,
  InsightReferences,
  InsightTitle,
} from "./DashboardLighthouseAISidebar.styled";

type DashboardAttributeType = string | number | null | boolean;

interface DashboardLighthouseAISidebarProps {
  dashboard: Dashboard;
  dashcardData: DashCardDataMap;
  selectedTabId: SelectedTabId;
  parameterValues: object;
  setDashboardAttribute: (name: string, value: DashboardAttributeType) => void;
}

const UNSUPPORTED = "Dashboard Summarizer not supported in non-embedded mode.";
const LOADING = "Loading dashboard ...";
const FAILED =
  "We encountered an error while running the analysis. Please try again later.";
const RUNNING = "Analyzing dashboad ... Please wait, this may take a moment.";

function isDashboardLoaded(
  dashboard: Dashboard,
  dashcardData: DashCardDataMap,
  selectedTabId: SelectedTabId,
) {
  return dashboard.dashcards.every(dashcard => {
    if (selectedTabId && selectedTabId !== dashcard.dashboard_tab_id) {
      return true;
    }
    const card_ids = [];
    if (dashcard.card_id) {
      card_ids.push(dashcard.card_id);
    }
    if ("series" in dashcard) {
      dashcard.series?.every(card => {
        card_ids.push(card.id);
      });
    }
    return card_ids.every(
      card_id =>
        card_id in dashcardData[dashcard.id] &&
        dashcardData[dashcard.id][card_id],
    );
  });
}

function getMessageHandler(
  dashboardId: number,
  selectedTabId: SelectedTabId,
  parameterValues: object,
  dispatch: ThunkDispatch<State, void, AnyAction>,
  setFailed: Dispatch<SetStateAction<boolean>>,
) {
  return (event: any) => {
    if (
      event &&
      event.source === window.parent &&
      event.data?.lighthouse?.type === "DashboardSummarizer" &&
      event.data?.lighthouse?.payload?.dashboard_id === dashboardId &&
      event.data?.lighthouse?.payload?.tab_id === selectedTabId &&
      isEqual(
        event.data?.lighthouse?.payload?.parameter_values,
        parameterValues,
      )
    ) {
      const { summary, error } = event.data.lighthouse.payload;
      if (error) {
        setFailed(true);
      } else {
        dispatch(setDashboardSummary({ tabId: selectedTabId ?? -1, summary }));
      }
    }
  };
}

function DashboardSummaryDisplay({ insights, text }: DashboardSummary) {
  const hasInsights = insights && insights.length > 0;
  return (
    <div>
      <DescriptionHeader>Dashboard Summary</DescriptionHeader>
      {hasInsights && (
        <ol style={{ listStyleType: "decimal", paddingLeft: "10px" }}>
          {insights?.map((insight, insightIndex) => {
            return (
              <li
                key={`dashboard-summary-insight-${insightIndex}`}
                style={{ marginTop: "0.75em", marginBottom: "0.75em" }}
              >
                {insight.title && <InsightTitle>{insight.title}</InsightTitle>}
                <InsightDescription>{insight.description}</InsightDescription>
                {insight.sourceCharts && insight.sourceCharts.length > 0 && (
                  <InsightReferences>
                    Sources:
                    {insight.sourceCharts.map((title, chartIndex) => {
                      return (
                        <ChartTitle
                          key={`dashboard-summary-insight-${insightIndex}-source-chart-${chartIndex}`}
                        >
                          {chartIndex < (insight.sourceCharts?.length ?? 0) - 1
                            ? `${title},`
                            : title}
                        </ChartTitle>
                      );
                    })}
                  </InsightReferences>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!hasInsights && (text ?? FAILED)}
      {(hasInsights || text) && (
        <Disclaimer>
          Lighthouse AI may display inaccurate info, so double-check its
          responses.
        </Disclaimer>
      )}
    </div>
  );
}

export function DashboardLighthouseAISidebar({
  dashboard,
  dashcardData,
  selectedTabId,
  parameterValues,
}: DashboardLighthouseAISidebarProps) {
  const dashboardSummary = useSelector(
    state => state.dashboard.dashboardSummaries[selectedTabId ?? -1],
  );
  const dispatch = useDispatch();

  const embedded = window.parent !== window;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (embedded) {
      if (isDashboardLoaded(dashboard, dashcardData, selectedTabId)) {
        setLoaded(true);
        if (!failed && !dashboardSummary) {
          const messageData = {
            lighthouse: {
              type: "DashboardSummarizer",
              payload: {
                dashboard,
                dashcardData,
                selectedTabId,
                parameterValues,
              },
            },
          };
          window.parent.postMessage(messageData, "*");
        }
      } else {
        setLoaded(false);
      }
    }
  }, [
    dashboard,
    dashcardData,
    selectedTabId,
    parameterValues,
    embedded,
    failed,
    dashboardSummary,
  ]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messageHandler = useCallback(
    getMessageHandler(
      Number(dashboard.id),
      selectedTabId,
      parameterValues,
      dispatch,
      setFailed,
    ),
    [dashboard.id, selectedTabId, parameterValues, dispatch, setFailed],
  );

  useEffect(() => {
    window.addEventListener("message", messageHandler);

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [messageHandler]);

  const [isReady, statusMessage] = (() => {
    if (!embedded) {
      return [false, UNSUPPORTED];
    }
    if (!loaded) {
      return [false, LOADING];
    }
    if (failed) {
      return [false, FAILED];
    }
    if (!dashboardSummary) {
      return [false, RUNNING];
    }
    return [true];
  })();

  return (
    <DashboardInfoSidebarRoot data-testid="sidebar-right">
      <ContentSection>
        {!isReady && statusMessage}
        {!isReady && (statusMessage === LOADING || statusMessage === RUNNING) && (
          <Center>
            <Loader size={"xl"} />
          </Center>
        )}
        {isReady && (
          <DashboardSummaryDisplay
            insights={dashboardSummary.insights}
            text={dashboardSummary.text}
          />
        )}
      </ContentSection>
    </DashboardInfoSidebarRoot>
  );
}
