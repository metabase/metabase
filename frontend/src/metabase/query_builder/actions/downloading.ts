import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { getCardKey } from "metabase/visualizations/lib/utils";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import Question from "metabase-lib/Question";

export interface DownloadQueryResultsOpts {
  type: string;
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface DownloadQueryResultsParams {
  method: string;
  url: string;
  params: URLSearchParams;
}

export const downloadQueryResults =
  (opts: DownloadQueryResultsOpts) => async () => {
    if (opts.type === Urls.exportFormatPng) {
      await downloadChart(opts);
    } else {
      await downloadDataset(opts);
    }
  };

const downloadDataset = async (opts: DownloadQueryResultsOpts) => {
  const params = getDatasetParams(opts);
  const response = await getDatasetResponse(params);
  const fileName = getDatasetFileName(response.headers, opts.type);
  const fileContent = await response.blob();
  openSaveDialog(fileName, fileContent);
};

const downloadChart = async ({ question }: DownloadQueryResultsOpts) => {
  const fileName = getChartFileName(question);
  const chartSelector = `[data-card-key='${getCardKey(question.id())}']`;
  await saveChartImage(chartSelector, fileName);
};

const getDatasetParams = ({
  type,
  question,
  dashboardId,
  dashcardId,
  uuid,
  token,
  params = {},
  result,
  visualizationSettings,
}: DownloadQueryResultsOpts): DownloadQueryResultsParams => {
  const cardId = question.id();
  const isSecureDashboardEmbedding = dashcardId != null && token != null;
  if (isSecureDashboardEmbedding) {
    return {
      method: "GET",
      url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`,
      params: new URLSearchParams(Urls.extractQueryParams(params)),
    };
  }

  const isDashboard = dashboardId != null && dashcardId != null;
  if (isDashboard) {
    return {
      method: "POST",
      url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${type}`,
      params: new URLSearchParams({
        parameters: JSON.stringify(result?.json_query?.parameters ?? []),
      }),
    };
  }

  const isPublicQuestion = uuid != null;
  if (isPublicQuestion) {
    return {
      method: "GET",
      url: Urls.publicQuestion(uuid, type),
      params: new URLSearchParams({
        parameters: JSON.stringify(result?.json_query?.parameters ?? []),
      }),
    };
  }

  const isEmbeddedQuestion = token != null;
  if (isEmbeddedQuestion) {
    // For whatever wacky reason the /api/embed endpoint expect params like ?key=value instead
    // of like ?params=<json-encoded-params-array> like the other endpoints do.
    return {
      method: "GET",
      url: Urls.embedCard(token, type),
      params: new URLSearchParams(window.location.search),
    };
  }

  const isSavedQuery = cardId != null;
  if (isSavedQuery) {
    return {
      method: "POST",
      url: `/api/card/${cardId}/query/${type}`,
      params: new URLSearchParams({
        parameters: JSON.stringify(result?.json_query?.parameters ?? []),
      }),
    };
  }

  return {
    url: `/api/dataset/${type}`,
    method: "POST",
    params: new URLSearchParams({
      query: JSON.stringify(_.omit(result?.json_query ?? {}, "constraints")),
      visualization_settings: JSON.stringify(visualizationSettings ?? {}),
    }),
  };
};

const getDatasetResponse = ({
  url,
  method,
  params,
}: DownloadQueryResultsParams) => {
  if (method === "POST") {
    return fetch(url, { method, body: params });
  } else {
    return fetch(`${url}?${params}`);
  }
};

const getDatasetFileName = (headers: Headers, type: string) => {
  const header = headers.get("Content-Disposition") ?? "";
  const headerContent = decodeURIComponent(header);
  const fileNameMatch = headerContent.match(/filename="(?<fileName>.+)"/);

  return (
    fileNameMatch?.groups?.fileName ||
    `query_result_${new Date().toISOString()}.${type}`
  );
};

const getChartFileName = (question: Question) => {
  const name = question.displayName() ?? t`New question`;
  const date = new Date().toLocaleString();
  return `${name}-${date}.png`;
};

const openSaveDialog = (fileName: string, fileContent: Blob) => {
  const url = URL.createObjectURL(fileContent);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();

  URL.revokeObjectURL(url);
  link.remove();
};
