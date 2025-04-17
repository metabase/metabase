import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { CopyButton } from "metabase/components/CopyButton";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import {
  getIsDashCardsLoadingComplete,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import type { AIDashboardAnalysisSidebarProps } from "metabase/plugins";
import { Icon } from "metabase/ui";
import { getDashboardImage } from "metabase/visualizations/lib/image-exports";

import { useAnalyzeDashboardMutation } from "../../../api/ai-entity-analysis";
import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIDashboardAnalysisSidebar.module.css";

// TODO: This is a hack to ensure visualizations have rendered after data loading, as they can render asynchronously.
// We should find a better way to do this.
const RENDER_DELAY_MS = 200;

export function AIDashboardAnalysisSidebar({
  dashboard,
  onClose,
}: AIDashboardAnalysisSidebarProps) {
  const [analyzeDashboard, { data: analysisData }] =
    useAnalyzeDashboardMutation();
  const isDashCardsLoadingComplete = useSelector(getIsDashCardsLoadingComplete);
  const parameterValues = useSelector(getParameterValues);
  const selectedTabId = useSelector((state) => state.dashboard.selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);
  const previousTabId = usePrevious(selectedTabId);
  const pendingAnalysisRef = useRef(true);
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousTabId !== undefined && selectedTabId !== previousTabId) {
      pendingAnalysisRef.current = true;
    }
  }, [selectedTabId, previousTabId]);

  useEffect(() => {
    if (!previousParameterValues) {
      return;
    }

    const hasParameterValuesChanged = !_.isEqual(
      parameterValues,
      previousParameterValues,
    );

    if (hasParameterValuesChanged) {
      pendingAnalysisRef.current = true;
    }
  }, [parameterValues, previousParameterValues]);

  useEffect(() => {
    if (!pendingAnalysisRef.current || !isDashCardsLoadingComplete) {
      return;
    }

    analysisTimeoutRef.current = setTimeout(async () => {
      const dashboardSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
      const imageBase64 = await getDashboardImage(dashboardSelector);

      if (imageBase64) {
        await analyzeDashboard({
          imageBase64,
          name: dashboard.name,
          description: dashboard.description ?? undefined,
          tabName:
            dashboard.tabs?.find((tab) => tab.id === selectedTabId)?.name ??
            undefined,
        });
      }

      pendingAnalysisRef.current = false;
      analysisTimeoutRef.current = null;
    }, RENDER_DELAY_MS);

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
    };
  }, [analyzeDashboard, dashboard, isDashCardsLoadingComplete, selectedTabId]);

  return (
    <Sidebar data-testid="dashboard-analysis-sidebar">
      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t`Explain this dashboard`}</h3>
          <div className={styles.actions}>
            {analysisData?.summary && (
              <CopyButton
                value={analysisData.summary}
                className={styles.copyButton}
                aria-label={t`Copy summary`}
              />
            )}
            {onClose && (
              <button
                className={styles.closeButton}
                onClick={onClose}
                aria-label={t`Close`}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        </div>
        <AIAnalysisContent explanation={analysisData?.summary} />
      </div>
    </Sidebar>
  );
}
