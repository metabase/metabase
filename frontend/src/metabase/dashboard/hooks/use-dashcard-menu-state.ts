import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";

import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useUserKeyValue } from "metabase/hooks/use-user-key-value";
import { useStore } from "metabase/lib/redux";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { canSavePng } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type {
  Dashboard,
  DashboardCard,
  Dataset,
  Series,
} from "metabase-types/api";

export function useDashcardMenuState({
  question,
  dashboard,
  dashcard,
  series,
}: {
  question: Question | null;
  dashboard: Dashboard;
  dashcard: DashboardCard;
  series: Series;
}) {
  const store = useStore();
  const [menuView, setMenuView] = useState<string | null>(null);
  const [isOpen, { close, toggle }] = useDisclosure(false, {
    onClose: () => setMenuView(null),
  });

  const token = useMemo(
    () =>
      dashcard && isJWT(dashcard.dashboard_id)
        ? String(dashcard.dashboard_id)
        : undefined,
    [dashcard],
  );

  const uuid = useMemo(
    () =>
      dashcard && isUuid(dashcard.dashboard_id)
        ? String(dashcard.dashboard_id)
        : undefined,
    [dashcard],
  );

  const canDownloadPng = question && canSavePng(question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const { value: formatPreference, setValue: setFormatPreference } =
    useUserKeyValue({
      namespace: "last_download_format",
      key: "download_format_preference",
      defaultValue: {
        last_download_format: formats[0],
        last_table_download_format: exportFormats[0],
      },
    });

  const result = series[0] as unknown as Dataset;
  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId: dashboard.id,
    dashcardId: dashcard.id,
    uuid,
    token,
    params: getParameterValuesBySlugMap(store.getState()),
  });

  return {
    menuView,
    setMenuView,
    isOpen,
    close,
    toggle,
    formatPreference,
    setFormatPreference,
    isDownloadingData,
    handleDownload,
    result,
  };
}
